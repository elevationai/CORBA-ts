/**
 * CDR Encoder/Decoder Tests
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { CDROutputStream } from "../../src/core/cdr/encoder.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";

Deno.test("CDR: primitive types round-trip", () => {
  const out = new CDROutputStream();

  // Write various primitive types
  out.writeOctet(255);
  out.writeBoolean(true);
  out.writeBoolean(false);
  out.writeShort(-32768);
  out.writeShort(32767);
  out.writeUShort(65535);
  out.writeLong(-2147483648);
  out.writeLong(2147483647);
  out.writeULong(4294967295);
  out.writeLongLong(BigInt("-9223372036854775808"));
  out.writeLongLong(BigInt("9223372036854775807"));
  out.writeULongLong(BigInt("18446744073709551615"));
  out.writeFloat(3.14159);
  out.writeDouble(Math.PI);
  out.writeChar("A");
  out.writeWChar("中");

  // Read back and verify
  const inp = new CDRInputStream(out.getBuffer());

  assertEquals(inp.readOctet(), 255);
  assertEquals(inp.readBoolean(), true);
  assertEquals(inp.readBoolean(), false);
  assertEquals(inp.readShort(), -32768);
  assertEquals(inp.readShort(), 32767);
  assertEquals(inp.readUShort(), 65535);
  assertEquals(inp.readLong(), -2147483648);
  assertEquals(inp.readLong(), 2147483647);
  assertEquals(inp.readULong(), 4294967295);
  assertEquals(inp.readLongLong(), BigInt("-9223372036854775808"));
  assertEquals(inp.readLongLong(), BigInt("9223372036854775807"));
  assertEquals(inp.readULongLong(), BigInt("18446744073709551615"));
  assertEquals(Math.abs(inp.readFloat() - 3.14159) < 0.00001, true);
  assertEquals(inp.readDouble(), Math.PI);
  assertEquals(inp.readChar(), "A");
  assertEquals(inp.readWChar(), "中");
});

Deno.test("CDR: string encoding/decoding", () => {
  const out = new CDROutputStream();

  const testStrings = [
    "",
    "Hello",
    "Hello, World!",
    "Unicode: 你好世界",
    "Emoji: 🎉🎊",
    "Special chars: \n\t\r",
    "a".repeat(1000),
  ];

  for (const str of testStrings) {
    out.writeString(str);
  }

  const inp = new CDRInputStream(out.getBuffer());

  for (const expected of testStrings) {
    const actual = inp.readString();
    assertEquals(actual, expected);
  }
});

Deno.test("CDR: wide string encoding/decoding", () => {
  const out = new CDROutputStream();

  const testStrings = [
    "",
    "Wide String",
    "日本語テスト",
    "Mixed: English 中文 日本語",
    "Symbols: ∀∃∈∉∋∌⊂⊃",
  ];

  for (const str of testStrings) {
    out.writeWString(str);
  }

  const inp = new CDRInputStream(out.getBuffer());

  for (const expected of testStrings) {
    const actual = inp.readWString();
    assertEquals(actual, expected);
  }
});

Deno.test("CDR: alignment", () => {
  const out = new CDROutputStream();

  // Test alignment requirements
  out.writeOctet(1); // Position: 1
  out.writeShort(2); // Should align to 2, position: 4
  assertEquals(out.getPosition(), 4);

  out.writeOctet(3); // Position: 5
  out.writeLong(4); // Should align to 4, position: 12
  assertEquals(out.getPosition(), 12);

  out.writeOctet(5); // Position: 13
  out.writeDouble(6.0); // Should align to 8, position: 24
  assertEquals(out.getPosition(), 24);

  // Verify data integrity after alignment
  const inp = new CDRInputStream(out.getBuffer());
  assertEquals(inp.readOctet(), 1);
  assertEquals(inp.readShort(), 2);
  assertEquals(inp.readOctet(), 3);
  assertEquals(inp.readLong(), 4);
  assertEquals(inp.readOctet(), 5);
  assertEquals(inp.readDouble(), 6.0);
});

Deno.test("CDR: octet sequence", () => {
  const out = new CDROutputStream();

  const data1 = new Uint8Array([1, 2, 3, 4, 5]);
  const data2 = new Uint8Array(1000).fill(42);
  const data3 = new Uint8Array(0); // Empty array

  out.writeOctetSequence(data1);
  out.writeOctetSequence(data2);
  out.writeOctetSequence(data3);

  const inp = new CDRInputStream(out.getBuffer());

  const read1 = inp.readOctetSequence();
  const read2 = inp.readOctetSequence();
  const read3 = inp.readOctetSequence();

  assertEquals(read1, data1);
  assertEquals(read2, data2);
  assertEquals(read3, data3);
});

Deno.test("CDR: little-endian encoding", () => {
  const out = new CDROutputStream(256, true); // Little-endian

  out.writeShort(0x1234);
  out.writeLong(0x12345678);
  out.writeDouble(Math.PI);

  const buffer = out.getBuffer();

  // Verify little-endian byte order
  assertEquals(buffer[0], 0x34); // LSB first for short
  assertEquals(buffer[1], 0x12); // MSB second

  // Read back with little-endian decoder
  const inp = new CDRInputStream(buffer, true);
  assertEquals(inp.readShort(), 0x1234);
  assertEquals(inp.readLong(), 0x12345678);
  assertEquals(inp.readDouble(), Math.PI);
});

Deno.test("CDR: big-endian encoding", () => {
  const out = new CDROutputStream(256, false); // Big-endian

  out.writeShort(0x1234);
  out.writeLong(0x12345678);
  out.writeDouble(Math.PI);

  const buffer = out.getBuffer();

  // Verify big-endian byte order
  assertEquals(buffer[0], 0x12); // MSB first for short
  assertEquals(buffer[1], 0x34); // LSB second

  // Read back with big-endian decoder
  const inp = new CDRInputStream(buffer, false);
  assertEquals(inp.readShort(), 0x1234);
  assertEquals(inp.readLong(), 0x12345678);
  assertEquals(inp.readDouble(), Math.PI);
});

Deno.test("CDR: buffer underflow detection", () => {
  const buffer = new Uint8Array(4);
  const inp = new CDRInputStream(buffer);

  // Try to read more than available
  inp.readLong(); // Uses all 4 bytes

  assertThrows(
    () => inp.readOctet(),
    Error,
    "Buffer underflow",
  );
});

Deno.test("CDR: buffer growth", () => {
  const out = new CDROutputStream(4); // Start with tiny buffer

  // Write more than initial capacity
  for (let i = 0; i < 100; i++) {
    out.writeLong(i);
  }

  // Should have grown automatically
  const buffer = out.getBuffer();
  assertEquals(buffer.length, 400); // 100 longs * 4 bytes

  // Verify data integrity
  const inp = new CDRInputStream(buffer);
  for (let i = 0; i < 100; i++) {
    assertEquals(inp.readLong(), i);
  }
});

Deno.test("CDR: special float values", () => {
  const out = new CDROutputStream();

  out.writeFloat(NaN);
  out.writeFloat(Infinity);
  out.writeFloat(-Infinity);
  out.writeDouble(NaN);
  out.writeDouble(Infinity);
  out.writeDouble(-Infinity);

  const inp = new CDRInputStream(out.getBuffer());

  assertEquals(isNaN(inp.readFloat()), true);
  assertEquals(inp.readFloat(), Infinity);
  assertEquals(inp.readFloat(), -Infinity);
  assertEquals(isNaN(inp.readDouble()), true);
  assertEquals(inp.readDouble(), Infinity);
  assertEquals(inp.readDouble(), -Infinity);
});

// Buffer underflow tests - these prove the issue exists in the current code
Deno.test("CDR: readString() buffer underflow with corrupted 67MB length", () => {
  // This is the EXACT error from the logs:
  // "Failed to decode output parameter: Error: Buffer underflow: need 67108863 bytes, have 208"
  
  // Create a 208-byte buffer where first 4 bytes = 0x03FFFFFF (67108863 in decimal)
  const buffer = new Uint8Array(208);
  buffer[0] = 0x03;
  buffer[1] = 0xFF;
  buffer[2] = 0xFF;
  buffer[3] = 0xFF;
  
  const cdr = new CDRInputStream(buffer, false); // big-endian
  
  // This now throws an error before attempting the huge read
  assertThrows(
    () => cdr.readString(),
    Error,
    "Invalid string length: 67108863 (remaining: 204)"
  );
});

Deno.test("CDR: readString() buffer underflow with corrupted 16MB length", () => {
  // This is the OTHER error from the logs:
  // "Failed to decode output parameter: Error: Buffer underflow: need 16777215 bytes, have 176"
  
  // Create a 176-byte buffer where first 4 bytes = 0x00FFFFFF (16777215 in decimal)
  const buffer = new Uint8Array(176);
  buffer[0] = 0x00;
  buffer[1] = 0xFF;
  buffer[2] = 0xFF;
  buffer[3] = 0xFF;
  
  const cdr = new CDRInputStream(buffer, false); // big-endian
  
  // This now throws an error before attempting the huge read
  assertThrows(
    () => cdr.readString(),
    Error,
    "Invalid string length: 16777215 (remaining: 172)"
  );
});

Deno.test("CDR: missing bounds checking on string length", () => {
  // Even if we had enough memory, trying to allocate 67MB for a string is wrong
  
  const buffer = new Uint8Array(12);
  buffer[0] = 0x03;
  buffer[1] = 0xFF;
  buffer[2] = 0xFF;
  buffer[3] = 0xFF;  // length = 67108863
  
  const cdr = new CDRInputStream(buffer, false);
  const length = cdr.readULong();
  
  // This proves we're reading an insane length value
  assertEquals(length, 67108863);
  
  // And trying to use it will crash
  assertThrows(
    () => cdr.readOctetArray(length),
    Error,
    "Buffer underflow"
  );
});

Deno.test("CDR: endianness mismatch causes incorrect length values", () => {
  // If server sends little-endian but we read as big-endian, we get garbage
  
  // Write a reasonable length (30) in little-endian
  const buffer = new Uint8Array(8);
  buffer[0] = 0x1E;  // 30 in little-endian
  buffer[1] = 0x00;
  buffer[2] = 0x00;
  buffer[3] = 0x00;
  
  // But read it as big-endian
  const cdr = new CDRInputStream(buffer, false);
  const length = cdr.readULong();
  
  // We get 0x1E000000 = 503316480 instead of 30!
  assertEquals(length, 503316480);
  
  // Trying to read that much data will fail
  assertThrows(
    () => cdr.readOctetArray(length),
    Error,
    "Buffer underflow"
  );
});
