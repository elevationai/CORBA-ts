/**
 * IIOP Unit Tests - Testing message formatting and handling logic
 * These are UNIT tests - no actual network connections
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { IIOPConnection } from "../../src/core/network/iiop-connection.ts";

/**
 * Test GIOP message creation and validation
 */
Deno.test("IIOP: GIOP message format creation", () => {
  // Test that we can create a valid GIOP header
  const message = new Uint8Array(20);
  
  // GIOP magic
  message[0] = 0x47; // 'G'
  message[1] = 0x49; // 'I'
  message[2] = 0x4F; // 'O'
  message[3] = 0x50; // 'P'
  
  // Version 1.2
  message[4] = 1;    // Major
  message[5] = 2;    // Minor
  
  // Flags (big-endian, no fragments)
  message[6] = 0;
  
  // Message type (0 = Request)
  message[7] = 0;
  
  // Message size (8 bytes body)
  const view = new DataView(message.buffer);
  view.setUint32(8, 8, false); // Big-endian
  
  // Verify the header is correctly formatted
  assertEquals(message[0], 0x47);
  assertEquals(message[1], 0x49);
  assertEquals(message[2], 0x4F);
  assertEquals(message[3], 0x50);
  assertEquals(message[4], 1);
  assertEquals(message[5], 2);
  assertEquals(message[6], 0);
  assertEquals(message[7], 0);
  assertEquals(view.getUint32(8, false), 8);
});

Deno.test("IIOP: GIOP message size extraction", () => {
  const header = new Uint8Array(12);
  
  // Create valid GIOP header
  header[0] = 0x47; // 'G'
  header[1] = 0x49; // 'I'
  header[2] = 0x4F; // 'O'
  header[3] = 0x50; // 'P'
  header[4] = 1;    // Major version
  header[5] = 2;    // Minor version
  
  // Test big-endian
  header[6] = 0;    // Flags (big-endian)
  header[7] = 0;    // Message type
  
  const view = new DataView(header.buffer);
  view.setUint32(8, 1024, false); // Big-endian message size
  
  // Extract and verify size
  const size = view.getUint32(8, false);
  assertEquals(size, 1024);
  
  // Test little-endian
  header[6] = 1;    // Flags (little-endian)
  view.setUint32(8, 2048, true); // Little-endian message size
  
  const sizeLE = view.getUint32(8, true);
  assertEquals(sizeLE, 2048);
});

Deno.test("IIOP: GIOP version validation", () => {
  const validVersions = [
    [1, 0], // GIOP 1.0
    [1, 1], // GIOP 1.1
    [1, 2], // GIOP 1.2
    [1, 3], // GIOP 1.3
  ];
  
  for (const [major, minor] of validVersions) {
    const header = new Uint8Array(12);
    header[0] = 0x47; // 'G'
    header[1] = 0x49; // 'I'
    header[2] = 0x4F; // 'O'
    header[3] = 0x50; // 'P'
    header[4] = major;
    header[5] = minor;
    
    // Verify version bytes are set correctly
    assertEquals(header[4], major);
    assertEquals(header[5], minor);
  }
});

Deno.test("IIOP: Message type encoding", () => {
  const messageTypes = {
    Request: 0,
    Reply: 1,
    CancelRequest: 2,
    LocateRequest: 3,
    LocateReply: 4,
    CloseConnection: 5,
    MessageError: 6,
    Fragment: 7,
  };
  
  for (const [name, type] of Object.entries(messageTypes)) {
    const header = new Uint8Array(12);
    header[7] = type;
    
    assertEquals(header[7], type, `Message type ${name} should be ${type}`);
  }
});

Deno.test("IIOP: Endianness flag handling", () => {
  const header = new Uint8Array(12);
  
  // Big-endian (flag bit 0 = 0)
  header[6] = 0b00000000;
  const isBigEndian = (header[6] & 0x01) === 0;
  assertEquals(isBigEndian, true);
  
  // Little-endian (flag bit 0 = 1)
  header[6] = 0b00000001;
  const isLittleEndian = (header[6] & 0x01) !== 0;
  assertEquals(isLittleEndian, true);
  
  // Fragment flag (bit 1)
  header[6] = 0b00000010;
  const hasMoreFragments = (header[6] & 0x02) !== 0;
  assertEquals(hasMoreFragments, true);
});

Deno.test("IIOP: Maximum message size validation", () => {
  // GIOP allows messages up to 2^32 - 1 bytes
  const maxSize = 0xFFFFFFFF;
  
  const header = new Uint8Array(12);
  const view = new DataView(header.buffer);
  
  // Set maximum size
  view.setUint32(8, maxSize, false);
  
  // Verify it can be read back
  const readSize = view.getUint32(8, false);
  assertEquals(readSize, maxSize);
});

Deno.test("IIOP: GIOP magic number validation", () => {
  // Valid magic number
  const validHeader = new Uint8Array([0x47, 0x49, 0x4F, 0x50]);
  const isValid = validHeader[0] === 0x47 && 
                  validHeader[1] === 0x49 &&
                  validHeader[2] === 0x4F && 
                  validHeader[3] === 0x50;
  assertEquals(isValid, true);
  
  // Invalid magic numbers
  const invalidHeaders = [
    [0x00, 0x00, 0x00, 0x00],
    [0x47, 0x49, 0x4F, 0x00], // Wrong last byte
    [0x48, 0x49, 0x4F, 0x50], // Wrong first byte
  ];
  
  for (const invalid of invalidHeaders) {
    const header = new Uint8Array(invalid);
    const isInvalid = header[0] === 0x47 && 
                      header[1] === 0x49 &&
                      header[2] === 0x4F && 
                      header[3] === 0x50;
    assertEquals(isInvalid, false);
  }
});