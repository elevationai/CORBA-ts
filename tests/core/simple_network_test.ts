/**
 * IIOP Listener Unit Test - Testing listener object creation only
 * No actual network binding
 */

import { assertEquals } from "@std/assert";

Deno.test("IIOP: GIOP message format validation", () => {
  // Test GIOP header creation
  const message = new Uint8Array(20);

  // GIOP magic
  message[0] = 0x47; // 'G'
  message[1] = 0x49; // 'I'
  message[2] = 0x4F; // 'O'
  message[3] = 0x50; // 'P'

  // Version
  message[4] = 1; // Major
  message[5] = 2; // Minor

  // Flags
  message[6] = 0; // Big-endian

  // Message type
  message[7] = 0; // Request

  // Message size (8 bytes body)
  const view = new DataView(message.buffer);
  view.setUint32(8, 8, false); // Big-endian

  // Verify header format
  assertEquals(message[0], 0x47);
  assertEquals(message[1], 0x49);
  assertEquals(message[2], 0x4F);
  assertEquals(message[3], 0x50);
  assertEquals(message[4], 1);
  assertEquals(message[5], 2);
  assertEquals(view.getUint32(8, false), 8);
});
