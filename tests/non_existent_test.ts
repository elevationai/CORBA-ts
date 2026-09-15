import { assertEquals, assertInstanceOf, assertRejects } from "@std/assert";
import { CORBA, create_endpoint_policy, init, ORB_instance, type POA, Servant } from "../mod.ts";
import { IORUtil } from "../src/giop/ior.ts";

class Pingable extends Servant {
  override _repository_id(): string {
    return "IDL:test/Pingable:1.0";
  }
}

Deno.test("non_existent asks the remote object", async () => {
  await init();
  const orb = ORB_instance();
  const rootPOA = await orb.resolve_initial_references("RootPOA") as unknown as POA;
  const poa = await rootPOA.create_POA("NonExistentPOA", null, [create_endpoint_policy("127.0.0.1", 20787)]);
  const oid = new TextEncoder().encode("pingable");
  const servant = new Pingable();
  await poa.activate_object_with_id(oid, servant);
  rootPOA.the_POAManager().activate();
  const ref = await poa.servant_to_reference(servant);

  assertEquals(await orb.non_existent(ref), false);

  await poa.deactivate_object(oid);
  assertEquals(await orb.non_existent(ref), true);

  const error = await assertRejects(() => orb.invokeWithEncodedArgs(ref, "ping", new Uint8Array(0)));
  assertInstanceOf(error, CORBA.OBJECT_NOT_EXIST);
  assertEquals(error.completed, CORBA.CompletionStatus.COMPLETED_NO);

  const unreachable = { _ior: IORUtil.createSimpleIOR("IDL:test/Pingable:1.0", "127.0.0.1", 20788, oid) };
  await assertRejects(() => orb.non_existent(unreachable), CORBA.TRANSIENT);

  await orb.shutdown(true);
});
