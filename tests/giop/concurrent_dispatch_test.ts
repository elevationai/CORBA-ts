/**
 * GIOP carries a request id on every message so that a connection can have many requests in
 * flight and replies can return in any order. These tests drive a GIOPServer over a real socket
 * and assert that it serves a connection that way.
 */

import { assertEquals } from "@std/assert";
import { GIOPServer } from "../../src/giop/transport.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { GIOPMessageType, ReplyStatusType } from "../../src/giop/types.ts";
import { CompletionStatus } from "../../src/core/exceptions/system.ts";
import { CDRInputStream } from "../../src/core/cdr/index.ts";
import type { ConnectionManager } from "../../src/giop/connection.ts";

const V12 = { major: 1, minor: 2 };
const encoder = new TextEncoder();

// The server does not consult the connection manager for inbound requests.
const NO_CONNECTION_MANAGER = undefined as unknown as ConnectionManager;

interface Reply {
  id: number;
  status: number;
  body: Uint8Array;
  exception?: { id: string; minor: number; completed: number };
}

function request(id: number, operation: string, body = new Uint8Array(0)): Uint8Array {
  const req = new GIOPRequest(V12);
  req.requestId = id;
  req.responseExpected = true;
  req.operation = operation;
  req.body = body;
  req.serviceContext = [];
  req.target = { disposition: 0, objectKey: encoder.encode("obj") };
  return req.serialize(null);
}

function collectReplies(conn: Deno.Conn, into: Reply[]): void {
  (async () => {
    const buf = new Uint8Array(65536);
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
        reply.deserialize(new CDRInputStream(message.subarray(12), littleEndian), 12);

        const decoded: Reply = { id: reply.requestId, status: reply.replyStatus, body: reply.body };
        if (reply.replyStatus === ReplyStatusType.SYSTEM_EXCEPTION) {
          const body = new CDRInputStream(reply.body, littleEndian);
          decoded.exception = { id: body.readString(), minor: body.readULong(), completed: body.readULong() };
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

// Deno.Conn.write may write only part of a buffer, and a short write would corrupt the GIOP stream.
async function send(conn: Deno.Conn, data: Uint8Array): Promise<void> {
  let sent = 0;
  while (sent < data.length) {
    sent += await conn.write(data.subarray(sent));
  }
}

function okReply(body: Uint8Array = new Uint8Array(0)): GIOPReply {
  const reply = new GIOPReply(V12);
  reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
  reply.body = body;
  return reply;
}

/**
 * A server on an OS-assigned port whose operations are:
 *   ping   answers at once
 *   slow   answers after 300ms
 *   echo   answers with the request body after a delay that varies by request id
 *   hang   never answers
 *   throw  throws
 */
async function startServer(): Promise<{ server: GIOPServer; port: number }> {
  const server = new GIOPServer({ host: "127.0.0.1", port: 0 }, NO_CONNECTION_MANAGER);
  server.registerHandler("*", async (req: GIOPRequest) => {
    switch (req.operation) {
      case "slow":
        await sleep(300);
        return okReply();
      case "echo":
        await sleep((req.requestId % 3) * 20);
        return okReply(req.body);
      case "hang":
        return new Promise<GIOPReply>(() => {});
      case "throw":
        throw new Error("servant failure");
      default:
        return okReply();
    }
  });
  await server.start();
  const port = server.getAddress()?.port;
  if (port === undefined) throw new Error("server did not report an address");
  return { server, port };
}

async function withConnection(
  run: (conn: Deno.Conn, replies: Reply[]) => Promise<void>,
): Promise<void> {
  const { server, port } = await startServer();
  const conn = await Deno.connect({ hostname: "127.0.0.1", port });
  const replies: Reply[] = [];
  collectReplies(conn, replies);
  try {
    await run(conn, replies);
  }
  finally {
    conn.close();
    await server.stop();
    await sleep(50);
  }
}

Deno.test("requests on one connection are served concurrently", async () => {
  await withConnection(async (conn, replies) => {
    await send(conn, request(1, "ping"));
    await send(conn, request(2, "slow"));
    await send(conn, request(3, "ping"));
    await send(conn, request(4, "ping"));
    await sleep(150);

    assertEquals(replies.map((r) => r.id), [1, 3, 4], "fast requests are answered while the slow one runs");

    await sleep(300);
    assertEquals(replies.map((r) => r.id), [1, 3, 4, 2], "the slow request is answered when it finishes");
    assertEquals(replies.every((r) => r.status === ReplyStatusType.NO_EXCEPTION), true);
  });
});

Deno.test("a handler that never settles does not block the connection", async () => {
  await withConnection(async (conn, replies) => {
    await send(conn, request(1, "hang"));
    await send(conn, request(2, "ping"));
    await send(conn, request(3, "ping"));
    await sleep(200);

    assertEquals(replies.map((r) => r.id), [2, 3]);
  });
});

Deno.test("concurrent large replies arrive whole and unmixed", async () => {
  const SIZE = 200_000;
  const COUNT = 8;
  await withConnection(async (conn, replies) => {
    for (let id = 1; id <= COUNT; id++) {
      await send(conn, request(id, "echo", new Uint8Array(SIZE).fill(id)));
    }
    const deadline = Date.now() + 5000;
    while (replies.length < COUNT && Date.now() < deadline) await sleep(20);

    assertEquals(replies.length, COUNT);
    for (const reply of replies) {
      assertEquals(reply.status, ReplyStatusType.NO_EXCEPTION);
      assertEquals(reply.body.length, SIZE, `reply ${reply.id} is complete`);
      assertEquals(reply.body.every((byte) => byte === reply.id), true, `reply ${reply.id} contains only its own bytes`);
    }
  });
});

Deno.test("a handler that throws is answered with UNKNOWN and the connection keeps serving", async () => {
  await withConnection(async (conn, replies) => {
    await send(conn, request(1, "throw"));
    await send(conn, request(2, "ping"));
    await sleep(100);

    assertEquals(replies.map((r) => r.id), [1, 2]);
    assertEquals(replies[0].status, ReplyStatusType.SYSTEM_EXCEPTION);
    assertEquals(replies[0].exception, {
      id: "IDL:omg.org/CORBA/UNKNOWN:1.0",
      minor: 0,
      completed: CompletionStatus.COMPLETED_MAYBE,
    });
    assertEquals(replies[1].status, ReplyStatusType.NO_EXCEPTION);
  });
});

Deno.test("replies still in flight are delivered after the client half-closes", async () => {
  await withConnection(async (conn, replies) => {
    await send(conn, request(1, "slow"));
    await conn.closeWrite();
    await sleep(450);

    assertEquals(replies.map((r) => r.id), [1]);
    assertEquals(replies[0].status, ReplyStatusType.NO_EXCEPTION);
  });
});

Deno.test("a malformed message is answered with MessageError and the connection is closed", async () => {
  const { server, port } = await startServer();
  const conn = await Deno.connect({ hostname: "127.0.0.1", port });
  try {
    const bogus = new Uint8Array(12);
    bogus.set(encoder.encode("NOPE"));
    bogus[4] = 1;
    bogus[5] = 2;
    bogus[7] = GIOPMessageType.Request;
    await send(conn, bogus);

    const received: number[] = [];
    const buf = new Uint8Array(64);
    while (true) {
      const n = await conn.read(buf);
      if (n === null) break;
      received.push(...buf.subarray(0, n));
    }

    assertEquals(received.length, 12, "exactly one header-only message came back before EOF");
    assertEquals(new TextDecoder().decode(new Uint8Array(received.slice(0, 4))), "GIOP");
    assertEquals(received[7], GIOPMessageType.MessageError);
  }
  finally {
    conn.close();
    await server.stop();
    await sleep(50);
  }
});

Deno.test("an operation with no handler is answered with BAD_OPERATION", async () => {
  const server = new GIOPServer({ host: "127.0.0.1", port: 0 }, NO_CONNECTION_MANAGER);
  server.registerHandler("known", () => Promise.resolve(okReply()));
  await server.start();
  const conn = await Deno.connect({ hostname: "127.0.0.1", port: server.getAddress()!.port });
  const replies: Reply[] = [];
  collectReplies(conn, replies);
  try {
    await send(conn, request(1, "unknownOperation"));
    await sleep(100);

    assertEquals(replies.length, 1);
    assertEquals(replies[0].exception, {
      id: "IDL:omg.org/CORBA/BAD_OPERATION:1.0",
      minor: 0,
      completed: CompletionStatus.COMPLETED_NO,
    });
  }
  finally {
    conn.close();
    await server.stop();
    await sleep(50);
  }
});
