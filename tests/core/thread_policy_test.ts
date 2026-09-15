/**
 * PortableServer ThreadPolicy: ORB_CTRL_MODEL dispatches concurrently, SINGLE_THREAD_MODEL
 * serialises a POA's upcalls, MAIN_THREAD_MODEL serialises the upcalls of every such POA together.
 */

import { assertEquals } from "@std/assert";
import { type POA, type ResponseHandler, RootPOA, Servant } from "../../src/poa.ts";
import { create_thread_policy, PolicyType, ThreadPolicyValue } from "../../src/policy.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Counts upcalls in progress; shared between servants when the model spans POAs. */
class Gauge {
  active = 0;
  maxActive = 0;
  completed: number[] = [];
}

class ProbeServant extends Servant {
  constructor(readonly gauge: Gauge, private readonly delayMs: number) {
    super();
  }

  override _repository_id(): string {
    return "IDL:Test/Probe:1.0";
  }

  async _invoke(_operation: string, input: CDRInputStream, handler: ResponseHandler): Promise<CDROutputStream> {
    const id = input.readULong();
    this.gauge.active++;
    this.gauge.maxActive = Math.max(this.gauge.maxActive, this.gauge.active);
    await sleep(this.delayMs);
    this.gauge.active--;
    this.gauge.completed.push(id);
    return handler.createReply();
  }
}

type Dispatcher = { _handleRequest(req: GIOPRequest, conn: unknown): Promise<GIOPReply> };

async function poaWith(policy?: ThreadPolicyValue): Promise<{ poa: POA; dispatch: Dispatcher }> {
  const policies = policy === undefined ? [] : [create_thread_policy(policy)];
  const poa = new RootPOA(`POA-${crypto.randomUUID()}`, null, null, policies);
  await poa.the_POAManager().activate();
  return { poa, dispatch: poa as unknown as Dispatcher };
}

function requestFor(oid: Uint8Array, id: number): GIOPRequest {
  const body = new CDROutputStream();
  body.writeULong(id);
  const req = new GIOPRequest({ major: 1, minor: 2 });
  req.requestId = id;
  req.operation = "probe";
  req.objectKey = oid;
  req.body = body.getBuffer();
  return req;
}

Deno.test("ORB_CTRL_MODEL is the default and dispatches concurrently", async () => {
  const { poa, dispatch } = await poaWith();
  const gauge = new Gauge();
  const oid = await poa.activate_object(new ProbeServant(gauge, 50));

  const replies = await Promise.all([1, 2, 3].map((id) => dispatch._handleRequest(requestFor(oid, id), null)));

  assertEquals(replies.map((r) => r.replyStatus), [0, 0, 0]);
  assertEquals(gauge.maxActive, 3);
});

Deno.test("SINGLE_THREAD_MODEL runs a POA's upcalls one at a time, in order", async () => {
  const { poa, dispatch } = await poaWith(ThreadPolicyValue.SINGLE_THREAD_MODEL);
  const gauge = new Gauge();
  const oid = await poa.activate_object(new ProbeServant(gauge, 30));

  const replies = await Promise.all([1, 2, 3].map((id) => dispatch._handleRequest(requestFor(oid, id), null)));

  assertEquals(replies.map((r) => r.replyStatus), [0, 0, 0]);
  assertEquals(gauge.maxActive, 1);
  assertEquals(gauge.completed, [1, 2, 3]);
});

Deno.test("MAIN_THREAD_MODEL serialises upcalls across every main-thread POA", async () => {
  const a = await poaWith(ThreadPolicyValue.MAIN_THREAD_MODEL);
  const b = await poaWith(ThreadPolicyValue.MAIN_THREAD_MODEL);
  const gauge = new Gauge();
  const oidA = await a.poa.activate_object(new ProbeServant(gauge, 30));
  const oidB = await b.poa.activate_object(new ProbeServant(gauge, 30));

  await Promise.all([
    a.dispatch._handleRequest(requestFor(oidA, 1), null),
    b.dispatch._handleRequest(requestFor(oidB, 2), null),
    a.dispatch._handleRequest(requestFor(oidA, 3), null),
    b.dispatch._handleRequest(requestFor(oidB, 4), null),
  ]);

  assertEquals(gauge.maxActive, 1);
  assertEquals(gauge.completed, [1, 2, 3, 4]);
});

Deno.test("a SINGLE_THREAD_MODEL POA does not serialise against an ORB_CTRL_MODEL POA", async () => {
  const single = await poaWith(ThreadPolicyValue.SINGLE_THREAD_MODEL);
  const ctrl = await poaWith(ThreadPolicyValue.ORB_CTRL_MODEL);
  const gauge = new Gauge();
  const oidSingle = await single.poa.activate_object(new ProbeServant(gauge, 30));
  const oidCtrl = await ctrl.poa.activate_object(new ProbeServant(gauge, 30));

  await Promise.all([
    single.dispatch._handleRequest(requestFor(oidSingle, 1), null),
    ctrl.dispatch._handleRequest(requestFor(oidCtrl, 2), null),
  ]);

  assertEquals(gauge.maxActive, 2);
});

Deno.test("create_thread_policy carries its type and value", () => {
  const policy = create_thread_policy(ThreadPolicyValue.SINGLE_THREAD_MODEL);
  assertEquals(policy.policy_type(), PolicyType.THREAD_POLICY_TYPE);
  assertEquals(policy.value<ThreadPolicyValue>(), ThreadPolicyValue.SINGLE_THREAD_MODEL);
});
