import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";
import { encodeWithTypeCode } from "../../src/core/cdr/typecode-encoder.ts";
import { decodeWithTypeCode } from "../../src/core/cdr/typecode-decoder.ts";
import { TypeCode } from "../../src/typecode.ts";

Deno.test("TypeCode Encoder/Decoder: Primitive types round-trip", () => {
  // Test short
  {
    const tc = new TypeCode(TypeCode.Kind.tk_short);
    const cdr = new CDROutputStream(256, false);
    const value = 42;

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }

  // Test long
  {
    const tc = new TypeCode(TypeCode.Kind.tk_long);
    const cdr = new CDROutputStream(256, false);
    const value = 123456;

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }

  // Test boolean
  {
    const tc = new TypeCode(TypeCode.Kind.tk_boolean);
    const cdr = new CDROutputStream(256, false);
    const value = true;

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }

  // Test string
  {
    const tc = new TypeCode(TypeCode.Kind.tk_string);
    const cdr = new CDROutputStream(256, false);
    const value = "Hello, CORBA!";

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }

  // Test double
  {
    const tc = new TypeCode(TypeCode.Kind.tk_double);
    const cdr = new CDROutputStream(256, false);
    const value = 3.14159;

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }
});

Deno.test("TypeCode Encoder/Decoder: BigInt types", () => {
  // Test longlong
  {
    const tc = new TypeCode(TypeCode.Kind.tk_longlong);
    const cdr = new CDROutputStream(256, false);
    const value = 9223372036854775807n; // Max int64

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }

  // Test longlong with number input (should convert to bigint)
  {
    const tc = new TypeCode(TypeCode.Kind.tk_longlong);
    const cdr = new CDROutputStream(256, false);
    const value = 12345;

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, BigInt(value));
  }

  // Test ulonglong
  {
    const tc = new TypeCode(TypeCode.Kind.tk_ulonglong);
    const cdr = new CDROutputStream(256, false);
    const value = 18446744073709551615n; // Max uint64

    encodeWithTypeCode(cdr, value, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, value);
  }
});

Deno.test("TypeCode Encoder/Decoder: Sequences", () => {
  // Create a sequence of longs
  const elementType = new TypeCode(TypeCode.Kind.tk_long);
  const tc = new TypeCode(TypeCode.Kind.tk_sequence);
  tc.content_type = () => elementType;

  const cdr = new CDROutputStream(256, false);
  const value = [1, 2, 3, 4, 5];

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc) as number[];

  assertEquals(decoded.length, value.length);
  for (let i = 0; i < value.length; i++) {
    assertEquals(decoded[i], value[i]);
  }
});

Deno.test("TypeCode Encoder/Decoder: Arrays", () => {
  // Create a fixed-size array of strings
  const elementType = new TypeCode(TypeCode.Kind.tk_string);
  const tc = new TypeCode(TypeCode.Kind.tk_array);
  tc.content_type = () => elementType;
  tc.length = () => 3;

  const cdr = new CDROutputStream(256, false);
  const value = ["foo", "bar", "baz"];

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc) as string[];

  assertEquals(decoded.length, value.length);
  for (let i = 0; i < value.length; i++) {
    assertEquals(decoded[i], value[i]);
  }
});

Deno.test("TypeCode Encoder/Decoder: Structs", () => {
  // Create a struct TypeCode with members
  const tc = new TypeCode(TypeCode.Kind.tk_struct);

  // Mock member definitions
  const memberTypes = [
    new TypeCode(TypeCode.Kind.tk_long),
    new TypeCode(TypeCode.Kind.tk_string),
    new TypeCode(TypeCode.Kind.tk_boolean),
  ];
  const memberNames = ["id", "name", "active"];

  tc.member_count = () => 3;
  tc.member_name = (i: number) => memberNames[i];
  tc.member_type = (i: number) => memberTypes[i];

  const cdr = new CDROutputStream(256, false);
  const value = {
    id: 42,
    name: "Test Object",
    active: true,
  };

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc) as Record<string, unknown>;

  assertEquals(decoded.id, value.id);
  assertEquals(decoded.name, value.name);
  assertEquals(decoded.active, value.active);
});

Deno.test("TypeCode Encoder/Decoder: Nested structs", () => {
  // Create an inner struct TypeCode
  const innerTc = new TypeCode(TypeCode.Kind.tk_struct);
  innerTc.member_count = () => 2;
  innerTc.member_name = (i: number) => ["x", "y"][i];
  innerTc.member_type = () => new TypeCode(TypeCode.Kind.tk_double);

  // Create outer struct TypeCode
  const tc = new TypeCode(TypeCode.Kind.tk_struct);
  const memberTypes = [
    new TypeCode(TypeCode.Kind.tk_string),
    innerTc,
    new TypeCode(TypeCode.Kind.tk_long),
  ];
  const memberNames = ["label", "point", "count"];

  tc.member_count = () => 3;
  tc.member_name = (i: number) => memberNames[i];
  tc.member_type = (i: number) => memberTypes[i];

  const cdr = new CDROutputStream(256, false);
  const value = {
    label: "Origin",
    point: { x: 1.5, y: 2.5 },
    count: 100,
  };

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc) as { label: string; point: { x: number; y: number }; count: number };

  assertEquals(decoded.label, value.label);
  assertEquals(decoded.point.x, value.point.x);
  assertEquals(decoded.point.y, value.point.y);
  assertEquals(decoded.count, value.count);
});

Deno.test("TypeCode Encoder/Decoder: Enum types", () => {
  const tc = new TypeCode(TypeCode.Kind.tk_enum);
  const cdr = new CDROutputStream(256, false);
  const value = 2; // Enum ordinal value

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertEquals(decoded, value);
});

Deno.test("TypeCode Encoder/Decoder: Alias types", () => {
  // Create an alias to a string type
  const stringTc = new TypeCode(TypeCode.Kind.tk_string);
  const tc = new TypeCode(TypeCode.Kind.tk_alias);
  tc.content_type = () => stringTc;

  const cdr = new CDROutputStream(256, false);
  const value = "Aliased string value";

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc);

  assertEquals(decoded, value);
});

Deno.test("TypeCode Encoder/Decoder: Null and void types", () => {
  // Test null
  {
    const tc = new TypeCode(TypeCode.Kind.tk_null);
    const cdr = new CDROutputStream(256, false);

    encodeWithTypeCode(cdr, null, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, null);
  }

  // Test void
  {
    const tc = new TypeCode(TypeCode.Kind.tk_void);
    const cdr = new CDROutputStream(256, false);

    encodeWithTypeCode(cdr, undefined, tc);
    const buffer = cdr.getBuffer();

    const inCdr = new CDRInputStream(buffer, false);
    const decoded = decodeWithTypeCode(inCdr, tc);

    assertEquals(decoded, null);
  }
});

Deno.test("TypeCode Encoder/Decoder: Complex nested sequence", () => {
  // Create a sequence of structs
  const structTc = new TypeCode(TypeCode.Kind.tk_struct);
  structTc.member_count = () => 2;
  structTc.member_name = (i: number) => ["id", "value"][i];
  structTc.member_type = (i: number) =>
    i === 0 ? new TypeCode(TypeCode.Kind.tk_long) : new TypeCode(TypeCode.Kind.tk_string);

  const tc = new TypeCode(TypeCode.Kind.tk_sequence);
  tc.content_type = () => structTc;

  const cdr = new CDROutputStream(512, false);
  const value = [
    { id: 1, value: "First" },
    { id: 2, value: "Second" },
    { id: 3, value: "Third" },
  ];

  encodeWithTypeCode(cdr, value, tc);
  const buffer = cdr.getBuffer();

  const inCdr = new CDRInputStream(buffer, false);
  const decoded = decodeWithTypeCode(inCdr, tc) as { id: number; value: string }[];

  assertEquals(decoded.length, value.length);
  for (let i = 0; i < value.length; i++) {
    assertEquals(decoded[i].id, value[i].id);
    assertEquals(decoded[i].value, value[i].value);
  }
});

Deno.test("TypeCode Encoder/Decoder: Any type with unsupported object", () => {
  const tc = new TypeCode(TypeCode.Kind.tk_any);
  const cdr = new CDROutputStream(256, false);
  const value = { test: "data", nested: { value: 123 } };

  // Any type should throw error for objects that can't be auto-typed
  try {
    encodeWithTypeCode(cdr, value, tc);
    assertEquals(true, false, "Expected error for unsupported object in Any");
  } catch (error) {
    assertEquals((error as Error).message.includes("Cannot infer TypeCode"), true);
  }
});

Deno.test("TypeCode Encoder/Decoder: Unknown type handling", () => {
  // Create an unknown TypeCode kind (using a high number)
  const tc = new TypeCode(999 as TypeCode.Kind);
  const cdr = new CDROutputStream(256, false);
  const value = "Unknown type value";

  // Should throw error for unsupported TypeCode kinds (proper CORBA behavior)
  try {
    encodeWithTypeCode(cdr, value, tc);
    assertEquals(true, false, "Expected error for unknown TypeCode kind");
  } catch (error) {
    assertEquals((error as Error).message.includes("Unsupported TypeCode kind"), true);
  }
});
