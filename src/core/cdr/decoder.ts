/**
 * CDR (Common Data Representation) Decoder
 * CORBA 3.4 Specification compliant implementation
 */

export class CDRInputStream {
  private buffer: Uint8Array;
  private view: DataView;
  private position: number = 0;
  private readonly littleEndian: boolean;

  constructor(buffer: Uint8Array, littleEndian: boolean = false) {
    this.buffer = buffer;
    this.view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    this.littleEndian = littleEndian;
  }

  /**
   * Get the current position in the buffer
   */
  getPosition(): number {
    return this.position;
  }

  /**
   * Set the current position in the buffer
   */
  setPosition(position: number): void {
    if (position < 0 || position > this.buffer.length) {
      throw new Error("Position out of bounds");
    }
    this.position = position;
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
      this.position += boundary - remainder;
    }
  }

  /**
   * Check if more data is available
   */
  hasMore(): boolean {
    return this.position < this.buffer.length;
  }

  /**
   * Get remaining bytes count
   */
  remaining(): number {
    return this.buffer.length - this.position;
  }

  /**
   * Get remaining bytes as Uint8Array
   */
  readRemainder(): Uint8Array {
    const remainder = this.buffer.subarray(this.position);
    this.position = this.buffer.length;
    return remainder;
  }

  /**
   * Check if enough bytes are available
   */
  private checkAvailable(bytes: number): void {
    if (this.position + bytes > this.buffer.length) {
      throw new Error(`Buffer underflow: need ${bytes} bytes, have ${this.remaining()}`);
    }
  }

  // Primitive type decoders

  /**
   * Read an octet (8-bit unsigned)
   */
  readOctet(): number {
    this.checkAvailable(1);
    return this.view.getUint8(this.position++);
  }

  /**
   * Read a boolean
   */
  readBoolean(): boolean {
    return this.readOctet() !== 0;
  }

  /**
   * Read a char (8-bit)
   */
  readChar(): string {
    return String.fromCharCode(this.readOctet());
  }

  /**
   * Read a wchar (wide character, 16-bit)
   * GIOP 1.2+ uses UTF-16
   */
  readWChar(): string {
    this.align(2);
    this.checkAvailable(2);
    const code = this.view.getUint16(this.position, this.littleEndian);
    this.position += 2;
    return String.fromCharCode(code);
  }

  /**
   * Read a short (16-bit signed)
   */
  readShort(): number {
    this.align(2);
    this.checkAvailable(2);
    const value = this.view.getInt16(this.position, this.littleEndian);
    this.position += 2;
    return value;
  }

  /**
   * Read an unsigned short (16-bit unsigned)
   */
  readUShort(): number {
    this.align(2);
    this.checkAvailable(2);
    const value = this.view.getUint16(this.position, this.littleEndian);
    this.position += 2;
    return value;
  }

  /**
   * Read a long (32-bit signed)
   */
  readLong(): number {
    this.align(4);
    this.checkAvailable(4);
    const value = this.view.getInt32(this.position, this.littleEndian);
    this.position += 4;
    return value;
  }

  /**
   * Read an unsigned long (32-bit unsigned)
   */
  readULong(): number {
    this.align(4);
    this.checkAvailable(4);
    const value = this.view.getUint32(this.position, this.littleEndian);
    this.position += 4;
    return value;
  }

  /**
   * Read a long long (64-bit signed)
   */
  readLongLong(): bigint {
    this.align(8);
    this.checkAvailable(8);
    const value = this.view.getBigInt64(this.position, this.littleEndian);
    this.position += 8;
    return value;
  }

  /**
   * Read an unsigned long long (64-bit unsigned)
   */
  readULongLong(): bigint {
    this.align(8);
    this.checkAvailable(8);
    const value = this.view.getBigUint64(this.position, this.littleEndian);
    this.position += 8;
    return value;
  }

  /**
   * Read a float (32-bit IEEE 754)
   */
  readFloat(): number {
    this.align(4);
    this.checkAvailable(4);
    const value = this.view.getFloat32(this.position, this.littleEndian);
    this.position += 4;
    return value;
  }

  /**
   * Read a double (64-bit IEEE 754)
   */
  readDouble(): number {
    this.align(8);
    this.checkAvailable(8);
    const value = this.view.getFloat64(this.position, this.littleEndian);
    this.position += 8;
    return value;
  }

  /**
   * Read a string (null-terminated)
   */
  readString(): string {
    // Save position before reading ULong (for debugging if needed)
    const length = this.readULong();
    if (length === 0) {
      return "";
    }

    // Sanity check: strings shouldn't be larger than remaining buffer
    // or unreasonably large (>10MB is suspicious for CORBA strings)
    const maxReasonableLength = 10 * 1024 * 1024; // 10MB
    if (length > this.remaining() || length > maxReasonableLength) {
      throw new Error(`Invalid string length: ${length} (remaining: ${this.remaining()})`);
    }

    // Read string bytes (excluding null terminator)
    const bytes = this.readOctetArray(length - 1);

    // Skip null terminator
    this.readOctet();

    return new TextDecoder().decode(bytes);
  }

  /**
   * Read a wide string
   * GIOP 1.2+ uses UTF-8 encoding with length prefix
   */
  readWString(): string {
    // Save position before reading ULong (for debugging if needed)
    const length = this.readULong();
    if (length === 0) {
      return "";
    }

    // Sanity check: strings shouldn't be larger than remaining buffer
    // or unreasonably large (>10MB is suspicious for CORBA strings)
    const maxReasonableLength = 10 * 1024 * 1024; // 10MB
    if (length > this.remaining() || length > maxReasonableLength) {
      throw new Error(`Invalid string length: ${length} (remaining: ${this.remaining()})`);
    }

    const bytes = this.readOctetArray(length);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Read an octet array (no length prefix)
   */
  readOctetArray(length: number): Uint8Array {
    this.checkAvailable(length);
    const array = this.buffer.subarray(this.position, this.position + length);
    this.position += length;
    return array;
  }

  /**
   * Read an octet sequence (with length prefix)
   */
  readOctetSequence(): Uint8Array {
    // Save position before reading ULong (for debugging if needed)
    const length = this.readULong();

    // Sanity check for corrupted length values
    const maxReasonableLength = 100 * 1024 * 1024; // 100MB
    if (length > this.remaining() || length > maxReasonableLength) {
      throw new Error(`Invalid sequence length: ${length} (remaining: ${this.remaining()})`);
    }

    return this.readOctetArray(length);
  }

  /**
   * Skip bytes
   */
  skip(bytes: number): void {
    this.checkAvailable(bytes);
    this.position += bytes;
  }

  /**
   * Create a sub-stream from current position
   */
  createSubStream(length: number): CDRInputStream {
    this.checkAvailable(length);
    const subBuffer = this.buffer.subarray(this.position, this.position + length);
    this.position += length;
    return new CDRInputStream(subBuffer, this.littleEndian);
  }

  /**
   * Read all remaining bytes
   */
  readRemaining(): Uint8Array {
    const result = this.buffer.subarray(this.position);
    this.position = this.buffer.length;
    return result;
  }
}
