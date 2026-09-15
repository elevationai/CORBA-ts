/**
 * POAManager processing states (CORBA 15.3.2): holding queues requests, discarding answers
 * TRANSIENT, inactive rejects, and wait_for_completion waits for executing requests.
 */

import { assertEquals, assertRejects } from "@std/assert";
import { type POA, POAManagerState, type ResponseHandler, RootPOA, Servant } from "../../src/poa.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { ReplyStatusType } from "../../src/giop/types.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import type { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { BAD_INV_ORDER, CompletionStatus, OMGVMCID } from "../../src/core/exceptions/system.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class SlowServant extends Servant {
  active = 0;
  constructor(private readonly delayMs: number, readonly onInvoke?: () => Promise<void>) {
    super();
  }

  override _repository_id(): string {
    return "IDL:Test/Slow:1.0";
  }

  async _invoke(_operation: string, _input: CDRInputStream, handler: ResponseHandler): Promise<CDROutputStream> {
    this.active++;
    await this.onInvoke?.();
    await sleep(this.delayMs);
    this.active--;
    return handler.createReply();
  }
}

type Dispatcher = { _handleRequest(req: GIOPRequest, conn: unknown): Promise<GIOPReply> };

function newPOA(): { poa: POA; dispatch: Dispatcher } {
  const poa = new RootPOA(`POA-${crypto.randomUUID()}`);
  return { poa, dispatch: poa as unknown as Dispatcher };
}

function requestFor(oid: Uint8Array, id: number): GIOPRequest {
  const req = new GIOPRequest({ major: 1, minor: 2 });
  req.requestId = id;
  req.operation = "op";
  req.objectKey = oid;
  req.body = new Uint8Array(0);
  return req;
}

function systemException(reply: GIOPReply): { id: string; minor: number; completed: number } {
  assertEquals(reply.replyStatus, ReplyStatusType.SYSTEM_EXCEPTION);
  const body = new CDRInputStream(reply.body);
  return { id: body.readString(), minor: body.readULong(), completed: body.readULong() };
}

/** Whether a promise has settled by the time the microtask queue drains. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  promise.then(() => done = true, () => done = true);
  await sleep(0);
  return done;
}

Deno.test("a new POAManager holds requests until it is activated", async () => {
  const { poa, dispatch } = newPOA();
  const oid = await poa.activate_object(new SlowServant(0));
  assertEquals(poa.the_POAManager().get_state(), POAManagerState.HOLDING);

  const pending = dispatch._handleRequest(requestFor(oid, 1), null);
  await sleep(30);
  assertEquals(await settled(pending), false, "the request is queued while holding");

  await poa.the_POAManager().activate();
  const reply = await pending;
  assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
});

Deno.test("discarding answers TRANSIENT with standard minor code 1", async () => {
  const { poa, dispatch } = newPOA();
  const oid = await poa.activate_object(new SlowServant(0));
  await poa.the_POAManager().activate();
  await poa.the_POAManager().discard_requests(false);

  const reply = await dispatch._handleRequest(requestFor(oid, 1), null);

  assertEquals(systemException(reply), {
    id: "IDL:omg.org/CORBA/TRANSIENT:1.0",
    minor: OMGVMCID | 1,
    completed: CompletionStatus.COMPLETED_NO,
  });
});

Deno.test("a held request is discarded when the manager moves to discarding", async () => {
  const { poa, dispatch } = newPOA();
  const oid = await poa.activate_object(new SlowServant(0));

  const pending = dispatch._handleRequest(requestFor(oid, 1), null);
  await poa.the_POAManager().discard_requests(false);

  assertEquals(systemException(await pending).id, "IDL:omg.org/CORBA/TRANSIENT:1.0");
});

Deno.test("an inactive manager rejects requests with OBJ_ADAPTER minor code 1", async () => {
  const { poa, dispatch } = newPOA();
  const oid = await poa.activate_object(new SlowServant(0));
  await poa.the_POAManager().activate();
  await poa.the_POAManager().deactivate(false, false);

  const reply = await dispatch._handleRequest(requestFor(oid, 1), null);

  assertEquals(systemException(reply), {
    id: "IDL:omg.org/CORBA/OBJ_ADAPTER:1.0",
    minor: OMGVMCID | 1,
    completed: CompletionStatus.COMPLETED_NO,
  });
});

Deno.test("hold_requests with wait_for_completion waits for executing requests", async () => {
  const { poa, dispatch } = newPOA();
  const servant = new SlowServant(100);
  const oid = await poa.activate_object(servant);
  const manager = poa.the_POAManager();
  await manager.activate();

  const inFlight = dispatch._handleRequest(requestFor(oid, 1), null);
  await sleep(10);
  assertEquals(servant.active, 1);

  await manager.hold_requests(true);

  assertEquals(servant.active, 0, "hold_requests returned only once the request finished");
  assertEquals(manager.get_state(), POAManagerState.HOLDING);
  assertEquals((await inFlight).replyStatus, ReplyStatusType.NO_EXCEPTION);
});

Deno.test("hold_requests without wait_for_completion returns while requests execute", async () => {
  const { poa, dispatch } = newPOA();
  const servant = new SlowServant(100);
  const oid = await poa.activate_object(servant);
  const manager = poa.the_POAManager();
  await manager.activate();

  const inFlight = dispatch._handleRequest(requestFor(oid, 1), null);
  await sleep(10);
  await manager.hold_requests(false);

  assertEquals(servant.active, 1);
  await manager.activate();
  assertEquals((await inFlight).replyStatus, ReplyStatusType.NO_EXCEPTION);
});

Deno.test("waiting stops early when the manager leaves the state it was waiting in", async () => {
  const { poa, dispatch } = newPOA();
  const servant = new SlowServant(300);
  const oid = await poa.activate_object(servant);
  const manager = poa.the_POAManager();
  await manager.activate();

  const inFlight = dispatch._handleRequest(requestFor(oid, 1), null);
  await sleep(10);
  const holding = manager.hold_requests(true);
  await sleep(10);
  await manager.activate();
  await holding;

  assertEquals(servant.active, 1, "hold_requests returned on reactivation, not on completion");
  assertEquals((await inFlight).replyStatus, ReplyStatusType.NO_EXCEPTION);
});

Deno.test("deactivate with wait_for_completion waits for executing requests", async () => {
  const { poa, dispatch } = newPOA();
  const servant = new SlowServant(100);
  const oid = await poa.activate_object(servant);
  const manager = poa.the_POAManager();
  await manager.activate();

  const inFlight = dispatch._handleRequest(requestFor(oid, 1), null);
  await sleep(10);
  await manager.deactivate(false, true);

  assertEquals(servant.active, 0);
  assertEquals(manager.get_state(), POAManagerState.INACTIVE);
  assertEquals((await inFlight).replyStatus, ReplyStatusType.NO_EXCEPTION);
});

Deno.test("wait_for_completion from inside a request raises BAD_INV_ORDER and leaves the state alone", async () => {
  const { poa, dispatch } = newPOA();
  const manager = poa.the_POAManager();
  let raised: unknown;
  const servant = new SlowServant(0, async () => {
    raised = await manager.hold_requests(true).then(() => undefined, (error) => error);
  });
  const oid = await poa.activate_object(servant);
  await manager.activate();

  const reply = await dispatch._handleRequest(requestFor(oid, 1), null);

  assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
  assertEquals(raised instanceof BAD_INV_ORDER, true);
  assertEquals((raised as BAD_INV_ORDER).minor, OMGVMCID | 3);
  assertEquals(manager.get_state(), POAManagerState.ACTIVE);
});

Deno.test("hold_requests and discard_requests reject on an inactive manager", async () => {
  const { poa } = newPOA();
  const manager = poa.the_POAManager();
  await manager.deactivate(false, false);

  await assertRejects(() => manager.hold_requests(false));
  await assertRejects(() => manager.discard_requests(false));
  await assertRejects(() => manager.activate());
});
