/**
 * CDR (Common Data Representation) Encoder
 * CORBA 3.4 Specification compliant implementation
 */

import { NegotiatedCodeSets } from "./decoder.ts";

export class CDROutputStream {
  private buffer: Uint8Array;
  private view: DataView;
  private position: number = 0;
  private readonly littleEndian: boolean;
  private readonly growthFactor: number = 2;
  private readonly codesets: NegotiatedCodeSets | null;

  constructor(
    initialSize: number = 256,
    littleEndian: boolean = false,
    codesets: NegotiatedCodeSets | null = null,
  ) {
    this.buffer = new Uint8Array(initialSize);
    this.view = new DataView(this.buffer.buffer);
    this.littleEndian = littleEndian;
    this.codesets = codesets;
  }

  /**
   * Encode a string to UTF-16 bytes
   * JavaScript strings are UTF-16 internally, so we just need to extract the bytes
   */
  private encodeUTF16(value: string, includeBOM: boolean = false): Uint8Array {
    const bomLength = includeBOM ? 2 : 0;
    const bytes = new Uint8Array(value.length * 2 + bomLength);
    let offset = 0;

    // Add BOM if requested (0xFEFF for BE, 0xFFFE for LE)
    if (includeBOM) {
      if (this.littleEndian) {
        bytes[offset++] = 0xFF;
        bytes[offset++] = 0xFE;
      }
      else {
        bytes[offset++] = 0xFE;
        bytes[offset++] = 0xFF;
      }
    }

    // Convert each UTF-16 code unit to bytes
    for (let i = 0; i < value.length; i++) {
      const codeUnit = value.charCodeAt(i);
      if (this.littleEndian) {
        bytes[offset++] = codeUnit & 0xFF;
        bytes[offset++] = (codeUnit >> 8) & 0xFF;
      }
      else {
        bytes[offset++] = (codeUnit >> 8) & 0xFF;
        bytes[offset++] = codeUnit & 0xFF;
      }
    }

    return bytes;
  }

  /**
   * Encode a string to ISO-8859-1 (Latin-1) bytes
   * Each character maps to a single byte (0-255)
   */
  private encodeISO88591(value: string): Uint8Array {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 255) {
        // Character not representable in ISO-8859-1
        // Replace with '?' (0x3F) as per common practice
        bytes[i] = 0x3F;
      }
      else {
        bytes[i] = code;
      }
    }
    return bytes;
  }

  /**
   * Encode a string using the specified codeset
   */
  private encodeString(value: string, codeset: number, includeBOM: boolean = false): Uint8Array {
    switch (codeset) {
      case 0x05010001: // UTF-8
        return new TextEncoder().encode(value);
      case 0x00010109: // UTF-16
        return this.encodeUTF16(value, includeBOM);
      case 0x00010001: // ISO-8859-1
        return this.encodeISO88591(value);
      default:
        // Fallback to UTF-8
        return new TextEncoder().encode(value);
    }
  }

  /**
   * Get the current position in the buffer
   */
  getPosition(): number {
    return this.position;
  }

  /**
   * Get the byte order
   */
  isLittleEndian(): boolean {
    return this.littleEndian;
  }

  /**
   * Align to specified boundary (2, 4, or 8 bytes)
   */
  align(boundary: number): void {
    const remainder = this.position % boundary;
    if (remainder !== 0) {
      const padding = boundary - remainder;
      this.skip(padding);
    }
  }

  /**
   * Skip bytes (used for alignment padding)
   */
  private skip(bytes: number): void {
    this.ensureCapacity(bytes);
    // Fill with zeros for alignment
    for (let i = 0; i < bytes; i++) {
      this.buffer[this.position++] = 0;
    }
  }

  /**
   * Ensure buffer has capacity for additional bytes
   */
  private ensureCapacity(additional: number): void {
    const required = this.position + additional;
    if (required > this.buffer.length) {
      let newSize = this.buffer.length * this.growthFactor;
      while (newSize < required) {
        newSize *= this.growthFactor;
      }
      const newBuffer = new Uint8Array(Math.floor(newSize));
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer.buffer);
    }
  }

  /**
   * Get the encoded buffer (trimmed to actual size)
   */
  getBuffer(): Uint8Array {
    const result = this.buffer.subarray(0, this.position);
    return result;
  }

  /**
   * Reset the stream
   */
  reset(): void {
    this.position = 0;
  }

  // Primitive type encoders

  /**
   * Write an octet (8-bit unsigned)
   */
  writeOctet(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.position++, value);
  }

  /**
   * Write a boolean
   */
  writeBoolean(value: boolean): void {
    this.writeOctet(value ? 1 : 0);
  }

  /**
   * Write a char (8-bit)
   */
  writeChar(value: string): void {
    if (value.length !== 1) {
      throw new Error("Char must be a single character");
    }
    this.writeOctet(value.charCodeAt(0));
  }

  /**
   * Write a wchar (wide character, 16-bit)
   * GIOP 1.2+ uses UTF-16
   */
  writeWChar(value: string): void {
    if (value.length !== 1) {
      throw new Error("WChar must be a single character");
    }
    this.align(2);
    this.ensureCapacity(2);
    this.view.setUint16(this.position, value.charCodeAt(0), this.littleEndian);
    this.position += 2;
  }

  /**
   * Write a short (16-bit signed)
   */
  writeShort(value: number): void {
    this.align(2);
    this.ensureCapacity(2);
    this.view.setInt16(this.position, value, this.littleEndian);
    this.position += 2;
  }

  /**
   * Write an unsigned short (16-bit unsigned)
   */
  writeUShort(value: number): void {
    this.align(2);
    this.ensureCapacity(2);
    this.view.setUint16(this.position, value, this.littleEndian);
    this.position += 2;
  }

  /**
   * Write a long (32-bit signed)
   */
  writeLong(value: number): void {
    this.align(4);
    this.ensureCapacity(4);
    this.view.setInt32(this.position, value, this.littleEndian);
    this.position += 4;
  }

  /**
   * Write an unsigned long (32-bit unsigned)
   */
  writeULong(value: number): void {
    this.align(4);
    this.ensureCapacity(4);
    this.view.setUint32(this.position, value, this.littleEndian);
    this.position += 4;
  }

  /**
   * Write a long long (64-bit signed)
   */
  writeLongLong(value: bigint): void {
    this.align(8);
    this.ensureCapacity(8);
    this.view.setBigInt64(this.position, value, this.littleEndian);
    this.position += 8;
  }

  /**
   * Write an unsigned long long (64-bit unsigned)
   */
  writeULongLong(value: bigint): void {
    this.align(8);
    this.ensureCapacity(8);
    this.view.setBigUint64(this.position, value, this.littleEndian);
    this.position += 8;
  }

  /**
   * Write a float (32-bit IEEE 754)
   */
  writeFloat(value: number): void {
    this.align(4);
    this.ensureCapacity(4);
    this.view.setFloat32(this.position, value, this.littleEndian);
    this.position += 4;
  }

  /**
   * Write a double (64-bit IEEE 754)
   */
  writeDouble(value: number): void {
    this.align(8);
    this.ensureCapacity(8);
    this.view.setFloat64(this.position, value, this.littleEndian);
    this.position += 8;
  }

  /**
   * Write a string (null-terminated)
   */
  writeString(value: string): void {
    // Default to ISO-8859-1 if no negotiation happened, as per CORBA spec.
    const codeset = this.codesets?.charSet ?? 0x00010001;
    const bytes = this.encodeString(value, codeset);

    this.writeULong(bytes.length + 1); // Include null terminator in length
    this.writeOctetArray(bytes);
    this.writeOctet(0); // Null terminator
  }

  /**
   * Write a wide string
   * GIOP 1.2+ uses length-prefixed encoding with optional BOM
   */
  writeWString(value: string): void {
    // Default to UTF-16 if no negotiation happened.
    const codeset = this.codesets?.wcharSet ?? 0x00010109;
    // Include BOM for wstring as per CORBA convention
    const bytes = this.encodeString(value, codeset, true);

    // wstring length is byte length
    this.writeULong(bytes.length);
    this.writeOctetArray(bytes);
  }

  /**
   * Write an octet array (no length prefix)
   */
  writeOctetArray(value: Uint8Array): void {
    this.ensureCapacity(value.length);
    this.buffer.set(value, this.position);
    this.position += value.length;
  }

  /**
   * Write an octet sequence (with length prefix)
   */
  writeOctetSequence(value: Uint8Array): void {
    this.writeULong(value.length);
    this.writeOctetArray(value);
  }

  /**
   * Write at a specific position (for patching values)
   */
  writeULongAt(position: number, value: number): void {
    const savedPosition = this.position;
    this.position = position;
    this.writeULong(value);
    this.position = savedPosition;
  }

  /**
   * Write an encapsulation (length-prefixed CDR stream)
   */
  writeEncapsulation(encap: CDROutputStream): void {
    const data = encap.getBuffer();
    this.writeULong(data.length);
    this.writeOctetArray(data);
  }
}
