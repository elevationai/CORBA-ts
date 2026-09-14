/**
 * A connection is read serially, so a handler that never settles must not be
 * allowed to hold it. These tests drive a GIOPServer over a real socket and
 * assert that a stuck operation is answered and the connection keeps serving.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GIOPServer } from "../../src/giop/transport.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { ReplyStatusType } from "../../src/giop/types.ts";

const V12 = { major: 1, minor: 2 };
const encoder = new TextEncoder();

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

/** Collect replies as (requestId, replyStatus) pairs, framed by GIOP length. */
function collectReplies(conn: Deno.Conn, into: Array<{ id: number; status: number }>): void {
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
        const view = new DataView(acc.buffer, acc.byteOffset + 12, 8);
        into.push({ id: view.getUint32(0, littleEndian), status: view.getUint32(4, littleEndian) });
        acc = acc.subarray(12 + size);
      }
    }
  })().catch(() => {});
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Answers "ping" immediately and never answers "hang". */
function startServer(port: number): GIOPServer {
  const server = new GIOPServer({ host: "127.0.0.1", port }, undefined as never);
  server.registerHandler("*", (req: GIOPRequest) => {
    if (req.operation === "hang") return new Promise<GIOPReply>(() => {});
    const reply = new GIOPReply(V12);
    reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
    reply.body = new Uint8Array(0);
    return Promise.resolve(reply);
  });
  return server;
}

Deno.test("a stuck handler is answered and the connection keeps serving", async () => {
  const previous = Deno.env.get("CORBA_HANDLER_TIMEOUT_MS");
  Deno.env.set("CORBA_HANDLER_TIMEOUT_MS", "1000");

  // The deadline is read at module load, so re-import under the new value.
  const { GIOPServer: BoundedServer } = await import(`../../src/giop/transport.ts#${crypto.randomUUID()}`);
  const server = new BoundedServer({ host: "127.0.0.1", port: 21_987 }, undefined as never) as GIOPServer;
  server.registerHandler("*", (req: GIOPRequest) => {
    if (req.operation === "hang") return new Promise<GIOPReply>(() => {});
    const reply = new GIOPReply(V12);
    reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
    reply.body = new Uint8Array(0);
    return Promise.resolve(reply);
  });
  await server.start();

  const conn = await Deno.connect({ hostname: "127.0.0.1", port: 21_987 });
  const replies: Array<{ id: number; status: number }> = [];
  collectReplies(conn, replies);

  await conn.write(request(1, "ping"));
  await conn.write(request(2, "hang"));
  await conn.write(request(3, "ping"));
  await conn.write(request(4, "ping"));
  await sleep(2500);

  assertEquals(replies.map((r) => r.id), [1, 2, 3, 4], "every request is answered");
  assertEquals(
    replies.find((r) => r.id === 2)?.status,
    ReplyStatusType.SYSTEM_EXCEPTION,
    "the stuck request gets a system exception",
  );
  assertEquals(
    replies.filter((r) => r.id !== 2).every((r) => r.status === ReplyStatusType.NO_EXCEPTION),
    true,
    "requests behind it are served normally",
  );

  conn.close();
  await server.stop();
  await sleep(50);

  if (previous === undefined) Deno.env.delete("CORBA_HANDLER_TIMEOUT_MS");
  else Deno.env.set("CORBA_HANDLER_TIMEOUT_MS", previous);
});

Deno.test("a healthy connection is unaffected by the deadline", async () => {
  const server = startServer(21_988);
  await server.start();

  const conn = await Deno.connect({ hostname: "127.0.0.1", port: 21_988 });
  const replies: Array<{ id: number; status: number }> = [];
  collectReplies(conn, replies);

  for (const id of [1, 2, 3]) await conn.write(request(id, "ping"));
  await sleep(300);

  assertEquals(replies.map((r) => r.id), [1, 2, 3]);
  assertEquals(replies.every((r) => r.status === ReplyStatusType.NO_EXCEPTION), true);

  conn.close();
  await server.stop();
  await sleep(50);
});
