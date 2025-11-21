/**
 * CodeSets Component Parsing Tests
 * Tests for CORBA CodeSetComponentInfo parsing (service context ID 1)
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { IORUtil } from "../../src/giop/ior.ts";

Deno.test("CodeSets: Parse simplified format (IIOP.NET style) - little-endian", () => {
  // Simplified format: 12 bytes total
  // Byte 0: 0x01 = little-endian
  // Bytes 1-3: 0x00 0x00 0x00 = padding
  // Bytes 4-7: 0x01 0x00 0x01 0x05 = 0x05010001 (UTF-8) in little-endian
  // Bytes 8-11: 0x09 0x01 0x01 0x00 = 0x00010109 (UTF-16) in little-endian
  const data = new Uint8Array([
    0x01,
    0x00,
    0x00,
    0x00, // Encapsulation: little-endian + padding
    0x01,
    0x00,
    0x01,
    0x05, // charSet = 0x05010001 (UTF-8)
    0x09,
    0x01,
    0x01,
    0x00, // wcharSet = 0x00010109 (UTF-16)
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x05010001); // UTF-8
  assertEquals(result.ForCharData.conversion_code_sets.length, 0);
  assertEquals(result.ForWcharData.native_code_set, 0x00010109); // UTF-16
  assertEquals(result.ForWcharData.conversion_code_sets.length, 0);
});

Deno.test("CodeSets: Parse simplified format - big-endian", () => {
  // Same as above but big-endian
  const data = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // Encapsulation: big-endian + padding
    0x05,
    0x01,
    0x00,
    0x01, // charSet = 0x05010001 (UTF-8)
    0x00,
    0x01,
    0x01,
    0x09, // wcharSet = 0x00010109 (UTF-16)
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x05010001);
  assertEquals(result.ForCharData.conversion_code_sets.length, 0);
  assertEquals(result.ForWcharData.native_code_set, 0x00010109);
  assertEquals(result.ForWcharData.conversion_code_sets.length, 0);
});

Deno.test("CodeSets: Parse full compliant format with no conversion sets", () => {
  // Full format: 20 bytes total
  // Bytes 0-3: Encapsulation
  // Bytes 4-7: charSet
  // Bytes 8-11: numCharConversion = 0
  // Bytes 12-15: wcharSet
  // Bytes 16-19: numWcharConversion = 0
  const data = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // Encapsulation: big-endian + padding
    0x05,
    0x01,
    0x00,
    0x01, // charSet = 0x05010001 (UTF-8)
    0x00,
    0x00,
    0x00,
    0x00, // numCharConversion = 0
    0x00,
    0x01,
    0x01,
    0x09, // wcharSet = 0x00010109 (UTF-16)
    0x00,
    0x00,
    0x00,
    0x00, // numWcharConversion = 0
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x05010001);
  assertEquals(result.ForCharData.conversion_code_sets.length, 0);
  assertEquals(result.ForWcharData.native_code_set, 0x00010109);
  assertEquals(result.ForWcharData.conversion_code_sets.length, 0);
});

Deno.test("CodeSets: Parse full format with char conversion sets", () => {
  // Full format with 2 char conversion sets
  const data = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // Encapsulation: big-endian + padding
    0x05,
    0x01,
    0x00,
    0x01, // charSet = 0x05010001 (UTF-8)
    0x00,
    0x00,
    0x00,
    0x02, // numCharConversion = 2
    0x00,
    0x01,
    0x00,
    0x01, // conversion set 1 = 0x00010001 (ISO-8859-1)
    0x00,
    0x01,
    0x00,
    0x04, // conversion set 2 = 0x00010004 (ISO-8859-2)
    0x00,
    0x01,
    0x01,
    0x09, // wcharSet = 0x00010109 (UTF-16)
    0x00,
    0x00,
    0x00,
    0x00, // numWcharConversion = 0
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x05010001);
  assertEquals(result.ForCharData.conversion_code_sets.length, 2);
  assertEquals(result.ForCharData.conversion_code_sets[0], 0x00010001); // ISO-8859-1
  assertEquals(result.ForCharData.conversion_code_sets[1], 0x00010004); // ISO-8859-2
  assertEquals(result.ForWcharData.native_code_set, 0x00010109);
  assertEquals(result.ForWcharData.conversion_code_sets.length, 0);
});

Deno.test("CodeSets: Parse full format with both char and wchar conversion sets", () => {
  const data = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // Encapsulation: big-endian + padding
    0x05,
    0x01,
    0x00,
    0x01, // charSet = 0x05010001 (UTF-8)
    0x00,
    0x00,
    0x00,
    0x01, // numCharConversion = 1
    0x00,
    0x01,
    0x00,
    0x01, // conversion set = 0x00010001 (ISO-8859-1)
    0x00,
    0x01,
    0x01,
    0x09, // wcharSet = 0x00010109 (UTF-16)
    0x00,
    0x00,
    0x00,
    0x01, // numWcharConversion = 1
    0x00,
    0x01,
    0x01,
    0x00, // conversion set = 0x00010100 (UCS-2)
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x05010001);
  assertEquals(result.ForCharData.conversion_code_sets.length, 1);
  assertEquals(result.ForCharData.conversion_code_sets[0], 0x00010001);
  assertEquals(result.ForWcharData.native_code_set, 0x00010109);
  assertEquals(result.ForWcharData.conversion_code_sets.length, 1);
  assertEquals(result.ForWcharData.conversion_code_sets[0], 0x00010100);
});

Deno.test("CodeSets: Parse ISO-8859-1 and UTF-16 (CORBA defaults)", () => {
  const data = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // Encapsulation: big-endian + padding
    0x00,
    0x01,
    0x00,
    0x01, // charSet = 0x00010001 (ISO-8859-1)
    0x00,
    0x00,
    0x00,
    0x00, // numCharConversion = 0
    0x00,
    0x01,
    0x01,
    0x09, // wcharSet = 0x00010109 (UTF-16)
    0x00,
    0x00,
    0x00,
    0x00, // numWcharConversion = 0
  ]);

  const result = IORUtil.parseCodeSetsComponent(data);

  assertExists(result);
  assertEquals(result.ForCharData.native_code_set, 0x00010001); // ISO-8859-1
  assertEquals(result.ForWcharData.native_code_set, 0x00010109); // UTF-16
});

Deno.test("CodeSets: Malformed data throws error", () => {
  // Data too short
  const data = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x01]);

  assertThrows(
    () => {
      IORUtil.parseCodeSetsComponent(data);
    },
    Error,
  );
});

Deno.test("CodeSets: Round-trip create and parse", () => {
  // Create a CodeSets component
  const created = IORUtil.createCodeSetsComponent(0x05010001, 0x00010109); // UTF-8, UTF-16

  // Parse it back
  const parsed = IORUtil.parseCodeSetsComponent(created.componentData);

  assertExists(parsed);
  assertEquals(parsed.ForCharData.native_code_set, 0x05010001);
  assertEquals(parsed.ForWcharData.native_code_set, 0x00010109);
  // createCodeSetsComponent always creates format with empty conversion sets
  assertEquals(parsed.ForCharData.conversion_code_sets.length, 0);
  assertEquals(parsed.ForWcharData.conversion_code_sets.length, 0);
});

Deno.test("CodeSets: Default component round-trip", () => {
  // Create with defaults (UTF-8, UTF-16)
  const created = IORUtil.createCodeSetsComponent();
  const parsed = IORUtil.parseCodeSetsComponent(created.componentData);

  assertExists(parsed);
  assertEquals(parsed.ForCharData.native_code_set, 0x05010001); // UTF-8
  assertEquals(parsed.ForWcharData.native_code_set, 0x00010109); // UTF-16
});

Deno.test("CodeSets: Little-endian format with conversion sets", () => {
  // Test little-endian with conversion sets
  // Manually construct little-endian data
  const data = new Uint8Array([
    0x01,
    0x00,
    0x00,
    0x00, // Encapsulation: little-endian + padding
    0x01,
    0x00,
    0x01,
    0x05, // charSet = 0x05010001 (UTF-8) in little-endian
    0x01,
    0x00,
    0x00,
    0x00, // numCharConversion = 1 in little-endian
    0x01,
    0x00,
    0x01,
    0x00, // conversion set = 0x00010001 (ISO-8859-1) in little-endian
    0x09,
    0x01,
    0x01,
    0x00, // wcharSet = 0x00010109 (UTF-16) in little-endian
    0x00,
    0x00,
    0x00,
    0x00, // numWcharConversion = 0 in little-endian
  ]);

  const parsed = IORUtil.parseCodeSetsComponent(data);

  assertExists(parsed);
  assertEquals(parsed.ForCharData.native_code_set, 0x05010001);
  assertEquals(parsed.ForCharData.conversion_code_sets.length, 1);
  assertEquals(parsed.ForCharData.conversion_code_sets[0], 0x00010001);
  assertEquals(parsed.ForWcharData.native_code_set, 0x00010109);
  assertEquals(parsed.ForWcharData.conversion_code_sets.length, 0);
});
