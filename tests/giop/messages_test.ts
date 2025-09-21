/**
 * GIOP Message Tests
 */

import { assertEquals, assertExists } from "@std/assert";
import { GIOPCancelRequest, GIOPCloseConnection, GIOPMessageError, GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { AddressingDisposition, GIOPMessageType, ReplyStatusType } from "../../src/giop/types.ts";
import { CDROutputStream } from "../../src/core/cdr/index.ts";

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
  const buffer = request.serialize();
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
  request2.deserialize(buffer);

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
  const buffer = request.serialize();

  // Deserialize
  const request2 = new GIOPRequest();
  request2.deserialize(buffer);

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
  const buffer = reply.serialize();
  assertExists(buffer);

  // Verify GIOP header
  assertEquals(buffer[7], GIOPMessageType.Reply);

  // Deserialize
  const reply2 = new GIOPReply();
  reply2.deserialize(buffer);

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
  const buffer = reply.serialize();
  const reply2 = new GIOPReply();
  reply2.deserialize(buffer);

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

  const buffer = cancel.serialize();
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.CancelRequest);

  // Deserialize
  const cancel2 = new GIOPCancelRequest();
  cancel2.deserialize(buffer);

  assertEquals(cancel2.requestId, 999);
});

Deno.test("GIOP CloseConnection: Serialization", () => {
  const close = new GIOPCloseConnection();

  const buffer = close.serialize();
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.CloseConnection);

  // Verify zero body size
  const view = new DataView(buffer.buffer, buffer.byteOffset + 8, 4);
  assertEquals(view.getUint32(0, false), 0);

  // Deserialize
  const close2 = new GIOPCloseConnection();
  close2.deserialize(buffer);
  // No body to verify
});

Deno.test("GIOP MessageError: Serialization", () => {
  const error = new GIOPMessageError();

  const buffer = error.serialize();
  assertExists(buffer);

  // Verify message type
  assertEquals(buffer[7], GIOPMessageType.MessageError);

  // Deserialize
  const error2 = new GIOPMessageError();
  error2.deserialize(buffer);
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

  const buffer = request.serialize();

  // Check flags byte has little-endian bit set
  assertEquals(buffer[6] & 0x01, 1);

  // Deserialize and verify
  const request2 = new GIOPRequest();
  request2.deserialize(buffer);
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

  const buffer = request.serialize();

  const request2 = new GIOPRequest();
  request2.deserialize(buffer);

  assertEquals(request2.serviceContext.length, 2);
  assertEquals(request2.serviceContext[0].contextId, 1);
  assertEquals(request2.serviceContext[0].contextData, new Uint8Array([10, 20, 30]));
  assertEquals(request2.serviceContext[1].contextId, 2);
  assertEquals(request2.serviceContext[1].contextData, new Uint8Array([40, 50]));
});
