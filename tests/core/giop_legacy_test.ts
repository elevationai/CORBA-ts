/**
 * Tests for the legacy GIOP message classes (GIOPRequestMessage, GIOPReplyMessage)
 * that were updated from placeholder implementations to full CDR-based serialization
 */

import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { createIOR, GIOPReplyMessage, GIOPReplyStatusType, GIOPRequestMessage, IIOPProfile, parseIOR } from "../../src/giop.ts";

Deno.test("GIOP Request: Basic serialization", async () => {
  const request = new GIOPRequestMessage();
  request.request_id = 123;
  request.response_expected = true;
  request.object_key = new TextEncoder().encode("test_key");
  request.operation = "testMethod";
  request.service_context = [
    {
      contextId: 1,
      contextData: new Uint8Array([1, 2, 3, 4]),
    },
  ];

  const serialized = await request.serialize();

  // Should have GIOP header (12 bytes) + body
  assertEquals(serialized.length > 12, true);

  // Check GIOP magic
  const magic = new TextDecoder().decode(serialized.slice(0, 4));
  assertEquals(magic, "GIOP");

  // Check version
  assertEquals(serialized[4], 1); // major
  assertEquals(serialized[5], 2); // minor (default)
});

Deno.test("GIOP Request: Deserialization", async () => {
  const request = new GIOPRequestMessage();
  request.request_id = 456;
  request.operation = "anotherMethod";
  request.object_key = new TextEncoder().encode("another_key");

  const serialized = await request.serialize();

  // Create new request and deserialize
  const request2 = new GIOPRequestMessage();
  await request2.deserialize(serialized, 0);

  assertEquals(request2.request_id, 456);
  assertEquals(request2.operation, "anotherMethod");
  assertEquals(new TextDecoder().decode(request2.object_key), "another_key");
});

Deno.test("GIOP Request: Service context serialization", async () => {
  const request = new GIOPRequestMessage();
  request.service_context = [
    { contextId: 1, contextData: new Uint8Array([0xDE, 0xAD]) },
    { contextId: 2, contextData: new Uint8Array([0xBE, 0xEF]) },
  ];

  const serialized = await request.serialize();

  // Deserialize and check service context
  const request2 = new GIOPRequestMessage();
  await request2.deserialize(serialized, 0);

  assertEquals(request2.service_context.length, 2);
  assertEquals(request2.service_context[0].contextId, 1);
  assertEquals(Array.from(request2.service_context[0].contextData), [0xDE, 0xAD]);
  assertEquals(request2.service_context[1].contextId, 2);
  assertEquals(Array.from(request2.service_context[1].contextData), [0xBE, 0xEF]);
});

Deno.test("GIOP Reply: Basic serialization", async () => {
  const reply = new GIOPReplyMessage();
  reply.request_id = 789;
  reply.reply_status = GIOPReplyStatusType.NO_EXCEPTION;
  reply.service_context = [];

  const serialized = await reply.serialize();

  // Should have GIOP header + body
  assertEquals(serialized.length > 12, true);

  // Check GIOP magic
  const magic = new TextDecoder().decode(serialized.slice(0, 4));
  assertEquals(magic, "GIOP");
});

Deno.test("GIOP Reply: Deserialization", async () => {
  const reply = new GIOPReplyMessage();
  reply.request_id = 999;
  reply.reply_status = GIOPReplyStatusType.SYSTEM_EXCEPTION;

  const serialized = await reply.serialize();

  // Deserialize
  const reply2 = new GIOPReplyMessage();
  await reply2.deserialize(serialized, 0);

  assertEquals(reply2.request_id, 999);
  assertEquals(reply2.reply_status, GIOPReplyStatusType.SYSTEM_EXCEPTION);
});

Deno.test("GIOP Reply: Exception status", async () => {
  const reply = new GIOPReplyMessage();
  reply.reply_status = GIOPReplyStatusType.USER_EXCEPTION;

  const serialized = await reply.serialize();
  const reply2 = new GIOPReplyMessage();
  await reply2.deserialize(serialized, 0);

  assertEquals(reply2.reply_status, GIOPReplyStatusType.USER_EXCEPTION);
});

Deno.test("GIOP: GIOP 1.0 vs 1.2 serialization", async () => {
  // Test GIOP 1.0
  const request10 = new GIOPRequestMessage();
  request10.header.version.minor = 0; // Force GIOP 1.0
  request10.operation = "test";

  const serialized10 = await request10.serialize();

  // Test GIOP 1.2
  const request12 = new GIOPRequestMessage();
  request12.header.version.minor = 2; // GIOP 1.2
  request12.operation = "test";

  const serialized12 = await request12.serialize();

  // Both should serialize without error
  assertEquals(serialized10.length > 12, true);
  assertEquals(serialized12.length > 12, true);

  // Version bytes should be different
  assertEquals(serialized10[5], 0); // GIOP 1.0
  assertEquals(serialized12[5], 2); // GIOP 1.2
});

Deno.test("GIOP: Endianness handling", async () => {
  const request = new GIOPRequestMessage();
  request.header.flags = 0x01; // Little endian

  const serialized = await request.serialize();

  // Flags should be preserved
  assertEquals(serialized[6] & 0x01, 0x01);
});

Deno.test("IOR: Parse and create round-trip", async () => {
  const testProfile: IIOPProfile = {
    version: { major: 1, minor: 0 },
    host: "testhost.com",
    port: 8080,
    object_key: new TextEncoder().encode("test_object"),
    components: [
      { tag: 1, data: new Uint8Array([1, 2, 3]) },
    ],
  };

  // Create IOR string
  const iorString = await createIOR(testProfile);
  assertEquals(iorString.startsWith("IOR:"), true);

  // Parse it back
  const parsedProfile = await parseIOR(iorString);
  assertEquals(parsedProfile !== null, true);

  if (parsedProfile) {
    assertEquals(parsedProfile.host, "testhost.com");
    assertEquals(parsedProfile.port, 8080);
    assertEquals(new TextDecoder().decode(parsedProfile.object_key), "test_object");
  }
});

Deno.test("IOR: Parse invalid IOR", async () => {
  const result = await parseIOR("INVALID:notanior");
  assertEquals(result, null);
});

Deno.test("IOR: Parse empty IOR", async () => {
  const result = await parseIOR("");
  assertEquals(result, null);
});

Deno.test("IOR: Create with complex components", async () => {
  const profile: IIOPProfile = {
    version: { major: 1, minor: 2 },
    host: "complex.example.com",
    port: 9999,
    object_key: new TextEncoder().encode("complex_key"),
    components: [
      { tag: 0, data: new Uint8Array([0xCA, 0xFE, 0xBA, 0xBE]) },
      { tag: 1, data: new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]) },
    ],
  };

  const iorString = await createIOR(profile);
  assertEquals(iorString.startsWith("IOR:"), true);
  assertEquals(iorString.length > 10, true); // Should be substantial length
});
