/**
 * CDR (Common Data Representation) Encoder
 * CORBA 3.4 Specification compliant implementation
 */

export class CDROutputStream {
  private buffer: Uint8Array;
  private view: DataView;
  private position: number = 0;
  private readonly littleEndian: boolean;
  private readonly growthFactor: number = 2;

  constructor(initialSize: number = 256, littleEndian: boolean = false) {
    this.buffer = new Uint8Array(initialSize);
    this.view = new DataView(this.buffer.buffer);
    this.littleEndian = littleEndian;
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
    return this.buffer.subarray(0, this.position);
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
    const bytes = new TextEncoder().encode(value);
    this.writeULong(bytes.length + 1); // Include null terminator in length
    this.writeOctetArray(bytes);
    this.writeOctet(0); // Null terminator
  }

  /**
   * Write a wide string
   * GIOP 1.2+ uses UTF-8 encoding with length prefix
   */
  writeWString(value: string): void {
    const bytes = new TextEncoder().encode(value);
    this.writeULong(bytes.length); // No null terminator for wstring in GIOP 1.2+
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
}
