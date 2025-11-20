/**
 * GIOP Message Tests
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  GIOPCancelRequest,
  GIOPCloseConnection,
  GIOPFragment,
  GIOPLocateReply,
  GIOPLocateRequest,
  GIOPMessageError,
  GIOPReply,
  GIOPRequest,
} from "../../src/giop/messages.ts";
import { AddressingDisposition, GIOPMessageType, LocateStatusType, ReplyStatusType } from "../../src/giop/types.ts";
import { CDROutputStream } from "../../src/core/cdr/index.ts";
import { CDRInputStream } from "../../src/core/cdr/decoder.ts";

Deno.test("GIOP Request: Basic serialization/deserialization", () => {
  const request = new GIOPRequest({ major: 1, minor: 2 });
  request.requestId = 42;
  request.responseExpected = true;
  request.operation = "testOperation";
  request.objectKey = new Uint8Array([1, 2, 3, 4]);
  request.body = new Uint8Array([5, 6, 7, 8]);

  // Set target for GIOP 1.2
  request.target = {
    disposition: AddressingDisposition.KeyAddr,
    objectKey: new Uint8Array([1, 2, 3, 4]),
  };

  // Serialize
  const buffer = request.serialize(null);
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[0], 0x47); // 'G'
  assertEquals(buffer[1], 0x49); // 'I'
  assertEquals(buffer[2], 0x4F); // 'O'
  assertEquals(buffer[3], 0x50); // 'P'
  assertEquals(buffer[4], 1); // Major version
  assertEquals(buffer[5], 2); // Minor version
  assertEquals(buffer[7], GIOPMessageType.Request);

  // Deserialize
  const request2 = new GIOPRequest();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  request2.deserialize(cdr, 12);

  assertEquals(request2.requestId, 42);
  assertEquals(request2.responseExpected, true);
  assertEquals(request2.operation, "testOperation");
  assertExists(request2.target);
  assertEquals(request2.target.disposition, AddressingDisposition.KeyAddr);
});

Deno.test("GIOP Request: GIOP 1.0 compatibility", () => {
  const request = new GIOPRequest({ major: 1, minor: 0 });
  request.requestId = 123;
  request.responseExpected = false;
  request.operation = "legacyOp";
  request.objectKey = new Uint8Array([10, 20, 30]);
  request.body = new Uint8Array([40, 50, 60]);

  // Serialize
  const buffer = request.serialize(null);

  // Deserialize
  const request2 = new GIOPRequest({ major: buffer[4], minor: buffer[5] });
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  request2.deserialize(cdr, 12);

  assertEquals(request2.requestId, 123);
  assertEquals(request2.responseExpected, false);
  assertEquals(request2.operation, "legacyOp");
  assertEquals(request2.objectKey, new Uint8Array([10, 20, 30]));
});

Deno.test("GIOP Reply: Basic serialization/deserialization", () => {
  const reply = new GIOPReply({ major: 1, minor: 2 });
  reply.requestId = 42;
  reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
  reply.body = new Uint8Array([1, 2, 3, 4]);

  // Serialize
  const buffer = reply.serialize(null);
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[7], GIOPMessageType.Reply);

  // Deserialize
  const reply2 = new GIOPReply();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  reply2.deserialize(cdr, 12);

  assertEquals(reply2.requestId, 42);
  assertEquals(reply2.replyStatus, ReplyStatusType.NO_EXCEPTION);

  // Body should be the same regardless of version
  assertEquals(reply2.body, new Uint8Array([1, 2, 3, 4]));
});

Deno.test("GIOP Reply: System exception handling", () => {
  const reply = new GIOPReply();
  reply.requestId = 100;
  reply.replyStatus = ReplyStatusType.SYSTEM_EXCEPTION;

  // Create system exception body matching the reply's endianness
  const cdr = new CDROutputStream(256, reply.isLittleEndian());
  cdr.writeString("IDL:omg.org/CORBA/UNKNOWN:1.0");
  cdr.writeULong(42); // Minor code
  cdr.writeULong(0); // Completion status
  reply.body = cdr.getBuffer();

  // Serialize and deserialize
  const buffer = reply.serialize(null);
  const reply2 = new GIOPReply();
  const inputCdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  reply2.deserialize(inputCdr, 12);

  // Extract system exception
  const sysEx = reply2.getSystemException();
  assertExists(sysEx);
  assertEquals(sysEx.exceptionId, "IDL:omg.org/CORBA/UNKNOWN:1.0");
  assertEquals(sysEx.minor, 42);
  assertEquals(sysEx.completionStatus, 0);
});

Deno.test("GIOP CancelRequest: Serialization", () => {
  const cancel = new GIOPCancelRequest();
  cancel.requestId = 999;

  const buffer = cancel.serialize(null);
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.CancelRequest);

  // Deserialize
  const cancel2 = new GIOPCancelRequest();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  cancel2.deserialize(cdr);

  assertEquals(cancel2.requestId, 999);
});

Deno.test("GIOP CloseConnection: Serialization", () => {
  const close = new GIOPCloseConnection();

  const buffer = close.serialize(null);
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.CloseConnection);

  // Verify zero body size
  const view = new DataView(buffer.buffer, buffer.byteOffset + 8, 4);
  assertEquals(view.getUint32(0, false), 0);

  // Deserialize
  const close2 = new GIOPCloseConnection();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  close2.deserialize(cdr);
  // No body to verify
});

Deno.test("GIOP MessageError: Serialization", () => {
  const error = new GIOPMessageError();

  const buffer = error.serialize(null);
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.MessageError);

  // Deserialize
  const error2 = new GIOPMessageError();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  error2.deserialize(cdr);
  // No body to verify
});

Deno.test("GIOP: Little-endian flag handling", () => {
  const request = new GIOPRequest();
  request.setLittleEndian(true);
  request.target = {
    disposition: AddressingDisposition.KeyAddr,
    objectKey: new Uint8Array([1, 2, 3]),
  };

  assertEquals(request.isLittleEndian(), true);

  const buffer = request.serialize(null);

  // Check flags byte has little-endian bit set
  assertEquals(buffer[6] & 0x01, 1);

  // Deserialize and verify
  const request2 = new GIOPRequest({ major: buffer[4], minor: buffer[5] });
  request2.header.flags = buffer[6]; // Copy flags from buffer
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  request2.deserialize(cdr, 12);
  assertEquals(request2.isLittleEndian(), true);
});

Deno.test("GIOP: Service context handling", () => {
  const request = new GIOPRequest();
  request.target = {
    disposition: AddressingDisposition.KeyAddr,
    objectKey: new Uint8Array([10, 20]),
  };
  request.serviceContext = [
    {
      contextId: 1,
      contextData: new Uint8Array([10, 20, 30]),
    },
    {
      contextId: 2,
      contextData: new Uint8Array([40, 50]),
    },
  ];

  const buffer = request.serialize(null);

  const request2 = new GIOPRequest();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  request2.deserialize(cdr, 12);

  assertEquals(request2.serviceContext.length, 2);
  assertEquals(request2.serviceContext[0].contextId, 1);
  assertEquals(request2.serviceContext[0].contextData, new Uint8Array([10, 20, 30]));
  assertEquals(request2.serviceContext[1].contextId, 2);
  assertEquals(request2.serviceContext[1].contextData, new Uint8Array([40, 50]));
});

Deno.test("GIOP Fragment: Basic serialization/deserialization", () => {
  const fragment = new GIOPFragment({ major: 1, minor: 1 });
  fragment.requestId = 42;
  fragment.fragmentBody = new Uint8Array([1, 2, 3, 4, 5]);

  // Serialize
  const buffer = fragment.serialize(null);
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[0], 0x47); // 'G'
  assertEquals(buffer[1], 0x49); // 'I'
  assertEquals(buffer[2], 0x4F); // 'O'
  assertEquals(buffer[3], 0x50); // 'P'
  assertEquals(buffer[4], 1); // Major version
  assertEquals(buffer[5], 1); // Minor version
  assertEquals(buffer[7], GIOPMessageType.Fragment);

  // Deserialize
  const fragment2 = new GIOPFragment();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  fragment2.deserialize(cdr);

  assertEquals(fragment2.requestId, 42);
  assertEquals(fragment2.fragmentBody, new Uint8Array([1, 2, 3, 4, 5]));
});

Deno.test("GIOP Fragment: More fragments flag", () => {
  const fragment = new GIOPFragment();
  fragment.requestId = 100;
  fragment.fragmentBody = new Uint8Array([10, 20, 30]);

  // Test setting more fragments flag
  fragment.setMoreFragments(true);
  assertEquals(fragment.hasMoreFragments(), true);

  const buffer = fragment.serialize(null);

  // Check flags byte has fragment bit set (bit 1)
  assertEquals((buffer[6] & 0x02) !== 0, true);

  // Deserialize and verify
  const fragment2 = new GIOPFragment({ major: buffer[4], minor: buffer[5] });
  fragment2.header.flags = buffer[6]; // Copy flags from buffer
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  fragment2.deserialize(cdr);
  assertEquals(fragment2.hasMoreFragments(), true);

  // Test clearing more fragments flag
  fragment.setMoreFragments(false);
  assertEquals(fragment.hasMoreFragments(), false);

  const buffer2 = fragment.serialize(null);
  assertEquals((buffer2[6] & 0x02) !== 0, false);
});

Deno.test("GIOP Fragment: Empty fragment body", () => {
  const fragment = new GIOPFragment();
  fragment.requestId = 999;
  fragment.fragmentBody = new Uint8Array(0);

  const buffer = fragment.serialize(null);
  assertExists(buffer);

  const fragment2 = new GIOPFragment();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  fragment2.deserialize(cdr);

  assertEquals(fragment2.requestId, 999);
  assertEquals(fragment2.fragmentBody.length, 0);
});

Deno.test("GIOP Fragment: Large fragment body", () => {
  const fragment = new GIOPFragment();
  fragment.requestId = 500;
  // Create a large fragment body (1MB)
  fragment.fragmentBody = new Uint8Array(1024 * 1024);
  for (let i = 0; i < fragment.fragmentBody.length; i++) {
    fragment.fragmentBody[i] = i % 256;
  }

  const buffer = fragment.serialize(null);
  assertExists(buffer);

  const fragment2 = new GIOPFragment();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  fragment2.deserialize(cdr);

  assertEquals(fragment2.requestId, 500);
  assertEquals(fragment2.fragmentBody.length, 1024 * 1024);
  // Verify some sample bytes
  assertEquals(fragment2.fragmentBody[0], 0);
  assertEquals(fragment2.fragmentBody[100], 100);
  assertEquals(fragment2.fragmentBody[1000], 1000 % 256);
});

Deno.test("GIOP LocateRequest: Basic serialization/deserialization (GIOP 1.2)", () => {
  const locReq = new GIOPLocateRequest({ major: 1, minor: 2 });
  locReq.requestId = 42;
  locReq.target = {
    disposition: AddressingDisposition.KeyAddr,
    objectKey: new Uint8Array([1, 2, 3, 4]),
  };

  // Serialize
  const buffer = locReq.serialize(null);
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[0], 0x47); // 'G'
  assertEquals(buffer[1], 0x49); // 'I'
  assertEquals(buffer[2], 0x4F); // 'O'
  assertEquals(buffer[3], 0x50); // 'P'
  assertEquals(buffer[7], GIOPMessageType.LocateRequest);

  // Deserialize
  const locReq2 = new GIOPLocateRequest();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  locReq2.deserialize(cdr);

  assertEquals(locReq2.requestId, 42);
  assertExists(locReq2.target);
  assertEquals(locReq2.target.disposition, AddressingDisposition.KeyAddr);
});

Deno.test("GIOP LocateRequest: GIOP 1.0 compatibility", () => {
  const locReq = new GIOPLocateRequest({ major: 1, minor: 0 });
  locReq.requestId = 123;
  locReq.objectKey = new Uint8Array([10, 20, 30, 40]);

  // Serialize
  const buffer = locReq.serialize(null);

  // Deserialize
  const locReq2 = new GIOPLocateRequest({ major: buffer[4], minor: buffer[5] });
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  locReq2.deserialize(cdr);

  assertEquals(locReq2.requestId, 123);
  assertEquals(locReq2.objectKey, new Uint8Array([10, 20, 30, 40]));
});

Deno.test("GIOP LocateReply: Basic serialization/deserialization", () => {
  const locReply = new GIOPLocateReply({ major: 1, minor: 2 });
  locReply.requestId = 42;
  locReply.locateStatus = LocateStatusType.OBJECT_HERE;
  locReply.body = new Uint8Array([1, 2, 3, 4]);

  // Serialize
  const buffer = locReply.serialize(null);
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[7], GIOPMessageType.LocateReply);

  // Deserialize
  const locReply2 = new GIOPLocateReply();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  locReply2.deserialize(cdr);

  assertEquals(locReply2.requestId, 42);
  assertEquals(locReply2.locateStatus, LocateStatusType.OBJECT_HERE);
  assertEquals(locReply2.body, new Uint8Array([1, 2, 3, 4]));
});

Deno.test("GIOP LocateReply: UNKNOWN_OBJECT status", () => {
  const locReply = new GIOPLocateReply();
  locReply.requestId = 100;
  locReply.locateStatus = LocateStatusType.UNKNOWN_OBJECT;
  locReply.body = new Uint8Array(0); // No additional data

  const buffer = locReply.serialize(null);
  assertExists(buffer);

  const locReply2 = new GIOPLocateReply();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  locReply2.deserialize(cdr);

  assertEquals(locReply2.requestId, 100);
  assertEquals(locReply2.locateStatus, LocateStatusType.UNKNOWN_OBJECT);
  assertEquals(locReply2.body.length, 0);
});

Deno.test("GIOP LocateReply: OBJECT_FORWARD status", () => {
  const locReply = new GIOPLocateReply();
  locReply.requestId = 200;
  locReply.locateStatus = LocateStatusType.OBJECT_FORWARD;
  // In practice, body would contain IOR data
  locReply.body = new Uint8Array([5, 6, 7, 8, 9, 10]);

  const buffer = locReply.serialize(null);
  assertExists(buffer);

  const locReply2 = new GIOPLocateReply();
  const cdr = new CDRInputStream(buffer.subarray(12), (buffer[6] & 0x01) !== 0);
  locReply2.deserialize(cdr);

  assertEquals(locReply2.requestId, 200);
  assertEquals(locReply2.locateStatus, LocateStatusType.OBJECT_FORWARD);
  assertEquals(locReply2.body, new Uint8Array([5, 6, 7, 8, 9, 10]));
});
