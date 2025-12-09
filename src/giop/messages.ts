/**
 * GIOP Message Implementations
 * CORBA 3.4 Specification compliant
 */

import { getLogger } from "logging-ts";
import { CDRInputStream, CDROutputStream, NegotiatedCodeSets } from "../core/cdr/index.ts";
import {
  AddressingDisposition,
  GIOPFlags,
  GIOPHeader,
  GIOPMessageType,
  GIOPVersion,
  IOR,
  LocateStatusType,
  ReplyStatusType,
  ServiceContext,
  SystemExceptionReplyBody,
  TaggedProfile,
  TargetAddress,
} from "./types.ts";

const logger = getLogger("CORBA");

/**
 * Base class for all GIOP messages
 */
export abstract class GIOPMessage {
  public header: GIOPHeader;

  constructor(
    messageType: GIOPMessageType,
    version: GIOPVersion = { major: 1, minor: 2 },
  ) {
    this.header = {
      magic: new Uint8Array([0x47, 0x49, 0x4F, 0x50]), // "GIOP"
      version,
      flags: 0,
      messageType,
      messageSize: 0,
    };
  }

  /**
   * Set endianness flag
   */
  setLittleEndian(littleEndian: boolean): void {
    if (littleEndian) {
      this.header.flags |= GIOPFlags.BYTE_ORDER;
    }
    else {
      this.header.flags &= ~GIOPFlags.BYTE_ORDER;
    }
  }

  /**
   * Check if message uses little-endian byte order
   */
  isLittleEndian(): boolean {
    return (this.header.flags & GIOPFlags.BYTE_ORDER) !== 0;
  }

  /**
   * Get GIOP version
   */
  get version(): GIOPVersion {
    return this.header.version;
  }

  /**
   * Serialize the message to a buffer
   */
  abstract serialize(codesets: NegotiatedCodeSets | null): Uint8Array;

  /**
   * Deserialize the message from a CDR stream.
   * The stream should be positioned at the start of the message body.
   */
  abstract deserialize(cdr: CDRInputStream, headerSize: number): void;

  /**
   * Write GIOP header to CDR stream
   */
  protected writeHeader(cdr: CDROutputStream): void {
    cdr.writeOctetArray(this.header.magic);
    cdr.writeOctet(this.header.version.major);
    cdr.writeOctet(this.header.version.minor);
    cdr.writeOctet(this.header.flags);
    cdr.writeOctet(this.header.messageType);
    cdr.writeULong(this.header.messageSize);
  }

  /**
   * Write service context list
   */
  protected writeServiceContext(cdr: CDROutputStream, contexts: ServiceContext[]): void {
    cdr.writeULong(contexts.length);
    for (const ctx of contexts) {
      cdr.writeULong(ctx.contextId);
      cdr.writeULong(ctx.contextData.length);
      cdr.writeOctetArray(ctx.contextData);
    }
  }

  /**
   * Read service context list
   */
  protected readServiceContext(cdr: CDRInputStream): ServiceContext[] {
    const count = cdr.readULong();
    const contexts: ServiceContext[] = [];

    for (let i = 0; i < count; i++) {
      const contextId = cdr.readULong();
      const length = cdr.readULong();
      const contextData = cdr.readOctetArray(length);
      contexts.push({ contextId, contextData });
    }

    return contexts;
  }
}

/**
 * GIOP Request Message
 */
export class GIOPRequest extends GIOPMessage {
  public serviceContext: ServiceContext[] = [];
  public requestId: number = 0;
  public responseExpected: boolean = true;
  public reserved: Uint8Array = new Uint8Array(3);
  public target?: TargetAddress;
  public objectKey?: Uint8Array; // For GIOP 1.0/1.1
  public operation: string = "";
  public requestingPrincipal?: Uint8Array; // Deprecated in GIOP 1.2+
  public body: Uint8Array = new Uint8Array(0);

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.Request, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(1024, this.isLittleEndian(), codesets);

    // Write header placeholder
    this.writeHeader(cdr);

    // Remember position for size update
    const bodySizePos = cdr.getPosition() - 4;
    const bodyStart = cdr.getPosition();

    // Write request based on version
    if (this.header.version.minor <= 1) {
      this.serializeRequest_1_0(cdr);
    }
    else {
      this.serializeRequest_1_2(cdr);
    }

    // Calculate and update body size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + bodySizePos, 4);
    view.setUint32(0, bodySize, this.isLittleEndian());

    return buffer;
  }

  private serializeRequest_1_0(cdr: CDROutputStream): void {
    // Service context
    this.writeServiceContext(cdr, this.serviceContext);

    // Request ID
    cdr.writeULong(this.requestId);

    // Response expected
    cdr.writeBoolean(this.responseExpected);

    // Reserved
    cdr.writeOctetArray(this.reserved);

    // Object key
    if (this.objectKey) {
      cdr.writeULong(this.objectKey.length);
      cdr.writeOctetArray(this.objectKey);
    }
    else {
      cdr.writeULong(0);
    }

    // Operation
    cdr.writeString(this.operation);

    // Requesting principal (deprecated)
    cdr.writeULong(0);

    // Message body
    cdr.writeOctetArray(this.body);
  }

  private serializeRequest_1_2(cdr: CDROutputStream): void {
    // Request ID
    cdr.writeULong(this.requestId);

    // Response flags
    const responseFlags = this.responseExpected ? 0x03 : 0x00;
    cdr.writeOctet(responseFlags);

    // Reserved
    cdr.writeOctetArray(this.reserved);

    // Target address
    if (this.target) {
      this.writeTargetAddress(cdr, this.target);
    }
    else if (this.objectKey) {
      // Default to KeyAddr
      cdr.writeShort(AddressingDisposition.KeyAddr);
      cdr.writeULong(this.objectKey.length);
      cdr.writeOctetArray(this.objectKey);
    }
    else {
      throw new Error("No target address specified");
    }

    // Operation
    cdr.writeString(this.operation);

    // Service context
    this.writeServiceContext(cdr, this.serviceContext);

    // Align for body
    cdr.align(8);

    // Message body
    cdr.writeOctetArray(this.body);
  }

  private writeTargetAddress(cdr: CDROutputStream, target: TargetAddress): void {
    cdr.writeShort(target.disposition);

    switch (target.disposition) {
      case AddressingDisposition.KeyAddr:
        cdr.writeULong(target.objectKey.length);
        cdr.writeOctetArray(target.objectKey);
        break;

      case AddressingDisposition.ProfileAddr:
        this.writeTaggedProfile(cdr, target.profile);
        break;

      case AddressingDisposition.ReferenceAddr:
        this.writeIOR(cdr, target.ior);
        break;
    }
  }

  private writeTaggedProfile(cdr: CDROutputStream, profile: TaggedProfile): void {
    cdr.writeULong(profile.profileId);
    cdr.writeULong(profile.profileData.length);
    cdr.writeOctetArray(profile.profileData);
  }

  private writeIOR(cdr: CDROutputStream, ior: IOR): void {
    cdr.writeString(ior.typeId);
    cdr.writeULong(ior.profiles.length);
    for (const profile of ior.profiles) {
      this.writeTaggedProfile(cdr, profile);
    }
  }

  deserialize(cdr: CDRInputStream, _headerSize: number): void {
    if (this.header.version.minor <= 1) {
      this.deserializeRequest_1_0(cdr);
    }
    else {
      this.deserializeRequest_1_2(cdr);
    }
  }

  private deserializeRequest_1_0(cdr: CDRInputStream): void {
    // Service context
    this.serviceContext = this.readServiceContext(cdr);

    // Request ID
    this.requestId = cdr.readULong();

    // Response expected
    this.responseExpected = cdr.readBoolean();

    // Reserved
    this.reserved = cdr.readOctetArray(3);

    // Object key
    const keyLength = cdr.readULong();
    this.objectKey = cdr.readOctetArray(keyLength);

    // Operation
    this.operation = cdr.readString();

    // Requesting principal
    const principalLength = cdr.readULong();
    if (principalLength > 0) {
      this.requestingPrincipal = cdr.readOctetArray(principalLength);
    }

    // Rest is body
    this.body = cdr.readRemaining();
  }

  private deserializeRequest_1_2(cdr: CDRInputStream): void {
    // Request ID
    this.requestId = cdr.readULong();

    // Response flags
    const responseFlags = cdr.readOctet();
    this.responseExpected = (responseFlags & 0x03) !== 0;

    // Reserved
    this.reserved = cdr.readOctetArray(3);

    // Target address
    this.target = this.readTargetAddress(cdr);

    // Operation
    this.operation = cdr.readString();

    // Service context
    this.serviceContext = this.readServiceContext(cdr);

    // Align for body
    cdr.align(8);

    // Rest is body
    this.body = cdr.readRemaining();
  }

  private readTargetAddress(cdr: CDRInputStream): TargetAddress {
    const disposition = cdr.readShort();

    switch (disposition) {
      case AddressingDisposition.KeyAddr: {
        const length = cdr.readULong();
        const objectKey = cdr.readOctetArray(length);
        return { disposition, objectKey };
      }

      case AddressingDisposition.ProfileAddr: {
        const profile = this.readTaggedProfile(cdr);
        return { disposition, profile };
      }

      case AddressingDisposition.ReferenceAddr: {
        const ior = this.readIOR(cdr);
        return { disposition, ior };
      }

      default:
        throw new Error(`Unknown addressing disposition: ${disposition}`);
    }
  }

  private readTaggedProfile(cdr: CDRInputStream): TaggedProfile {
    const profileId = cdr.readULong();
    const length = cdr.readULong();
    const profileData = cdr.readOctetArray(length);
    return { profileId, profileData };
  }

  private readIOR(cdr: CDRInputStream): IOR {
    const typeId = cdr.readString();
    const profileCount = cdr.readULong();
    const profiles: TaggedProfile[] = [];

    for (let i = 0; i < profileCount; i++) {
      profiles.push(this.readTaggedProfile(cdr));
    }

    return { typeId, profiles };
  }
}

/**
 * GIOP Reply Message
 */
export class GIOPReply extends GIOPMessage {
  public serviceContext: ServiceContext[] = [];
  public requestId: number = 0;
  public replyStatus: ReplyStatusType = ReplyStatusType.NO_EXCEPTION;
  public body: Uint8Array = new Uint8Array(0);

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.Reply, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(1024, this.isLittleEndian(), codesets);

    // Write header placeholder
    this.writeHeader(cdr);

    // Remember position for size update
    const bodySizePos = cdr.getPosition() - 4;
    const bodyStart = cdr.getPosition();

    // Write reply based on version
    if (this.header.version.minor <= 1) {
      this.serializeReply_1_0(cdr);
    }
    else {
      this.serializeReply_1_2(cdr);
    }

    // Calculate and update body size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + bodySizePos, 4);
    view.setUint32(0, bodySize, this.isLittleEndian());

    return buffer;
  }

  private serializeReply_1_0(cdr: CDROutputStream): void {
    // Service context
    this.writeServiceContext(cdr, this.serviceContext);

    // Request ID
    cdr.writeULong(this.requestId);

    // Reply status
    cdr.writeULong(this.replyStatus);

    // Message body
    cdr.writeOctetArray(this.body);
  }

  private serializeReply_1_2(cdr: CDROutputStream): void {
    // GIOP 1.2 field order: request_id, reply_status, service_context
    // Request ID
    cdr.writeULong(this.requestId);

    // Reply status
    cdr.writeULong(this.replyStatus);

    // Service context
    this.writeServiceContext(cdr, this.serviceContext);

    // GIOP 1.2 aligns body to 8-byte boundary
    cdr.align(8);

    // Message body
    cdr.writeOctetArray(this.body);
  }

  deserialize(cdr: CDRInputStream, headerSize: number): void {
    if (this.header.version.minor <= 1) {
      this.deserializeReply_1_0(cdr);
    }
    else {
      this.deserializeReply_1_2(cdr, headerSize);
    }
  }

  private deserializeReply_1_0(cdr: CDRInputStream): void {
    // Service context
    this.serviceContext = this.readServiceContext(cdr);

    // Request ID
    this.requestId = cdr.readULong();

    // Reply status
    this.replyStatus = cdr.readULong();

    // Rest is body
    this.body = cdr.readRemaining();
  }

  private deserializeReply_1_2(cdr: CDRInputStream, headerSize: number): void {
    logger.debug("Deserializing GIOP 1.2 Reply...");

    // GIOP 1.2 field order: request_id, reply_status, service_context
    // Request ID
    this.requestId = cdr.readULong();
    logger.debug("Read request ID %d, stream pos: %d", this.requestId, cdr.getPosition());

    // Reply status
    this.replyStatus = cdr.readULong();
    logger.debug("Read reply status %d, stream pos: %d", this.replyStatus, cdr.getPosition());

    // Service context
    this.serviceContext = this.readServiceContext(cdr);
    logger.debug("Read service context, stream pos: %d", cdr.getPosition());

    // GIOP 1.2 aligns body to 8-byte boundary from start of GIOP message
    const absolutePos = headerSize + cdr.getPosition();
    const remainder = absolutePos % 8;
    if (remainder !== 0) {
      const padding = 8 - remainder;
      logger.debug("Applying %d bytes of alignment padding.", padding);
      cdr.skip(padding);
    }

    // Rest is body
    this.body = cdr.readRemaining();
    logger.debug("Deserialized reply body, size: %d. Final stream pos: %d", this.body.length, cdr.getPosition());
  }

  /**
   * Helper to extract system exception from reply body
   */
  getSystemException(): SystemExceptionReplyBody | null {
    if (this.replyStatus !== ReplyStatusType.SYSTEM_EXCEPTION) {
      return null;
    }

    const cdr = new CDRInputStream(this.body, this.isLittleEndian());

    return {
      exceptionId: cdr.readString(),
      minor: cdr.readULong(),
      completionStatus: cdr.readULong(),
    };
  }
}

/**
 * GIOP CancelRequest Message
 */
export class GIOPCancelRequest extends GIOPMessage {
  public requestId: number = 0;

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.CancelRequest, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(16, this.isLittleEndian(), codesets);

    // Write header
    this.writeHeader(cdr);

    // Update message size (4 bytes for request ID)
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + 8, 4);
    view.setUint32(0, 4, this.isLittleEndian());

    // Write request ID
    cdr.writeULong(this.requestId);

    return cdr.getBuffer();
  }

  deserialize(cdr: CDRInputStream): void {
    this.requestId = cdr.readULong();
  }
}

/**
 * GIOP CloseConnection Message
 */
export class GIOPCloseConnection extends GIOPMessage {
  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.CloseConnection, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(12, this.isLittleEndian(), codesets);

    // Write header with zero body size
    this.header.messageSize = 0;
    this.writeHeader(cdr);

    return cdr.getBuffer();
  }

  deserialize(_cdr: CDRInputStream): void {
    // No body to read
  }
}

/**
 * GIOP MessageError Message
 */
export class GIOPMessageError extends GIOPMessage {
  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.MessageError, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(12, this.isLittleEndian(), codesets);

    // Write header with zero body size
    this.header.messageSize = 0;
    this.writeHeader(cdr);

    return cdr.getBuffer();
  }

  deserialize(_cdr: CDRInputStream): void {
    // No body to read
  }
}

/**
 * GIOP Fragment Message (GIOP 1.1+)
 * Used for fragmented messages that exceed the maximum message size
 */
export class GIOPFragment extends GIOPMessage {
  public requestId: number = 0;
  public fragmentBody: Uint8Array = new Uint8Array(0);

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.Fragment, version);
  }

  /**
   * Check if more fragments follow
   */
  hasMoreFragments(): boolean {
    return (this.header.flags & GIOPFlags.FRAGMENT) !== 0;
  }

  /**
   * Set the more fragments flag
   */
  setMoreFragments(moreFragments: boolean): void {
    if (moreFragments) {
      this.header.flags |= GIOPFlags.FRAGMENT;
    }
    else {
      this.header.flags &= ~GIOPFlags.FRAGMENT;
    }
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(16 + this.fragmentBody.length, this.isLittleEndian(), codesets);

    // Write header placeholder
    this.writeHeader(cdr);

    // Remember position for size update
    const bodySizePos = cdr.getPosition() - 4;
    const bodyStart = cdr.getPosition();

    // Write request ID
    cdr.writeULong(this.requestId);

    // Write fragment body
    cdr.writeOctetArray(this.fragmentBody);

    // Calculate and update body size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + bodySizePos, 4);
    view.setUint32(0, bodySize, this.isLittleEndian());

    return buffer;
  }

  deserialize(cdr: CDRInputStream): void {
    // Read request ID
    this.requestId = cdr.readULong();

    // Rest is fragment body
    this.fragmentBody = cdr.readRemaining();
  }
}

/**
 * GIOP LocateRequest Message
 * Used to check if an object exists at a particular location
 */
export class GIOPLocateRequest extends GIOPMessage {
  public requestId: number = 0;
  public target?: TargetAddress;
  public objectKey?: Uint8Array; // For GIOP 1.0/1.1

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.LocateRequest, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(256, this.isLittleEndian(), codesets);

    // Write header placeholder
    this.writeHeader(cdr);

    // Remember position for size update
    const bodySizePos = cdr.getPosition() - 4;
    const bodyStart = cdr.getPosition();

    // Write based on GIOP version
    if (this.header.version.minor <= 1) {
      // GIOP 1.0/1.1: request_id + object_key
      cdr.writeULong(this.requestId);

      if (this.objectKey) {
        cdr.writeULong(this.objectKey.length);
        cdr.writeOctetArray(this.objectKey);
      }
      else {
        cdr.writeULong(0);
      }
    }
    else {
      // GIOP 1.2+: request_id + target
      cdr.writeULong(this.requestId);

      if (this.target) {
        this.writeTargetAddress(cdr, this.target);
      }
      else if (this.objectKey) {
        // Default to KeyAddr
        cdr.writeShort(AddressingDisposition.KeyAddr);
        cdr.writeULong(this.objectKey.length);
        cdr.writeOctetArray(this.objectKey);
      }
      else {
        throw new Error("No target address specified");
      }
    }

    // Calculate and update body size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + bodySizePos, 4);
    view.setUint32(0, bodySize, this.isLittleEndian());

    return buffer;
  }

  private writeTargetAddress(cdr: CDROutputStream, target: TargetAddress): void {
    cdr.writeShort(target.disposition);

    switch (target.disposition) {
      case AddressingDisposition.KeyAddr:
        cdr.writeULong(target.objectKey.length);
        cdr.writeOctetArray(target.objectKey);
        break;

      case AddressingDisposition.ProfileAddr:
        this.writeTaggedProfile(cdr, target.profile);
        break;

      case AddressingDisposition.ReferenceAddr:
        this.writeIOR(cdr, target.ior);
        break;
    }
  }

  private writeTaggedProfile(cdr: CDROutputStream, profile: TaggedProfile): void {
    cdr.writeULong(profile.profileId);
    cdr.writeULong(profile.profileData.length);
    cdr.writeOctetArray(profile.profileData);
  }

  private writeIOR(cdr: CDROutputStream, ior: IOR): void {
    cdr.writeString(ior.typeId);
    cdr.writeULong(ior.profiles.length);
    for (const profile of ior.profiles) {
      this.writeTaggedProfile(cdr, profile);
    }
  }

  deserialize(cdr: CDRInputStream): void {
    // Request ID
    this.requestId = cdr.readULong();

    if (this.header.version.minor <= 1) {
      // GIOP 1.0/1.1: object_key
      const keyLength = cdr.readULong();
      this.objectKey = cdr.readOctetArray(keyLength);
    }
    else {
      // GIOP 1.2+: target address
      this.target = this.readTargetAddress(cdr);
    }
  }

  private readTargetAddress(cdr: CDRInputStream): TargetAddress {
    const disposition = cdr.readShort();

    switch (disposition) {
      case AddressingDisposition.KeyAddr: {
        const length = cdr.readULong();
        const objectKey = cdr.readOctetArray(length);
        return { disposition, objectKey };
      }

      case AddressingDisposition.ProfileAddr: {
        const profile = this.readTaggedProfile(cdr);
        return { disposition, profile };
      }

      case AddressingDisposition.ReferenceAddr: {
        const ior = this.readIOR(cdr);
        return { disposition, ior };
      }

      default:
        throw new Error(`Unknown addressing disposition: ${disposition}`);
    }
  }

  private readTaggedProfile(cdr: CDRInputStream): TaggedProfile {
    const profileId = cdr.readULong();
    const length = cdr.readULong();
    const profileData = cdr.readOctetArray(length);
    return { profileId, profileData };
  }

  private readIOR(cdr: CDRInputStream): IOR {
    const typeId = cdr.readString();
    const profileCount = cdr.readULong();
    const profiles: TaggedProfile[] = [];

    for (let i = 0; i < profileCount; i++) {
      profiles.push(this.readTaggedProfile(cdr));
    }

    return { typeId, profiles };
  }
}

/**
 * GIOP LocateReply Message
 * Response to a LocateRequest indicating object location status
 */
export class GIOPLocateReply extends GIOPMessage {
  public requestId: number = 0;
  public locateStatus: LocateStatusType = LocateStatusType.UNKNOWN_OBJECT;
  public body: Uint8Array = new Uint8Array(0); // Additional data based on status

  constructor(version?: GIOPVersion) {
    super(GIOPMessageType.LocateReply, version);
  }

  serialize(codesets: NegotiatedCodeSets | null): Uint8Array {
    const cdr = new CDROutputStream(256, this.isLittleEndian(), codesets);

    // Write header placeholder
    this.writeHeader(cdr);

    // Remember position for size update
    const bodySizePos = cdr.getPosition() - 4;
    const bodyStart = cdr.getPosition();

    // Request ID
    cdr.writeULong(this.requestId);

    // Locate status
    cdr.writeULong(this.locateStatus);

    // Additional body data (e.g., IOR for OBJECT_FORWARD)
    cdr.writeOctetArray(this.body);

    // Calculate and update body size
    const bodySize = cdr.getPosition() - bodyStart;
    const buffer = cdr.getBuffer();
    const view = new DataView(buffer.buffer, buffer.byteOffset + bodySizePos, 4);
    view.setUint32(0, bodySize, this.isLittleEndian());

    return buffer;
  }

  deserialize(cdr: CDRInputStream): void {
    // Request ID
    this.requestId = cdr.readULong();

    // Locate status
    this.locateStatus = cdr.readULong();

    // Rest is additional body data
    this.body = cdr.readRemaining();
  }
}
