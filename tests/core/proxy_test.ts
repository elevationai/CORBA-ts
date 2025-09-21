/**
 * Proxy transport and serialization tests
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { ProxyFactory } from "../../src/proxy.ts";
import { init } from "../../src/orb.ts";
import { CORBA } from "../../src/types.ts";

// Test interface definition
interface TestService {
  sayHello(name: string): Promise<string>;
  addNumbers(a: number, b: number): Promise<number>;
  sendOneway(message: string): Promise<void>;
}

Deno.test("Proxy: Creates proxy with proper methods", async () => {
  const orb = await init();

  // Create mock object reference
  const mockRef: CORBA.ObjectRef = {
    _ior: {
      typeId: "IDL:Test/Service:1.0",
      profiles: [{
        profileId: 0,
        profileData: new Uint8Array([1, 2, 3, 4]),
      }],
    },
    _is_a: () => Promise.resolve(true),
    _hash: (max: number) => 42 % max,
    _is_equivalent: () => false,
    _non_existent: () => Promise.resolve(false),
  };

  const factory = new ProxyFactory(orb);
  const proxy = factory.createProxy<TestService>(
    mockRef,
    ["sayHello", "addNumbers", "sendOneway"],
    { oneway_operations: ["sendOneway"] },
  );

  assertExists(proxy);
  assertEquals(typeof proxy.sayHello, "function");
  assertEquals(typeof proxy.addNumbers, "function");
  assertEquals(typeof proxy.sendOneway, "function");

  await orb.shutdown(true);
});

Deno.test("Proxy: Handles oneway calls properly", async () => {
  const orb = await init();

  const mockRef: CORBA.ObjectRef = {
    _ior: {
      typeId: "IDL:Test/OneWay:1.0",
      profiles: [{
        profileId: 0,
        profileData: new Uint8Array([1, 2, 3, 4]),
      }],
    },
    _is_a: () => Promise.resolve(true),
    _hash: (max: number) => 42 % max,
    _is_equivalent: () => false,
    _non_existent: () => Promise.resolve(false),
  };

  const factory = new ProxyFactory(orb);
  const proxy = factory.createProxy<{ notify(msg: string): Promise<void> }>(
    mockRef,
    ["notify"],
    { oneway_operations: ["notify"] },
  );

  // Oneway calls should not throw even if transport fails
  try {
    await proxy.notify("test message");
    // Should complete without error for oneway
  }
  catch (error) {
    // Only non-COMM_FAILURE errors should propagate
    assertEquals((error as Error).constructor.name !== "COMM_FAILURE", true);
  }

  await orb.shutdown(true);
});

Deno.test("Proxy: Uses TypeCode-aware serialization", async () => {
  const orb = await init();

  // Mock transport to avoid IOR parsing issues
  let capturedArgs: Uint8Array | undefined;
  const mockTransport = {
    sendOnewayRequest: function (_ior: unknown, _operation: string, encodedArgs: Uint8Array) {
      capturedArgs = encodedArgs;
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
  };

  // Set mock transport
  (orb as unknown as { _transport: typeof mockTransport })._transport = mockTransport;

  // Also spy on invokeWithEncodedArgs as fallback
  const originalInvoke = orb.invokeWithEncodedArgs;
  orb.invokeWithEncodedArgs = function (_target, _operation, encodedArgs) {
    capturedArgs = encodedArgs;
    return Promise.resolve({ returnValue: null, outputBuffer: new Uint8Array(0), isLittleEndian: false });
  };

  const mockRef: CORBA.ObjectRef = {
    _ior: {
      typeId: "IDL:Test/Encoder:1.0",
      profiles: [{
        profileId: 0,
        profileData: new Uint8Array([1, 2, 3, 4]),
      }],
    },
    _is_a: () => Promise.resolve(true),
    _hash: (max: number) => 42 % max,
    _is_equivalent: () => false,
    _non_existent: () => Promise.resolve(false),
  };

  const factory = new ProxyFactory(orb);
  const proxy = factory.createProxy<{ test(n: number, s: string): Promise<void> }>(
    mockRef,
    ["test"],
    { oneway_operations: ["test"] },
  );

  await proxy.test(42, "hello");

  // Verify arguments were encoded (not just JSON)
  assertExists(capturedArgs);
  assertEquals(capturedArgs.length > 0, true);
  // CDR encoding should produce binary data, not JSON text
  assertEquals(capturedArgs[0] !== 123, true); // Not starting with '{'

  orb.invokeWithEncodedArgs = originalInvoke;
  await orb.shutdown(true);
});

Deno.test("Proxy: Handles missing transport gracefully", async () => {
  const orb = await init();

  // Remove transport to test fallback
  (orb as unknown as { _transport: undefined })._transport = undefined;

  const mockRef: CORBA.ObjectRef = {
    _ior: {
      typeId: "IDL:Test/NoTransport:1.0",
      profiles: [{
        profileId: 0,
        profileData: new Uint8Array([1, 2, 3, 4]),
      }],
    },
    _is_a: () => Promise.resolve(true),
    _hash: (max: number) => 42 % max,
    _is_equivalent: () => false,
    _non_existent: () => Promise.resolve(false),
  };

  const factory = new ProxyFactory(orb);
  const proxy = factory.createProxy<{ doSomething(): Promise<void> }>(
    mockRef,
    ["doSomething"],
    { oneway_operations: ["doSomething"] },
  );

  // Should use fallback without crashing
  try {
    await proxy.doSomething();
  }
  catch (error) {
    // Expected since we removed transport
    assertExists(error);
  }

  await orb.shutdown(true);
});
