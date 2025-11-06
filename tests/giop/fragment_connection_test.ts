/**
 * GIOP Fragment Connection Tests
 * Tests for fragment reassembly and cleanup in connection handling
 */

import { assertEquals, assertExists } from "@std/assert";
import { GIOPFragment, GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { AddressingDisposition, GIOPFlags, ReplyStatusType } from "../../src/giop/types.ts";

Deno.test("Fragment Connection: Complete fragmented Reply reassembly", () => {
  // Create initial Reply with fragment flag
  const reply = new GIOPReply({ major: 1, minor: 2 });
  reply.requestId = 42;
  reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
  reply.body = new Uint8Array([1, 2, 3, 4]); // Initial body
  reply.setLittleEndian(false);

  // Manually set the FRAGMENT flag in the serialized message
  const replyBuffer = reply.serialize();
  replyBuffer[6] |= GIOPFlags.FRAGMENT; // Set fragment flag

  // Create first fragment (with more fragments flag)
  const fragment1 = new GIOPFragment({ major: 1, minor: 2 });
  fragment1.requestId = 42;
  fragment1.fragmentBody = new Uint8Array([5, 6, 7, 8]);
  fragment1.setMoreFragments(true); // More fragments follow
  const fragment1Buffer = fragment1.serialize();

  // Create final fragment (without more fragments flag)
  const fragment2 = new GIOPFragment({ major: 1, minor: 2 });
  fragment2.requestId = 42;
  fragment2.fragmentBody = new Uint8Array([9, 10, 11, 12]);
  fragment2.setMoreFragments(false); // Last fragment
  const fragment2Buffer = fragment2.serialize();

  // Verify the fragments were created correctly
  assertExists(replyBuffer);
  assertExists(fragment1Buffer);
  assertExists(fragment2Buffer);
  assertEquals((replyBuffer[6] & 0x02) !== 0, true); // Fragment flag set
  assertEquals((fragment1Buffer[6] & 0x02) !== 0, true); // More fragments
  assertEquals((fragment2Buffer[6] & 0x02) !== 0, false); // Last fragment

  // Note: Full integration test would require a mock server
  // This test validates the message structure is correct
});

Deno.test("Fragment Connection: Fragment flag detection", () => {
  const reply = new GIOPReply();
  reply.requestId = 100;
  reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
  reply.body = new Uint8Array([1, 2, 3]);

  const buffer = reply.serialize();

  // Initially no fragment flag
  assertEquals((buffer[6] & GIOPFlags.FRAGMENT) === 0, true);

  // Set fragment flag
  buffer[6] |= GIOPFlags.FRAGMENT;
  assertEquals((buffer[6] & GIOPFlags.FRAGMENT) !== 0, true);

  // Verify byte order flag is independent
  reply.setLittleEndian(true);
  const buffer2 = reply.serialize();
  assertEquals((buffer2[6] & GIOPFlags.BYTE_ORDER) !== 0, true);
  assertEquals((buffer2[6] & GIOPFlags.FRAGMENT) === 0, true);
});

Deno.test("Fragment Connection: Multiple fragment bodies concatenation", () => {
  // Simulate what happens during reassembly
  const originalBody = new Uint8Array([1, 2, 3, 4]);
  const fragment1Body = new Uint8Array([5, 6, 7, 8]);
  const fragment2Body = new Uint8Array([9, 10, 11, 12]);

  // Concatenate fragments
  const fragments = [fragment1Body, fragment2Body];
  const totalLength = fragments.reduce((sum, frag) => sum + frag.length, 0);
  const fragmentData = new Uint8Array(totalLength);
  let offset = 0;
  for (const frag of fragments) {
    fragmentData.set(frag, offset);
    offset += frag.length;
  }

  // Create complete body
  const completeBody = new Uint8Array(originalBody.length + fragmentData.length);
  completeBody.set(originalBody);
  completeBody.set(fragmentData, originalBody.length);

  assertEquals(completeBody.length, 12);
  assertEquals(completeBody, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]));
});

Deno.test("Fragment Connection: Request with fragment flag", () => {
  const request = new GIOPRequest({ major: 1, minor: 2 });
  request.requestId = 200;
  request.responseExpected = true;
  request.operation = "testOp";
  request.target = {
    disposition: AddressingDisposition.KeyAddr,
    objectKey: new Uint8Array([1, 2, 3, 4]),
  };
  request.body = new Uint8Array([10, 20, 30]);

  const buffer = request.serialize();

  // Add fragment flag
  buffer[6] |= GIOPFlags.FRAGMENT;

  // Deserialize with fragment flag
  const request2 = new GIOPRequest();
  request2.deserialize(buffer);

  assertEquals(request2.requestId, 200);
  assertEquals(request2.operation, "testOp");
  assertEquals(request2.body, new Uint8Array([10, 20, 30]));

  // Verify fragment flag can be detected
  assertEquals((buffer[6] & GIOPFlags.FRAGMENT) !== 0, true);
});

Deno.test("Fragment Connection: Fragment message structure", () => {
  // Test that Fragment messages have correct structure for reassembly
  const fragments: GIOPFragment[] = [];

  // Create 5 fragments
  for (let i = 0; i < 5; i++) {
    const fragment = new GIOPFragment();
    fragment.requestId = 999;
    fragment.fragmentBody = new Uint8Array([i * 10, i * 10 + 1, i * 10 + 2]);
    fragment.setMoreFragments(i < 4); // Last one has no more fragments
    fragments.push(fragment);
  }

  // Verify all fragments have same request ID
  for (const frag of fragments) {
    assertEquals(frag.requestId, 999);
  }

  // Verify more fragments flag
  for (let i = 0; i < 4; i++) {
    assertEquals(fragments[i].hasMoreFragments(), true);
  }
  assertEquals(fragments[4].hasMoreFragments(), false);

  // Verify we can reassemble
  const totalLength = fragments.reduce((sum, frag) => sum + frag.fragmentBody.length, 0);
  assertEquals(totalLength, 15);

  const reassembled = new Uint8Array(totalLength);
  let offset = 0;
  for (const frag of fragments) {
    reassembled.set(frag.fragmentBody, offset);
    offset += frag.fragmentBody.length;
  }

  assertEquals(reassembled[0], 0);
  assertEquals(reassembled[3], 10);
  assertEquals(reassembled[6], 20);
  assertEquals(reassembled[9], 30);
  assertEquals(reassembled[12], 40);
});

Deno.test("Fragment Connection: Cleanup map structure", () => {
  // Test the cleanup data structure behavior
  const fragmentBuffers = new Map<number, Uint8Array[]>();
  const fragmentedMessages = new Map<number, GIOPReply>();
  const fragmentTimestamps = new Map<number, number>();

  // Add some fragments
  const requestId = 42;
  fragmentBuffers.set(requestId, [new Uint8Array([1, 2, 3])]);
  fragmentedMessages.set(requestId, new GIOPReply());
  fragmentTimestamps.set(requestId, Date.now());

  assertEquals(fragmentBuffers.size, 1);
  assertEquals(fragmentedMessages.size, 1);
  assertEquals(fragmentTimestamps.size, 1);

  // Clean up all three
  fragmentBuffers.delete(requestId);
  fragmentedMessages.delete(requestId);
  fragmentTimestamps.delete(requestId);

  assertEquals(fragmentBuffers.size, 0);
  assertEquals(fragmentedMessages.size, 0);
  assertEquals(fragmentTimestamps.size, 0);

  // Test clear method
  fragmentBuffers.set(1, []);
  fragmentBuffers.set(2, []);
  fragmentedMessages.set(1, new GIOPReply());
  fragmentedMessages.set(2, new GIOPReply());
  fragmentTimestamps.set(1, Date.now());
  fragmentTimestamps.set(2, Date.now());

  fragmentBuffers.clear();
  fragmentedMessages.clear();
  fragmentTimestamps.clear();

  assertEquals(fragmentBuffers.size, 0);
  assertEquals(fragmentedMessages.size, 0);
  assertEquals(fragmentTimestamps.size, 0);
});

Deno.test("Fragment Connection: Timeout detection logic", () => {
  const fragmentTimestamps = new Map<number, number>();
  const fragmentTimeout = 30000; // 30 seconds

  const now = Date.now();

  // Add some fragments with different ages
  fragmentTimestamps.set(1, now - 40000); // 40 seconds old (stale)
  fragmentTimestamps.set(2, now - 20000); // 20 seconds old (fresh)
  fragmentTimestamps.set(3, now - 35000); // 35 seconds old (stale)
  fragmentTimestamps.set(4, now - 5000); // 5 seconds old (fresh)

  // Find stale fragments
  const staleRequestIds: number[] = [];
  for (const [requestId, timestamp] of fragmentTimestamps.entries()) {
    if (now - timestamp > fragmentTimeout) {
      staleRequestIds.push(requestId);
    }
  }

  assertEquals(staleRequestIds.length, 2);
  assertEquals(staleRequestIds.includes(1), true);
  assertEquals(staleRequestIds.includes(3), true);
  assertEquals(staleRequestIds.includes(2), false);
  assertEquals(staleRequestIds.includes(4), false);
});

Deno.test("Fragment Connection: Periodic cleanup interval check", () => {
  let lastCleanup = Date.now();
  const cleanupInterval = 10000; // 10 seconds

  // Simulate time passing
  const now1 = lastCleanup + 5000; // 5 seconds later
  assertEquals(now1 - lastCleanup > cleanupInterval, false);

  const now2 = lastCleanup + 11000; // 11 seconds later
  assertEquals(now2 - lastCleanup > cleanupInterval, true);

  // Update last cleanup
  lastCleanup = now2;

  const now3 = lastCleanup + 8000; // 8 seconds after update
  assertEquals(now3 - lastCleanup > cleanupInterval, false);
});
