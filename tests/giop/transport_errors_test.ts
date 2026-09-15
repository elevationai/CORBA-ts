import { assertEquals, assertRejects } from "@std/assert";
import { GIOPTransport } from "../../src/giop/transport.ts";
import { GIOPCloseConnection, GIOPReply } from "../../src/giop/messages.ts";
import { IORUtil } from "../../src/giop/ior.ts";
import { ReplyStatusType } from "../../src/giop/types.ts";
import { CORBA } from "../../src/types.ts";

type RequestHandler = (conn: Deno.TcpConn, requestId: number, connectionIndex: number) => Promise<void>;

function startRawServer(handler: RequestHandler) {
  const listener = Deno.listen({ hostname: "127.0.0.1", port: 0 });
  const conns: Deno.TcpConn[] = [];
  const serving: Promise<void>[] = [];
  let requests = 0;

  const accepting = (async () => {
    for await (const conn of listener) {
      const index = conns.length;
      conns.push(conn);
      serving.push((async () => {
        const buffer = new Uint8Array(4096);
        try {
          while (await conn.read(buffer) !== null) {
            requests++;
            const littleEndian = (buffer[6] & 1) === 1;
            const requestId = new DataView(buffer.buffer).getUint32(12, littleEndian);
            await handler(conn, requestId, index);
          }
        }
        catch {
          // Connection closed by the handler or the test
        }
      })());
    }
  })();

  return {
    ior: IORUtil.createSimpleIOR("IDL:test/Raw:1.0", "127.0.0.1", (listener.addr as Deno.NetAddr).port, new Uint8Array([1])),
    requestCount: () => requests,
    async stop() {
      listener.close();
      for (const conn of conns) {
        try {
          conn.close();
        }
        catch {
          // Already closed
        }
      }
      await accepting.catch(() => {});
      await Promise.all(serving);
    },
  };
}

async function writeReply(conn: Deno.TcpConn, requestId: number): Promise<void> {
  const reply = new GIOPReply({ major: 1, minor: 2 });
  reply.requestId = requestId;
  reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
  reply.body = new Uint8Array(0);
  await conn.write(reply.serialize(null));
}

Deno.test("Transport: connection refused raises TRANSIENT with COMPLETED_NO", async () => {
  const server = startRawServer(() => Promise.resolve());
  const ior = server.ior;
  await server.stop();

  const transport = new GIOPTransport({ retryDelay: 10 });
  try {
    const error = await assertRejects(() => transport.sendRequest(ior, "op", new Uint8Array(0)), CORBA.TRANSIENT);
    assertEquals(error.completed, CORBA.CompletionStatus.COMPLETED_NO);
  }
  finally {
    await transport.close();
  }
});

Deno.test("Transport: CloseConnection before the reply raises TRANSIENT and the request is reissued", async () => {
  const server = startRawServer(async (conn, requestId, connectionIndex) => {
    if (connectionIndex === 0) {
      await conn.write(new GIOPCloseConnection({ major: 1, minor: 2 }).serialize(null));
      conn.close();
    }
    else {
      await writeReply(conn, requestId);
    }
  });
  const transport = new GIOPTransport({ retryDelay: 10 });
  try {
    const reply = await transport.sendRequest(server.ior, "op", new Uint8Array(0));
    assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
    assertEquals(server.requestCount(), 2);
  }
  finally {
    await transport.close();
    await server.stop();
  }
});

Deno.test("Transport: connection lost after sending raises COMM_FAILURE with COMPLETED_MAYBE and is not reissued", async () => {
  const server = startRawServer((conn) => {
    conn.close();
    return Promise.resolve();
  });
  const transport = new GIOPTransport({ retryDelay: 10 });
  try {
    const error = await assertRejects(() => transport.sendRequest(server.ior, "op", new Uint8Array(0)), CORBA.COMM_FAILURE);
    assertEquals(error.completed, CORBA.CompletionStatus.COMPLETED_MAYBE);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assertEquals(server.requestCount(), 1);
  }
  finally {
    await transport.close();
    await server.stop();
  }
});

Deno.test("Transport: no reply within the request timeout raises TIMEOUT and is not reissued", async () => {
  const server = startRawServer(() => Promise.resolve());
  const transport = new GIOPTransport({ requestTimeout: 100, retryDelay: 10 });
  try {
    const error = await assertRejects(() => transport.sendRequest(server.ior, "op", new Uint8Array(0)), CORBA.TIMEOUT);
    assertEquals(error.completed, CORBA.CompletionStatus.COMPLETED_MAYBE);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assertEquals(server.requestCount(), 1);
  }
  finally {
    await transport.close();
    await server.stop();
  }
});
