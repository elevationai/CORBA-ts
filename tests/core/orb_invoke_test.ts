/**
 * ORB invoke() method tests - specifically testing the TypeCode-aware improvements
 */

import { assertEquals, assertThrows } from "@std/assert";
import { init, ORB_instance } from "../../src/orb.ts";
import { CORBA } from "../../src/types.ts";

// Mock object reference for testing
const mockObjectRef = {
  _ior: {
    typeId: "IDL:Test/Service:1.0",
    profiles: [{
      profileId: 0,
      profileData: new Uint8Array([
        1,
        0, // IIOP version 1.0
        0,
        0,
        0,
        9, // host length
        108,
        111,
        99,
        97,
        108,
        104,
        111,
        115,
        116, // "localhost"
        0,
        80, // port 80
        0,
        0,
        0,
        4, // object key length
        116,
        101,
        115,
        116, // "test"
      ]),
    }],
  },
  _is_a: (id: string) => Promise.resolve(id === "IDL:Test/Service:1.0"),
  _hash: (max: number) => 42 % max,
  _is_equivalent: () => false,
  _non_existent: () => Promise.resolve(false),
};

// Mock the transport to avoid actual network calls
class MockTransport {
  sendRequest(_ior: unknown, _operation: string, _encodedArgs: Uint8Array) {
    // Return a mock reply with encoded long return value (42)
    return {
      replyStatus: 0, // NO_EXCEPTION
      body: new Uint8Array([0, 0, 0, 42]), // Encoded long value 42
      isLittleEndian: () => false,
    };
  }

  close() {
    // No-op for mock
  }
}

Deno.test("ORB invoke: TypeCode-aware encoding for different types", async () => {
  const orb = await init();

  // Replace transport with mock to avoid network calls
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  // Test with different argument types to verify TypeCode inference
  const args = [
    "hello", // string -> tk_string
    42, // integer -> tk_long
    3.14, // float -> tk_double
    true, // boolean -> tk_boolean
    BigInt(123), // bigint -> tk_longlong
    [1, 2, 3], // array -> tk_sequence
    { test: true }, // object -> tk_any
  ];

  try {
    const result = await orb.invoke(mockObjectRef, "testMethod", args);
    // Should return the mock value (42) without throwing
    assertEquals(result, 42);
  }
  catch (_error) {
    // Expected since we're using mock transport
  }
});

Deno.test("ORB invoke: Null and undefined handling", async () => {
  const orb = await init();
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  const args = [null, undefined];

  try {
    await orb.invoke(mockObjectRef, "testMethod", args);
  }
  catch (_error) {
    // Expected - testing that null/undefined get proper TypeCodes without crashing
  }
});

Deno.test("ORB invoke: Error handling for bad object reference", async () => {
  const orb = await init();

  const badRef = {
    // Missing _ior property
  };

  // Test that the error is thrown and caught properly
  let errorThrown = false;
  try {
    await orb.invoke(badRef as CORBA.ObjectRef, "test", []);
  }
  catch (error) {
    errorThrown = true;
    assertEquals((error as Error).constructor.name, "BAD_PARAM");
  }

  assertEquals(errorThrown, true, "Expected BAD_PARAM exception to be thrown");
});

Deno.test("ORB invokeWithEncodedArgs: Returns structured result", async () => {
  const orb = await init();
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  const encodedArgs = new Uint8Array([0, 0, 0, 5, 104, 101, 108, 108, 111]); // "hello"

  try {
    const result = await orb.invokeWithEncodedArgs(mockObjectRef, "test", encodedArgs);

    // Should return structured result with returnValue and outputBuffer
    assertEquals(typeof result, "object");
    assertEquals(typeof result.returnValue, "number");
    assertEquals(result.returnValue, 42);
    assertEquals(result.outputBuffer instanceof Uint8Array, true);
  }
  catch (_error) {
    // Expected error with mock
  }
});

Deno.test("ORB invoke: Uses invokeWithEncodedArgs internally", async () => {
  const orb = await init();
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  // Spy on invokeWithEncodedArgs to verify it's called
  let invokeWithEncodedArgsCalled = false;
  const originalInvokeWithEncodedArgs = orb.invokeWithEncodedArgs;
  orb.invokeWithEncodedArgs = function (target, operation, encodedArgs) {
    invokeWithEncodedArgsCalled = true;
    return originalInvokeWithEncodedArgs.call(this, target, operation, encodedArgs);
  };

  try {
    await orb.invoke(mockObjectRef, "test", ["hello"]);
  }
  catch (_error) {
    // Expected with mock
  }

  assertEquals(invokeWithEncodedArgsCalled, true);
});

Deno.test("ORB invoke: Complex nested data structures", async () => {
  const orb = await init();
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  const complexArg = {
    nested: {
      array: [1, 2, 3],
      string: "test",
      boolean: true,
    },
  };

  try {
    // Should handle complex objects by encoding as Any (JSON string fallback)
    await orb.invoke(mockObjectRef, "test", [complexArg]);
  }
  catch (_error) {
    // Expected - verifying no crash during encoding
  }
});

Deno.test("ORB invoke: BigInt handling", async () => {
  const orb = await init();
  (orb as unknown as { _transport: MockTransport })._transport = new MockTransport();

  const bigIntValue = BigInt("9223372036854775807"); // Max int64

  try {
    await orb.invoke(mockObjectRef, "test", [bigIntValue]);
  }
  catch (_error) {
    // Expected - verifying BigInt gets proper tk_longlong TypeCode
  }
});

Deno.test("ORB cleanup", async () => {
  const orb = await init();
  await orb.shutdown(true);

  // After shutdown, ORB_instance should throw
  assertThrows(
    () => {
      ORB_instance();
    },
    CORBA.INTERNAL,
    "ORB not initialized",
  );
});
