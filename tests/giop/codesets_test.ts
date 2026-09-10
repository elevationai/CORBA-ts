/**
 * CodeSets Component Parsing Tests
 * Tests for CORBA CodeSetComponentInfo parsing (service context ID 1)
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { IORUtil } from "../../src/giop/ior.ts";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";

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
  // Conversion sets are non-empty and match what JacORB 3.9 advertises for
  // this native pair, minus ISO-8859-15 which core/cdr does not implement.
  assertEquals(parsed.ForCharData.conversion_code_sets, [0x00010001]); // ISO-8859-1
  assertEquals(parsed.ForWcharData.conversion_code_sets, [0x05010001, 0x00010100]); // UTF-8, UCS-2
});

Deno.test("CodeSets: Default component round-trip", () => {
  // Create with defaults (UTF-8, UTF-16)
  const created = IORUtil.createCodeSetsComponent();
  const parsed = IORUtil.parseCodeSetsComponent(created.componentData);

  assertExists(parsed);
  assertEquals(parsed.ForCharData.native_code_set, 0x05010001); // UTF-8
  assertEquals(parsed.ForWcharData.native_code_set, 0x00010109); // UTF-16
  assertEquals(parsed.ForCharData.conversion_code_sets, [0x00010001]); // ISO-8859-1
  assertEquals(parsed.ForWcharData.conversion_code_sets, [0x05010001, 0x00010100]); // UTF-8, UCS-2
});

/**
 * Every advertised set has to survive a round trip through CDR.
 *
 * CONV_FRAME lets a peer select any set in the component, so a set we
 * advertise but cannot transcode is worse than one we never offered: the peer
 * negotiates happily and both sides corrupt every string. UCS-2 was in that
 * state — encoded as UTF-8, decoded as Latin-1 — until the encoder and
 * decoder learned it.
 */
const ADVERTISED_CHAR_SETS: ReadonlyArray<[string, number]> = [
  ["UTF-8 (native)", 0x05010001],
  ["ISO-8859-1", 0x00010001],
];

const ADVERTISED_WCHAR_SETS: ReadonlyArray<[string, number]> = [
  ["UTF-16 (native)", 0x00010109],
  ["UTF-8", 0x05010001],
  ["UCS-2", 0x00010100],
];

/** Latin-1 is the narrowest advertised set, so stay inside it for char. */
const CHAR_SAMPLE = "HDCSQOK#OS=0#SI=00 Ünïcode";
/** BMP only: UCS-2 has no surrogate pairs, so astral characters are out of scope. */
const WCHAR_SAMPLE = "Ünïcode wide ☃ 東京";

for (const [name, codeset] of ADVERTISED_CHAR_SETS) {
  Deno.test(`CodeSets: string round-trips through advertised char set ${name}`, () => {
    const codesets = { charSet: codeset, wcharSet: 0x00010109 };
    const out = new CDROutputStream(256, false, codesets);
    out.writeString(CHAR_SAMPLE);

    const input = new CDRInputStream(out.getBuffer(), false, codesets);
    assertEquals(input.readString(), CHAR_SAMPLE);
  });
}

for (const [name, codeset] of ADVERTISED_WCHAR_SETS) {
  Deno.test(`CodeSets: wstring round-trips through advertised wchar set ${name}`, () => {
    const codesets = { charSet: 0x05010001, wcharSet: codeset };
    const out = new CDROutputStream(256, false, codesets);
    out.writeWString(WCHAR_SAMPLE);

    const input = new CDRInputStream(out.getBuffer(), false, codesets);
    assertEquals(input.readWString(), WCHAR_SAMPLE);
  });
}

Deno.test("CodeSets: UCS-2 and UTF-16 put the same bytes on the wire", () => {
  // JacORB models both as one TwoByteCodeSet differing only in id and name.
  // A peer that negotiates either must see the same stream from us.
  const bytesFor = (wcharSet: number) => {
    const out = new CDROutputStream(256, false, { charSet: 0x05010001, wcharSet });
    out.writeWString(WCHAR_SAMPLE);
    return Array.from(out.getBuffer());
  };

  assertEquals(bytesFor(0x00010100), bytesFor(0x00010109));
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
