/**
 * A connection is read serially, so a handler that never settles must not be
 * allowed to hold it. These tests drive a GIOPServer over a real socket and
 * assert that a stuck operation is answered and the connection keeps serving.
 */

import { assertEquals } from "@std/assert";
import { GIOPServer } from "../../src/giop/transport.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { ReplyStatusType } from "../../src/giop/types.ts";
import { CompletionStatus } from "../../src/core/exceptions/system.ts";
import { CDRInputStream } from "../../src/core/cdr/index.ts";
import type { ConnectionManager } from "../../src/giop/connection.ts";

const V12 = { major: 1, minor: 2 };
const encoder = new TextEncoder();

/** The server does not consult the connection manager for inbound requests. */
const NO_CONNECTION_MANAGER = undefined as unknown as ConnectionManager;

/** A reply, decoded far enough to assert what the client would actually read. */
interface Reply {
  id: number;
  status: number;
  /** Present only on a SYSTEM_EXCEPTION reply. */
  exception?: { id: string; minor: number; completed: number };
}

/** Encode a minimal GIOP 1.2 request for `operation`. */
function request(id: number, operation: string): Uint8Array {
  const req = new GIOPRequest(V12);
  req.requestId = id;
  req.responseExpected = true;
  req.operation = operation;
  req.body = new Uint8Array(0);
  req.serviceContext = [];
  req.target = { disposition: 0, objectKey: encoder.encode("obj") };
  return req.serialize(null);
}

/**
 * Collect replies, decoding the system-exception payload where there is one.
 *
 * Asserting only on reply status would let the exception body drift unnoticed,
 * and the body is what tells a client whether retrying is safe.
 */
function collectReplies(conn: Deno.Conn, into: Reply[]): void {
  (async () => {
    const buf = new Uint8Array(4096);
    let acc = new Uint8Array(0);
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      const merged = new Uint8Array(acc.length + n);
      merged.set(acc);
      merged.set(buf.subarray(0, n), acc.length);
      acc = merged;

      while (acc.length >= 12) {
        const littleEndian = (acc[6] & 0x01) !== 0;
        const size = new DataView(acc.buffer, acc.byteOffset + 8, 4).getUint32(0, littleEndian);
        if (acc.length < 12 + size) break;

        const message = acc.slice(0, 12 + size);
        const reply = new GIOPReply(V12);
        // Body-relative stream, matching how IIOPConnection decodes an inbound reply.
        reply.deserialize(new CDRInputStream(message.subarray(12), littleEndian), 12);

        const decoded: Reply = { id: reply.requestId, status: reply.replyStatus };
        if (reply.replyStatus === ReplyStatusType.SYSTEM_EXCEPTION) {
          const body = new CDRInputStream(reply.body, littleEndian);
          decoded.exception = {
            id: body.readString(),
            minor: body.readULong(),
            completed: body.readULong(),
          };
        }
        into.push(decoded);
        acc = acc.subarray(12 + size);
      }
    }
  })().catch((err) => {
    if (!(err instanceof Deno.errors.BadResource) && !(err instanceof Deno.errors.Interrupted)) {
      console.error("reply collector failed:", err);
    }
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A server that answers "ping" immediately and never answers "hang", on an
 * OS-assigned port so concurrent runs cannot collide.
 */
async function startServer(
  handlerTimeoutMs: number,
  unboundedOperations?: Iterable<string>,
): Promise<{ server: GIOPServer; port: number }> {
  const server = new GIOPServer({ host: "127.0.0.1", port: 0 }, NO_CONNECTION_MANAGER, {
    handlerTimeoutMs,
    unboundedOperations,
  });
  server.registerHandler("*", (req: GIOPRequest) => {
    if (req.operation === "hang" || req.operation === "blocksByDesign") {
      return new Promise<GIOPReply>(() => {});
    }
    const reply = new GIOPReply(V12);
    reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
    reply.body = new Uint8Array(0);
    return Promise.resolve(reply);
  });
  await server.start();
  const port = server.getAddress()?.port;
  if (port === undefined) throw new Error("server did not report an address");
  return { server, port };
}

Deno.test("a stuck handler is answered and the connection keeps serving", async () => {
  const { server, port } = await startServer(500);
  const conn = await Deno.connect({ hostname: "127.0.0.1", port });
  const replies: Reply[] = [];
  collectReplies(conn, replies);

  await conn.write(request(1, "ping"));
  await conn.write(request(2, "hang"));
  await conn.write(request(3, "ping"));
  await conn.write(request(4, "ping"));
  await sleep(1500);

  assertEquals(replies.map((r) => r.id), [1, 2, 3, 4], "every request is answered");
  assertEquals(
    replies.filter((r) => r.id !== 2).every((r) => r.status === ReplyStatusType.NO_EXCEPTION),
    true,
    "requests behind it are served normally",
  );

  conn.close();
  await server.stop();
  await sleep(50);
});

Deno.test("the timeout reply says the operation may still have run", async () => {
  const { server, port } = await startServer(500);
  const conn = await Deno.connect({ hostname: "127.0.0.1", port });
  const replies: Reply[] = [];
  collectReplies(conn, replies);

  await conn.write(request(1, "hang"));
  await sleep(1500);

  const stuck = replies.find((r) => r.id === 1);
  assertEquals(stuck?.status, ReplyStatusType.SYSTEM_EXCEPTION);
  assertEquals(stuck?.exception?.id, "IDL:omg.org/CORBA/TIMEOUT:1.0");
  assertEquals(stuck?.exception?.minor, 0);

  // The abandoned handler is still running and may well finish, so the server cannot claim the
  // operation did not execute. COMPLETED_NO would invite a client to retry a non-idempotent
  // operation — a print, say — that is at that moment still in flight.
  assertEquals(
    stuck?.exception?.completed,
    CompletionStatus.COMPLETED_MAYBE,
    "a timed out operation is COMPLETED_MAYBE, never COMPLETED_NO",
  );

  conn.close();
  await server.stop();
  await sleep(50);
});

Deno.test("an operation named as unbounded is never cut off", async () => {
  const { server, port } = await startServer(300, ["blocksByDesign"]);

  // Each on its own connection: an operation exempted from the deadline holds the connection it
  // arrives on for as long as it runs, because a connection is served serially. That is the cost
  // of an exemption, and the reason the set should stay small.
  const exempt = await Deno.connect({ hostname: "127.0.0.1", port });
  const exemptReplies: Reply[] = [];
  collectReplies(exempt, exemptReplies);
  await exempt.write(request(1, "blocksByDesign"));

  const bounded = await Deno.connect({ hostname: "127.0.0.1", port });
  const boundedReplies: Reply[] = [];
  collectReplies(bounded, boundedReplies);
  await bounded.write(request(2, "hang"));

  await sleep(1200); // four times the deadline

  assertEquals(exemptReplies, [], "the exempt operation is left running, not cut off");
  assertEquals(boundedReplies.map((r) => r.id), [2], "an operation outside the set is still bounded");
  assertEquals(boundedReplies[0]?.status, ReplyStatusType.SYSTEM_EXCEPTION);

  exempt.close();
  bounded.close();
  await server.stop();
  await sleep(50);
});

Deno.test("a healthy connection is unaffected by the deadline", async () => {
  const { server, port } = await startServer(500);
  const conn = await Deno.connect({ hostname: "127.0.0.1", port });
  const replies: Reply[] = [];
  collectReplies(conn, replies);

  for (const id of [1, 2, 3]) await conn.write(request(id, "ping"));
  await sleep(300);

  assertEquals(replies.map((r) => r.id), [1, 2, 3]);
  assertEquals(replies.every((r) => r.status === ReplyStatusType.NO_EXCEPTION), true);

  conn.close();
  await server.stop();
  await sleep(50);
});
