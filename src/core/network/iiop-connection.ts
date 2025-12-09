/**
 * IIOP Connection Implementation
 * TCP/IP transport for CORBA IIOP protocol
 */

import { getLogger, lazyHex } from "logging-ts";

const logger = getLogger("CORBA");
const bytesLogger = getLogger("CORBA-bytes");

/**
 * IIOP Connection for client/server communication
 */
export class IIOPConnection {
  private tcpConn: Deno.TcpConn;
  private readonly host: string;
  private readonly port: number;
  private closed: boolean = false;

  /**
   * Create a new IIOP connection from an existing TCP connection
   */
  constructor(tcpConn: Deno.TcpConn, host: string, port: number) {
    this.tcpConn = tcpConn;
    this.host = host;
    this.port = port;
  }

  /**
   * Connect to a remote IIOP server
   */
  static async connect(host: string, port: number): Promise<IIOPConnection> {
    try {
      const tcpConn = await Deno.connect({
        hostname: host,
        port: port,
        transport: "tcp",
      });

      return new IIOPConnection(tcpConn, host, port);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to ${host}:${port}: ${message}`);
    }
  }

  /**
   * Send a GIOP message
   */
  async sendMessage(message: Uint8Array): Promise<void> {
    if (this.closed) {
      throw new Error("Connection is closed");
    }

    bytesLogger.debug("SEND %s:%d [%d bytes]: %s", this.host, this.port, message.length, lazyHex(message));

    try {
      let written = 0;
      while (written < message.length) {
        const n = await this.tcpConn.write(message.subarray(written));
        written += n;
      }
    }
    catch (error) {
      this.closed = true;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to send message: ${message}`);
    }
  }

  /**
   * Receive a GIOP message
   * Returns null if connection is closed
   */
  async receiveMessage(): Promise<Uint8Array | null> {
    if (this.closed) {
      return null;
    }

    try {
      // Read GIOP header (12 bytes)
      const header = new Uint8Array(12);
      let headerRead = 0;

      while (headerRead < 12) {
        const n = await this.tcpConn.read(header.subarray(headerRead));
        if (n === null) {
          this.closed = true;
          return null; // Connection closed
        }
        headerRead += n;
      }

      // Validate GIOP magic number
      if (
        header[0] !== 0x47 || header[1] !== 0x49 ||
        header[2] !== 0x4F || header[3] !== 0x50
      ) {
        throw new Error("Invalid GIOP magic number");
      }

      // Extract message size from header
      const view = new DataView(header.buffer);
      const flags = header[6];
      const littleEndian = (flags & 0x01) !== 0;
      const messageSize = view.getUint32(8, littleEndian);

      // Validate message size
      if (messageSize > 0x7FFFFFFF) { // Max 2GB for safety
        throw new Error(`Message size too large: ${messageSize}`);
      }

      // Read message body
      const body = new Uint8Array(messageSize);
      let bodyRead = 0;

      while (bodyRead < messageSize) {
        const n = await this.tcpConn.read(body.subarray(bodyRead));
        if (n === null) {
          this.closed = true;
          throw new Error("Connection closed while reading message body");
        }
        bodyRead += n;
      }

      // Return complete GIOP message (header + body)
      const fullMessage = new Uint8Array(12 + messageSize);
      fullMessage.set(header);
      fullMessage.set(body, 12);

      bytesLogger.debug("RECV %s:%d [%d bytes]: %s", this.host, this.port, fullMessage.length, lazyHex(fullMessage));

      return fullMessage;
    }
    catch (error) {
      this.closed = true;
      if (error instanceof Error && error.message.includes("GIOP")) {
        throw error; // Re-throw GIOP-specific errors
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to receive message: ${message}`);
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.tcpConn.close();
      }
      catch {
        // Ignore close errors
      }
    }
  }

  /**
   * Check if connection is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get connection endpoint information
   */
  getEndpoint(): { host: string; port: number } {
    return { host: this.host, port: this.port };
  }

  /**
   * Get local address
   */
  get localAddr(): Deno.Addr {
    return this.tcpConn.localAddr;
  }

  /**
   * Get remote address
   */
  get remoteAddr(): Deno.Addr {
    return this.tcpConn.remoteAddr;
  }
}

/**
 * IIOP Listener for accepting incoming connections
 */
export class IIOPListener {
  private listener: Deno.TcpListener;
  private readonly port: number;
  private closed: boolean = false;

  constructor(listener: Deno.TcpListener, port: number) {
    this.listener = listener;
    this.port = port;
  }

  /**
   * Create a new IIOP listener on the specified port
   */
  static create(port: number, hostname?: string): IIOPListener {
    try {
      const listener = Deno.listen({
        port: port,
        hostname: hostname,
        transport: "tcp",
      });

      return new IIOPListener(listener, port);
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to listen on port ${port}: ${message}`);
    }
  }

  /**
   * Accept incoming connections
   */
  async *accept(): AsyncIterableIterator<IIOPConnection> {
    while (!this.closed) {
      try {
        const tcpConn = await this.listener.accept();
        const addr = tcpConn.remoteAddr as Deno.NetAddr;
        yield new IIOPConnection(tcpConn, addr.hostname, addr.port);
      }
      catch (error) {
        if (this.closed) {
          break;
        }
        // Log error but continue accepting
        logger.error("Error accepting connection");
        logger.exception(error);
      }
    }
  }

  /**
   * Close the listener
   */
  close(): void {
    if (!this.closed) {
      this.closed = true;
      try {
        this.listener.close();
      }
      catch {
        // Ignore close errors
      }
    }
  }

  /**
   * Get listener address
   */
  get addr(): Deno.Addr {
    return this.listener.addr;
  }

  /**
   * Get port number
   */
  getPort(): number {
    return this.port;
  }
}
