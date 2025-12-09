/**
 * GIOP (General Inter-ORB Protocol) Implementation
 * Based on CORBA 3.4 specification
 */

import { getLogger } from "logging-ts";
import type { ServiceContext } from "./giop/types.ts";
import type { CDRInputStream } from "./core/cdr/decoder.ts";
import type { CDROutputStream } from "./core/cdr/encoder.ts";

const logger = getLogger("CORBA");

// Export all GIOP types and classes
export * from "./giop/types.ts";
export * from "./giop/messages.ts";
export * from "./giop/ior.ts";
export * from "./giop/connection.ts";
export * from "./giop/transport.ts";

/**
 * Legacy GIOP Message Types (deprecated, use giop/types.ts)
 */
export enum GIOPMessageType {
  Request = 0,
  Reply = 1,
  CancelRequest = 2,
  LocateRequest = 3,
  LocateReply = 4,
  CloseConnection = 5,
  MessageError = 6,
  Fragment = 7,
}

/**
 * GIOP Message Header
 */
export interface GIOPHeader {
  magic: string; // "GIOP"
  version: {
    major: number;
    minor: number;
  };
  flags: number;
  message_type: GIOPMessageType;
  message_size: number;
}

/**
 * GIOP Reply Status Types
 */
export enum GIOPReplyStatusType {
  NO_EXCEPTION = 0,
  USER_EXCEPTION = 1,
  SYSTEM_EXCEPTION = 2,
  LOCATION_FORWARD = 3,
  LOCATION_FORWARD_PERM = 4,
  NEEDS_ADDRESSING_MODE = 5,
}

/**
 * GIOP Message Base
 */
export abstract class GIOPMessage {
  header: GIOPHeader;

  constructor(messageType: GIOPMessageType) {
    this.header = {
      magic: "GIOP",
      version: {
        major: 1,
        minor: 2,
      },
      flags: 0,
      message_type: messageType,
      message_size: 0,
    };
  }

  /**
   * Serialize the message to a buffer
   */
  abstract serialize(): Promise<Uint8Array>;

  /**
   * Deserialize a message from a buffer
   */
  abstract deserialize(buffer: Uint8Array, offset: number): Promise<number>;

  /**
   * Read GIOP header from buffer
   */
  protected readHeader(buffer: Uint8Array): void {
    if (buffer.length < 12) {
      throw new Error("Buffer too small for GIOP header");
    }

    // Read magic number
    const magic = new TextDecoder().decode(buffer.slice(0, 4));
    if (magic !== "GIOP") {
      throw new Error(`Invalid GIOP magic: ${magic}`);
    }
    this.header.magic = magic;

    // Read version
    this.header.version = {
      major: buffer[4],
      minor: buffer[5],
    };

    // Read flags
    this.header.flags = buffer[6];

    // Read message type
    this.header.message_type = buffer[7];

    // Read message size (endian-dependent)
    const view = new DataView(buffer.buffer, buffer.byteOffset + 8, 4);
    this.header.message_size = view.getUint32(0, this.isLittleEndian());
  }

  /**
   * Check if message uses little-endian byte order
   */
  protected isLittleEndian(): boolean {
    return (this.header.flags & 0x01) !== 0;
  }
}

/**
 * GIOP Request Message
 */
export class GIOPRequestMessage extends GIOPMessage {
  request_id: number;
  response_expected: boolean;
  reserved: Uint8Array; // 3 bytes
  object_key: Uint8Array;
  operation: string;
  service_context: ServiceContext[];

  constructor() {
    super(GIOPMessageType.Request);
    this.request_id = 0;
    this.response_expected = true;
    this.reserved = new Uint8Array(3);
    this.object_key = new Uint8Array(0);
    this.operation = "";
    this.service_context = [];
  }

  async serialize(): Promise<Uint8Array> {
    const { CDROutputStream } = await import("./core/cdr/encoder.ts");
    const cdr = new CDROutputStream(256, false); // Big-endian by default

    // Write GIOP header placeholder (will be filled later)
    cdr.writeOctetArray(new TextEncoder().encode(this.header.magic));
    cdr.writeOctet(this.header.version.major);
    cdr.writeOctet(this.header.version.minor);
    cdr.writeOctet(this.header.flags);
    cdr.writeOctet(this.header.message_type);

    // Placeholder for message size (will be updated)
    const messageSizePos = cdr.getPosition();
    cdr.writeULong(0);

    const bodyStart = cdr.getPosition();

    // Serialize body based on GIOP version
    if (this.header.version.minor <= 1) {
      this.serializeRequest_1_0(cdr);
    }
    else {
      this.serializeRequest_1_2(cdr);
    }

    // Update message size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + messageSizePos, 4);
    view.setUint32(0, bodySize, false); // Big-endian

    return buffer;
  }

  private serializeRequest_1_0(cdr: CDROutputStream): void {
    // Service context
    this.writeServiceContext(cdr, this.service_context);

    // Request ID
    cdr.writeULong(this.request_id);

    // Response expected
    cdr.writeBoolean(this.response_expected);

    // Reserved
    cdr.writeOctetArray(this.reserved);

    // Object key
    cdr.writeULong(this.object_key.length);
    cdr.writeOctetArray(this.object_key);

    // Operation
    cdr.writeString(this.operation);

    // Requesting principal (deprecated)
    cdr.writeULong(0);
  }

  private serializeRequest_1_2(cdr: CDROutputStream): void {
    // Request ID
    cdr.writeULong(this.request_id);

    // Response flags
    const responseFlags = this.response_expected ? 0x03 : 0x00;
    cdr.writeOctet(responseFlags);

    // Reserved
    cdr.writeOctetArray(this.reserved);

    // Target address (KeyAddr)
    cdr.writeShort(0); // KeyAddr
    cdr.writeULong(this.object_key.length);
    cdr.writeOctetArray(this.object_key);

    // Operation
    cdr.writeString(this.operation);

    // Service context
    this.writeServiceContext(cdr, this.service_context);

    // Align for body
    cdr.align(8);
  }

  private writeServiceContext(cdr: CDROutputStream, contexts: ServiceContext[]): void {
    cdr.writeULong(contexts.length);
    for (const ctx of contexts) {
      cdr.writeULong(ctx.contextId);
      cdr.writeULong(ctx.contextData.length);
      cdr.writeOctetArray(ctx.contextData);
    }
  }

  async deserialize(buffer: Uint8Array, offset: number = 0): Promise<number> {
    const { CDRInputStream } = await import("./core/cdr/decoder.ts");

    // Read GIOP header
    this.readHeader(buffer.slice(offset));

    // Create CDR stream from body
    const bodyOffset = offset + 12;
    const cdr = new CDRInputStream(
      buffer.slice(bodyOffset),
      this.isLittleEndian(),
    );

    // Deserialize based on GIOP version
    if (this.header.version.minor <= 1) {
      this.deserializeRequest_1_0(cdr);
    }
    else {
      this.deserializeRequest_1_2(cdr);
    }

    return offset + 12 + this.header.message_size;
  }

  private deserializeRequest_1_0(cdr: CDRInputStream): void {
    // Service context
    this.service_context = this.readServiceContext(cdr);

    // Request ID
    this.request_id = cdr.readULong();

    // Response expected
    this.response_expected = cdr.readBoolean();

    // Reserved
    this.reserved = cdr.readOctetArray(3);

    // Object key
    const keyLength = cdr.readULong();
    this.object_key = cdr.readOctetArray(keyLength);

    // Operation
    this.operation = cdr.readString();

    // Requesting principal (skip)
    const principalLength = cdr.readULong();
    if (principalLength > 0) {
      cdr.readOctetArray(principalLength);
    }
  }

  private deserializeRequest_1_2(cdr: CDRInputStream): void {
    // Request ID
    this.request_id = cdr.readULong();

    // Response flags
    const responseFlags = cdr.readOctet();
    this.response_expected = (responseFlags & 0x03) !== 0;

    // Reserved
    this.reserved = cdr.readOctetArray(3);

    // Target address
    const addressingDisposition = cdr.readShort();
    if (addressingDisposition === 0) { // KeyAddr
      const keyLength = cdr.readULong();
      this.object_key = cdr.readOctetArray(keyLength);
    }
    else {
      throw new Error(`Unsupported addressing disposition: ${addressingDisposition}`);
    }

    // Operation
    this.operation = cdr.readString();

    // Service context
    this.service_context = this.readServiceContext(cdr);

    // Skip alignment
    cdr.align(8);
  }

  private readServiceContext(cdr: CDRInputStream): ServiceContext[] {
    const count = cdr.readULong();
    const contexts: ServiceContext[] = [];

    for (let i = 0; i < count; i++) {
      const contextId = cdr.readULong();
      const dataLength = cdr.readULong();
      const contextData = cdr.readOctetArray(dataLength);
      contexts.push({ contextId, contextData });
    }

    return contexts;
  }
}

/**
 * GIOP Reply Message
 */
export class GIOPReplyMessage extends GIOPMessage {
  request_id: number;
  reply_status: GIOPReplyStatusType;
  service_context: ServiceContext[];

  constructor() {
    super(GIOPMessageType.Reply);
    this.request_id = 0;
    this.reply_status = GIOPReplyStatusType.NO_EXCEPTION;
    this.service_context = [];
  }

  async serialize(): Promise<Uint8Array> {
    const { CDROutputStream } = await import("./core/cdr/encoder.ts");
    const cdr = new CDROutputStream(256, false); // Big-endian by default

    // Write GIOP header placeholder (will be filled later)
    cdr.writeOctetArray(new TextEncoder().encode(this.header.magic));
    cdr.writeOctet(this.header.version.major);
    cdr.writeOctet(this.header.version.minor);
    cdr.writeOctet(this.header.flags);
    cdr.writeOctet(this.header.message_type);

    // Placeholder for message size (will be updated)
    const messageSizePos = cdr.getPosition();
    cdr.writeULong(0);

    const bodyStart = cdr.getPosition();

    // Serialize body based on GIOP version
    if (this.header.version.minor <= 1) {
      this.serializeReply_1_0(cdr);
    }
    else {
      this.serializeReply_1_2(cdr);
    }

    // Update message size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + messageSizePos, 4);
    view.setUint32(0, bodySize, false); // Big-endian

    return buffer;
  }

  private serializeReply_1_0(cdr: CDROutputStream): void {
    // Service context
    this.writeServiceContext(cdr, this.service_context);

    // Request ID
    cdr.writeULong(this.request_id);

    // Reply status
    cdr.writeULong(this.reply_status);
  }

  private serializeReply_1_2(cdr: CDROutputStream): void {
    // Request ID
    cdr.writeULong(this.request_id);

    // Reply status
    cdr.writeULong(this.reply_status);

    // Service context
    this.writeServiceContext(cdr, this.service_context);

    // Align for body
    cdr.align(8);
  }

  private writeServiceContext(cdr: CDROutputStream, contexts: ServiceContext[]): void {
    cdr.writeULong(contexts.length);
    for (const ctx of contexts) {
      cdr.writeULong(ctx.contextId);
      cdr.writeULong(ctx.contextData.length);
      cdr.writeOctetArray(ctx.contextData);
    }
  }

  async deserialize(buffer: Uint8Array, offset: number = 0): Promise<number> {
    const { CDRInputStream } = await import("./core/cdr/decoder.ts");

    // Read GIOP header
    this.readHeader(buffer.slice(offset));

    // Create CDR stream from body
    const bodyOffset = offset + 12;
    const cdr = new CDRInputStream(
      buffer.slice(bodyOffset),
      this.isLittleEndian(),
    );

    // Deserialize based on GIOP version
    if (this.header.version.minor <= 1) {
      this.deserializeReply_1_0(cdr);
    }
    else {
      this.deserializeReply_1_2(cdr);
    }

    return offset + 12 + this.header.message_size;
  }

  private deserializeReply_1_0(cdr: CDRInputStream): void {
    // Service context
    this.service_context = this.readServiceContext(cdr);

    // Request ID
    this.request_id = cdr.readULong();

    // Reply status
    this.reply_status = cdr.readULong();
  }

  private deserializeReply_1_2(cdr: CDRInputStream): void {
    // Request ID
    this.request_id = cdr.readULong();

    // Reply status
    this.reply_status = cdr.readULong();

    // Service context
    this.service_context = this.readServiceContext(cdr);

    // Skip alignment
    cdr.align(8);
  }

  private readServiceContext(cdr: CDRInputStream): ServiceContext[] {
    const count = cdr.readULong();
    const contexts: ServiceContext[] = [];

    for (let i = 0; i < count; i++) {
      const contextId = cdr.readULong();
      const dataLength = cdr.readULong();
      const contextData = cdr.readOctetArray(dataLength);
      contexts.push({ contextId, contextData });
    }

    return contexts;
  }
}

/**
 * IIOP Profile
 */
export interface IIOPProfile {
  version: {
    major: number;
    minor: number;
  };
  host: string;
  port: number;
  object_key: Uint8Array;
  components: IIOPProfileComponent[];
}

/**
 * IIOP Profile Component
 */
export interface IIOPProfileComponent {
  tag: number;
  data: Uint8Array;
}

/**
 * Create a GIOP Message from a buffer
 */
export function createGIOPMessage(buffer: Uint8Array): GIOPMessage | null {
  if (buffer.length < 12) {
    return null; // Not enough data for header
  }

  // Check GIOP magic
  const magic = String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
  if (magic !== "GIOP") {
    return null;
  }

  // Get message type
  const messageType = buffer[7] as GIOPMessageType;

  let message: GIOPMessage;

  switch (messageType) {
    case GIOPMessageType.Request:
      message = new GIOPRequestMessage();
      break;
    case GIOPMessageType.Reply:
      message = new GIOPReplyMessage();
      break;
    default:
      // Other message types would be implemented in a complete implementation
      return null;
  }

  // Deserialize the message
  message.deserialize(buffer, 0);

  return message;
}

/**
 * Parse an IOR (Interoperable Object Reference) string
 */
export async function parseIOR(iorString: string): Promise<IIOPProfile | null> {
  try {
    const { IORUtil } = await import("./giop/ior.ts");
    const ior = IORUtil.fromString(iorString);

    // Extract IIOP profile from the IOR
    for (const profile of ior.profiles) {
      if (profile.profileId === 0) { // TAG_INTERNET_IOP
        const { CDRInputStream } = await import("./core/cdr/decoder.ts");
        const cdr = new CDRInputStream(profile.profileData, false); // Assume big-endian

        // Read IIOP profile body
        const iiop_version = {
          major: cdr.readOctet(),
          minor: cdr.readOctet(),
        };
        const host = cdr.readString();
        const port = cdr.readUShort();
        const keyLength = cdr.readULong();
        const object_key = cdr.readOctetArray(keyLength);

        // Read components (if any remaining data)
        const components: IIOPProfileComponent[] = [];
        try {
          while (cdr.remaining() > 0) {
            const tag = cdr.readULong();
            const dataLength = cdr.readULong();
            const data = cdr.readOctetArray(dataLength);
            components.push({ tag, data });
          }
        }
        catch {
          // No more components
        }

        return {
          version: iiop_version,
          host,
          port,
          object_key,
          components,
        };
      }
    }

    return null;
  }
  catch (error) {
    logger.error("Failed to parse IOR");
    logger.exception(error);
    return null;
  }
}

/**
 * Create an IOR string
 */
export async function createIOR(profile: IIOPProfile): Promise<string> {
  try {
    const { IORUtil } = await import("./giop/ior.ts");
    const { CDROutputStream } = await import("./core/cdr/encoder.ts");

    // Create IIOP profile data
    const profileCdr = new CDROutputStream(256, false); // Big-endian
    profileCdr.writeOctet(profile.version.major);
    profileCdr.writeOctet(profile.version.minor);
    profileCdr.writeString(profile.host);
    profileCdr.writeUShort(profile.port);
    profileCdr.writeULong(profile.object_key.length);
    profileCdr.writeOctetArray(profile.object_key);

    // Write components
    for (const component of profile.components) {
      profileCdr.writeULong(component.tag);
      profileCdr.writeULong(component.data.length);
      profileCdr.writeOctetArray(component.data);
    }

    // Create IOR with tagged profile
    const ior = {
      typeId: "", // Default empty type ID
      profiles: [{
        profileId: 0, // TAG_INTERNET_IOP
        profileData: profileCdr.getBuffer(),
      }],
    };

    return IORUtil.toString(ior);
  }
  catch (error) {
    logger.error("Failed to create IOR");
    logger.exception(error);
    return "IOR:"; // Return minimal IOR on error
  }
}
