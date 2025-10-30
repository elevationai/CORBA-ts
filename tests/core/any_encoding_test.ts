/**
 * Tests for Any type encoding/decoding improvements
 */

import { assertEquals, assertExists } from "@std/assert";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import { encodeWithTypeCode } from "../../src/core/cdr/typecode-encoder.ts";
import { decodeWithTypeCode } from "../../src/core/cdr/typecode-decoder.ts";
import { TypeCode } from "../../src/typecode.ts";
import { Any } from "../../src/core/cdr/any.ts";
// TCKind removed - no longer needed after fixing type issues

Deno.test("Any encoding: Encodes TypeCode + value", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  // Create an Any with a long value
  const any = new Any(
    new TypeCode(TypeCode.Kind.tk_long),
    42,
  );

  encodeWithTypeCode(cdr, any, tc);

  const buffer = cdr.getBuffer();

  // Should have encoded both TypeCode and value
  assertEquals(buffer.length > 4, true); // More than just the long value
});

Deno.test("Any decoding: Decodes TypeCode + value", () => {
  const outCdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  // Encode an Any
  const any = new Any(
    new TypeCode(TypeCode.Kind.tk_string),
    "Hello, CORBA!",
  );

  encodeWithTypeCode(outCdr, any, tc);

  // Decode it back
  const inCdr = new CDRInputStream(outCdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  // Should get back an Any object
  assertExists(decoded);
  assertEquals(decoded instanceof Any, true);

  const decodedAny = decoded as Any;
  assertEquals(decodedAny.value, "Hello, CORBA!");
  assertEquals(decodedAny.type.kind(), TypeCode.Kind.tk_string);
});

Deno.test("Any encoding: Auto-detects type from value", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  // Pass a raw value, not an Any
  encodeWithTypeCode(cdr, 3.14159, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const decodedAny = decoded as Any;

  // Should have detected as double
  assertEquals(typeof decodedAny.value, "number");
  assertEquals(Math.abs((decodedAny.value as number) - 3.14159) < 0.00001, true);
});

Deno.test("Any encoding: Handles nested Any", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  // Create nested Any
  const innerAny = new Any(
    new TypeCode(TypeCode.Kind.tk_boolean),
    true,
  );

  const outerAny = new Any(
    new TypeCode(TypeCode.Kind.tk_any),
    innerAny,
  );

  encodeWithTypeCode(cdr, outerAny, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const decodedOuter = decoded as Any;
  assertEquals(decodedOuter.type.kind(), TypeCode.Kind.tk_any);

  const decodedInner = decodedOuter.value as Any;
  assertEquals(decodedInner instanceof Any, true);
  assertEquals(decodedInner.type.kind(), TypeCode.Kind.tk_boolean);
  assertEquals(decodedInner.value, true);
});

Deno.test("Any encoding: Handles arrays", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  const array = [1, 2, 3, 4, 5];

  // Create an Any explicitly with proper TypeCode
  const seqType = TypeCode.create_sequence_tc(0, new TypeCode(TypeCode.Kind.tk_long));
  const any = new Any(seqType, array);

  encodeWithTypeCode(cdr, any, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const decodedAny = decoded as Any;

  // Should have been encoded as sequence
  assertEquals(Array.isArray(decodedAny.value), true);
  // Check if the arrays have the same values
  const decodedArray = decodedAny.value as unknown[];
  assertEquals(decodedArray.length, array.length, `Array length mismatch: got ${decodedArray.length}, expected ${array.length}`);
  for (let i = 0; i < array.length; i++) {
    assertEquals(decodedArray[i], array[i], `Array element ${i} mismatch`);
  }
});

Deno.test("Any encoding: Rejects generic objects", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  const obj = { name: "test", value: 123 };

  // Generic objects should be rejected for Any encoding (proper CORBA behavior)
  try {
    encodeWithTypeCode(cdr, obj, tc);
    assertEquals(true, false, "Expected error for generic object in Any");
  }
  catch (error) {
    assertEquals((error as Error).message.includes("Cannot infer TypeCode"), true);
  }
});

Deno.test("Object reference encoding: Handles IOR objects", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_objref);

  // Use a structured IOR object instead of string
  const objRef = {
    _ior: {
      typeId: "IDL:Test/Service:1.0",
      profiles: [{
        profileId: 0, // TAG_INTERNET_IOP
        profileData: new Uint8Array([0, 0, 0, 0]), // Minimal profile data
      }],
    },
  };

  encodeWithTypeCode(cdr, objRef, tc);

  // The decoder currently expects a string, not structured IOR
  // So we just verify the encoding doesn't throw
  const buffer = cdr.getBuffer();
  assertExists(buffer);
  assertEquals(buffer.length > 0, true);
});

Deno.test("Object reference encoding: Handles null references", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_objref);

  encodeWithTypeCode(cdr, null, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const ior = (decoded as { _ior: { typeId: string; profiles: unknown[] } })._ior;
  assertEquals(ior.typeId, "");
  assertEquals(ior.profiles.length, 0);
});

Deno.test("Object reference decoding: Returns proper structure", () => {
  const cdr = new CDROutputStream();

  // Manually write an IOR structure (not a string)
  cdr.writeString("IDL:Test:1.0"); // Type ID
  cdr.writeULong(1); // Profile count
  cdr.writeULong(0); // TAG_INTERNET_IOP
  cdr.writeULong(4); // Profile data length
  cdr.writeOctetArray(new Uint8Array([1, 2, 3, 4])); // Profile data

  const inCdr = new CDRInputStream(cdr.getBuffer());
  const tc = new TypeCode(TypeCode.Kind.tk_objref);
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const ior = (decoded as { _ior: { typeId: string; profiles: unknown[] } })._ior;
  assertEquals(ior.typeId, "IDL:Test:1.0");
  assertEquals(ior.profiles.length, 1);
});
