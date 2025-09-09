/**
 * Tests for Any type encoding/decoding improvements
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import { encodeWithTypeCode } from "../../src/core/cdr/typecode-encoder.ts";
import { decodeWithTypeCode } from "../../src/core/cdr/typecode-decoder.ts";
import { TypeCode } from "../../src/typecode.ts";
import { Any } from "../../src/core/cdr/any.ts";
import { TCKind, TypeCode as CDRTypeCode } from "../../src/core/cdr/typecode.ts";

Deno.test("Any encoding: Encodes TypeCode + value", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  // Create an Any with a long value
  const any = new Any(
    new CDRTypeCode(TCKind.tk_long),
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
    new CDRTypeCode(TCKind.tk_string),
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
  assertEquals(decodedAny.type.kind, TCKind.tk_string);
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
    new CDRTypeCode(TCKind.tk_boolean),
    true,
  );

  const outerAny = new Any(
    new CDRTypeCode(TCKind.tk_any),
    innerAny,
  );

  encodeWithTypeCode(cdr, outerAny, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const decodedOuter = decoded as Any;
  assertEquals(decodedOuter.type.kind, TCKind.tk_any);

  const decodedInner = decodedOuter.value as Any;
  assertEquals(decodedInner instanceof Any, true);
  assertEquals(decodedInner.type.kind, TCKind.tk_boolean);
  assertEquals(decodedInner.value, true);
});

Deno.test("Any encoding: Handles arrays", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  const array = [1, 2, 3, 4, 5];
  encodeWithTypeCode(cdr, array, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  const decodedAny = decoded as Any;

  // Should have been encoded as sequence
  assertEquals(Array.isArray(decodedAny.value), true);
  assertEquals(decodedAny.value as number[], array);
});

Deno.test("Any encoding: Rejects generic objects", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_any);

  const obj = { name: "test", value: 123 };

  // Generic objects should be rejected for Any encoding (proper CORBA behavior)
  try {
    encodeWithTypeCode(cdr, obj, tc);
    assertEquals(true, false, "Expected error for generic object in Any");
  } catch (error) {
    assertEquals((error as Error).message.includes("Cannot infer TypeCode"), true);
  }
});

Deno.test("Object reference encoding: Handles IOR strings", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_objref);

  const objRef = {
    _ior:
      "IOR:000000000000001649444c3a546573742f536572766963653a312e3000000000010000000000000068000102000000000a6c6f63616c686f7374000050000000000000087465737400",
  };

  encodeWithTypeCode(cdr, objRef, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  assertEquals(typeof (decoded as { _ior: string })._ior, "string");
  assertEquals((decoded as { _ior: string })._ior, objRef._ior);
});

Deno.test("Object reference encoding: Handles null references", () => {
  const cdr = new CDROutputStream();
  const tc = new TypeCode(TypeCode.Kind.tk_objref);

  encodeWithTypeCode(cdr, null, tc);

  // Decode it back
  const inCdr = new CDRInputStream(cdr.getBuffer());
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  assertEquals((decoded as { _ior: string })._ior, "");
});

Deno.test("Object reference decoding: Returns proper structure", () => {
  const cdr = new CDROutputStream();

  // Manually write an IOR string
  cdr.writeString("IOR:0123456789ABCDEF");

  const inCdr = new CDRInputStream(cdr.getBuffer());
  const tc = new TypeCode(TypeCode.Kind.tk_objref);
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertExists(decoded);
  assertEquals(typeof decoded, "object");
  assertEquals("_ior" in (decoded as object), true);
});
