import { assertEquals, assertExists } from "https://deno.land/std/testing/asserts.ts";
import { init, ORB_instance } from "../src/orb.ts";
import { CORBA, init as initCORBA } from "../src/index.ts";

Deno.test("ORB initialization", async () => {
  const orb = await init();

  assertEquals(orb.id(), "default");
  assertEquals(orb.is_running(), true);

  // Clean up: stop the ORB to prevent resource leaks
  await orb.shutdown(true);
});

Deno.test("ORB singleton", async () => {
  const orb1 = await init();
  const orb2 = await init();

  // Both references should be to the same ORB instance
  assertEquals(orb1, orb2);
});

Deno.test("ORB initial references", async () => {
  const orb = await init();
  await orb.init();

  // Register an initial reference
  const dummy = {} as CORBA.ObjectRef;
  await orb.register_initial_reference("TestReference", dummy);

  // List initial services
  const services = await orb.list_initial_services();
  assertEquals(services.includes("TestReference"), true);

  // Resolve initial reference
  const resolved = await orb.resolve_initial_references("TestReference");
  assertEquals(resolved, dummy);

  // Clean up
  await orb.shutdown(true);
});

Deno.test("Full CORBA initialization", async () => {
  await initCORBA();

  const orb = ORB_instance();
  assertExists(orb);
  assertEquals(orb.is_running(), true);

  // Check if NameService is registered
  const services = await orb.list_initial_services();
  assertEquals(services.includes("NameService"), true);

  // Resolve NameService
  const nameService = await orb.resolve_initial_references("NameService");
  assertExists(nameService);

  // Clean up
  await orb.shutdown(true);
});
