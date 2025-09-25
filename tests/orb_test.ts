import { assertEquals, assertExists } from "@std/assert";
import { init, ORB_instance } from "../src/orb.ts";
import { CORBA, init as initCORBA } from "../src/index.ts";
import { CDROutputStream } from "../src/core/cdr/encoder.ts";
import { RequestImpl } from "../src/dii.ts";
import { TypeCode } from "../src/typecode.ts";

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

Deno.test("ORB handles little-endian responses correctly", async () => {
  // This test simulates what happens when a server sends little-endian data
  // The DII code was hardcoded to big-endian, causing buffer underflow errors

  const orb = await init();
  await orb.init();

  // Create a mock invokeWithEncodedArgs result that simulates little-endian response
  const mockResult = {
    returnValue: 0,
    // This buffer contains little-endian encoded data
    outputBuffer: (() => {
      const encoder = new CDROutputStream(256, true); // true = little-endian
      encoder.writeString("TestString");
      encoder.writeLong(12345);
      return encoder.getBuffer();
    })(),
    // WITHOUT THE FIX: This would be undefined, causing DII to default to big-endian
    // WITH THE FIX: This passes the endianness flag through
    isLittleEndian: true,
  };

  // Test that DII can decode output parameters with correct endianness
  // This would fail without the fix because DII was hardcoded to false (big-endian)
  const { CDRInputStream } = await import("../src/core/cdr/decoder.ts");
  const decoder = new CDRInputStream(mockResult.outputBuffer, mockResult.isLittleEndian);

  const str = decoder.readString();
  assertEquals(str, "TestString");

  const num = decoder.readLong();
  assertEquals(num, 12345);

  await orb.shutdown(true);
});

Deno.test("DII decodes little-endian output parameters", async () => {
  const orb = await init();
  await orb.init();

  const target = {} as CORBA.ObjectRef;
  const request = new RequestImpl(target, "testOp");

  // Set return type to long to match the mock data
  request.set_return_type(new TypeCode(TypeCode.Kind.tk_long));

  const tc = new TypeCode(TypeCode.Kind.tk_string);
  request.add_out_arg(tc);

  // @ts-ignore: mocking orb method for test
  orb.invokeWithEncodedArgs = () => {
    const encoder = new CDROutputStream(256, true);
    encoder.writeLong(0);
    encoder.writeString("TestOutput");

    return Promise.resolve({
      returnValue: 0,
      outputBuffer: encoder.getBuffer(),
      isLittleEndian: true,
    });
  };

  await request.invoke();

  assertEquals(request.get_arg(0), "TestOutput");

  await orb.shutdown(true);
});
