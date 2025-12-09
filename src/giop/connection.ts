/**
 * IIOP Network Connection Management
 * Handles TCP connections for GIOP message transport
 */

import { getLogger, lazyHex } from "logging-ts";
import { CDRInputStream } from "../core/cdr/index.ts";
import {
  GIOPCancelRequest,
  GIOPCloseConnection,
  GIOPFragment,
  GIOPLocateReply,
  GIOPLocateRequest,
  GIOPMessage,
  GIOPMessageError,
  GIOPReply,
  GIOPRequest,
} from "./messages.ts";
import { GIOPHeader } from "./types.ts";
import { IOR } from "./types.ts";
import { IORUtil } from "./ior.ts";

const logger = getLogger("CORBA");
const bytesLogger = getLogger("CORBA-bytes");

/**
 * Logger interface for CORBA wire-level logging
 * @deprecated Use logging-ts directly instead
 */
export interface CorbaLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Connection state enumeration
 */
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  CLOSING = "closing",
  CLOSED = "closed",
}

/**
 * Connection configuration
 */
export interface ConnectionConfig {
  connectTimeout?: number; // Default: 30000ms
  readTimeout?: number; // Default: 60000ms
  keepAlive?: boolean; // Default: true
  noDelay?: boolean; // Default: true (disable Nagle's algorithm)
}

/**
 * Connection endpoint information
 */
export interface ConnectionEndpoint {
  host: string;
  port: number;
}

/**
 * IIOP Connection interface
 */
export interface IIOPConnection {
  readonly endpoint: ConnectionEndpoint;
  readonly state: ConnectionState;
  readonly isConnected: boolean;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: GIOPMessage): Promise<void>;
  receive(): Promise<GIOPMessage>;
  close(): Promise<void>;
}

/**
 * IIOP Connection implementation using Deno's TCP
 */
export class IIOPConnectionImpl implements IIOPConnection {
  private _endpoint: ConnectionEndpoint;
  private _state: ConnectionState = ConnectionState.DISCONNECTED;
  private _conn: Deno.TcpConn | null = null;
  private _config: Required<ConnectionConfig>;
  private _readBuffer: Uint8Array = new Uint8Array(0);
  private _pendingMessages: GIOPMessage[] = [];
  private _readers: Array<(message: GIOPMessage) => void> = [];
  private _fragmentBuffers: Map<number, Uint8Array[]> = new Map(); // Track fragments by request ID
  private _fragmentedMessages: Map<number, GIOPMessage> = new Map(); // Track initial fragmented messages
  private _fragmentTimestamps: Map<number, number> = new Map(); // Track when fragment collection started
  private _fragmentTimeout: number = 30000; // 30 seconds timeout for incomplete fragments
  private _lastFragmentCleanup: number = Date.now(); // Track when we last cleaned up stale fragments
  private _fragmentCleanupInterval: number = 10000; // Clean up stale fragments every 10 seconds
  _lastUsed: number = Date.now(); // Package-private for ConnectionManager access
  private _negotiatedCharCodeSet: number = 0x05010001; // Default: UTF-8
  private _negotiatedWcharCodeset: number = 0x00010109; // Default: UTF-16

  constructor(endpoint: ConnectionEndpoint, config: ConnectionConfig = {}) {
    this._endpoint = endpoint;
    this._config = {
      connectTimeout: config.connectTimeout ?? 30000,
      readTimeout: config.readTimeout ?? 60000,
      keepAlive: config.keepAlive ?? true,
      noDelay: config.noDelay ?? true,
    };
  }

  get endpoint(): ConnectionEndpoint {
    return { ...this._endpoint };
  }

  get state(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === ConnectionState.CONNECTED && this._conn !== null;
  }

  async connect(): Promise<void> {
    if (this._state === ConnectionState.CONNECTED) {
      return;
    }

    if (this._state === ConnectionState.CONNECTING) {
      throw new Error("Connection already in progress");
    }

    this._state = ConnectionState.CONNECTING;

    let timeoutTimer: number | undefined;

    try {
      // Create connection with timeout
      const connectPromise = Deno.connect({
        hostname: this._endpoint.host,
        port: this._endpoint.port,
        transport: "tcp",
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutTimer = setTimeout(() => reject(new Error("Connection timeout")), this._config.connectTimeout);
      });

      this._conn = await Promise.race([connectPromise, timeoutPromise]);

      // Clear the timeout timer after successful connection
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer);
      }

      // Configure socket options if available
      if (this._config.keepAlive && "setKeepAlive" in this._conn) {
        (this._conn as { setKeepAlive?: (enable: boolean) => void }).setKeepAlive?.(true);
      }
      if (this._config.noDelay && "setNoDelay" in this._conn) {
        (this._conn as { setNoDelay?: (enable: boolean) => void }).setNoDelay?.(true);
      }

      this._state = ConnectionState.CONNECTED;

      // Start background reading
      this._startReading();
    }
    catch (error) {
      // Clear the timeout timer on failure
      if (timeoutTimer !== undefined) {
        clearTimeout(timeoutTimer);
      }

      this._state = ConnectionState.DISCONNECTED;
      this._conn = null;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this._state === ConnectionState.DISCONNECTED) {
      return;
    }

    await this.close();
  }

  async send(message: GIOPMessage): Promise<void> {
    if (!this.isConnected || !this._conn) {
      throw new Error("Connection not established");
    }

    this._lastUsed = Date.now();
    const data = message.serialize({
      charSet: this._negotiatedCharCodeSet,
      wcharSet: this._negotiatedWcharCodeset,
    });

    // Log outgoing bytes
    bytesLogger.debug("SEND %s:%d [%d bytes]: %s", this._endpoint.host, this._endpoint.port, data.length, lazyHex(data));

    let totalSent = 0;

    while (totalSent < data.length) {
      const sent = await this._conn.write(data.subarray(totalSent));
      totalSent += sent;
    }
  }

  receive(): Promise<GIOPMessage> {
    if (!this.isConnected) {
      throw new Error("Connection not established");
    }

    this._lastUsed = Date.now();

    // If we have pending messages, return the first one
    if (this._pendingMessages.length > 0) {
      return Promise.resolve(this._pendingMessages.shift()!);
    }

    // Otherwise, wait for a new message
    return new Promise<GIOPMessage>((resolve) => {
      this._readers.push(resolve);
    });
  }

  close(): Promise<void> {
    if (this._state === ConnectionState.CLOSED || this._state === ConnectionState.CLOSING) {
      // Already closing, wait for it to complete
      return Promise.resolve();
    }

    this._state = ConnectionState.CLOSING;

    if (this._conn) {
      try {
        this._conn.close();
      }
      catch {
        // Ignore close errors
      }
      this._conn = null;
    }

    // Clear any pending readers
    this._readers.forEach((reader) => {
      reader({} as GIOPMessage); // Return empty message to indicate connection closed
    });
    this._readers = [];
    this._pendingMessages = [];

    // Clean up any incomplete fragments
    if (this._fragmentBuffers.size > 0 || this._fragmentedMessages.size > 0) {
      logger.warn(
        `Cleaning up ${this._fragmentBuffers.size} incomplete fragment buffers and ${this._fragmentedMessages.size} fragmented messages on connection close`,
      );
      this._fragmentBuffers.clear();
      this._fragmentedMessages.clear();
      this._fragmentTimestamps.clear();
    }

    this._state = ConnectionState.CLOSED;
    return Promise.resolve();
  }

  /**
   * Clean up stale fragment buffers that have exceeded the timeout
   */
  private _cleanupStaleFragments(): void {
    const now = Date.now();
    const staleRequestIds: number[] = [];

    // Find all fragments that have exceeded the timeout
    for (const [requestId, timestamp] of this._fragmentTimestamps.entries()) {
      if (now - timestamp > this._fragmentTimeout) {
        staleRequestIds.push(requestId);
      }
    }

    // Clean up stale fragments
    if (staleRequestIds.length > 0) {
      logger.warn(
        `Cleaning up ${staleRequestIds.length} stale fragment buffers that exceeded ${this._fragmentTimeout}ms timeout`,
      );

      for (const requestId of staleRequestIds) {
        this._fragmentBuffers.delete(requestId);
        this._fragmentedMessages.delete(requestId);
        this._fragmentTimestamps.delete(requestId);
      }
    }
  }

  private async _startReading(): Promise<void> {
    const buffer = new Uint8Array(8192);

    while (this.isConnected && this._conn) {
      try {
        const bytesRead = await this._conn.read(buffer);
        if (bytesRead === null) {
          // Connection closed by peer
          break;
        }
        // Add to read buffer
        this._appendToBuffer(buffer.subarray(0, bytesRead));

        // Try to parse complete messages
        this._parseMessages();
      }
      catch (error) {
        if (this._state === ConnectionState.CONNECTED) {
          logger.error("Error reading from connection");
          logger.exception(error);
          break;
        }
      }
    }

    // Connection closed
    await this.close();
  }

  private _appendToBuffer(data: Uint8Array): void {
    const newBuffer = new Uint8Array(this._readBuffer.length + data.length);
    newBuffer.set(this._readBuffer);
    newBuffer.set(data, this._readBuffer.length);
    this._readBuffer = newBuffer;
  }

  private _parseHeader(messageData: Uint8Array): GIOPHeader {
    const flags = messageData[6];
    const isLittleEndian = (flags & 0x01) !== 0;
    const view = new DataView(
      messageData.buffer,
      messageData.byteOffset + 8,
      4,
    );
    const messageSize = view.getUint32(0, isLittleEndian);

    return {
      magic: messageData.slice(0, 4),
      version: {
        major: messageData[4],
        minor: messageData[5],
      },
      flags: flags,
      messageType: messageData[7],
      messageSize: messageSize,
    };
  }

  private _parseMessages(): void {
    logger.debug("_parseMessages called with read buffer size: %d", this._readBuffer.length);
    // Periodically clean up stale fragments
    const now = Date.now();
    if (now - this._lastFragmentCleanup > this._fragmentCleanupInterval) {
      this._cleanupStaleFragments();
      this._lastFragmentCleanup = now;
    }

    while (this._readBuffer.length >= 12) { // Minimum GIOP header size
      logger.debug("Parsing loop start. Buffer size: %d", this._readBuffer.length);
      // Check for GIOP magic bytes
      if (
        this._readBuffer[0] !== 0x47 || this._readBuffer[1] !== 0x49 ||
        this._readBuffer[2] !== 0x4F || this._readBuffer[3] !== 0x50
      ) {
        throw new Error("Invalid GIOP magic bytes");
      }

      const header = this._parseHeader(this._readBuffer);
      const totalSize = 12 + header.messageSize;
      logger.debug("Parsed header. MessageType: %d, MessageSize: %d, TotalSize: %d", header.messageType, header.messageSize, totalSize);

      if (this._readBuffer.length < totalSize) {
        // Not enough data yet
        logger.debug("Incomplete message. Need %d, have %d. Waiting for more data.", totalSize, this._readBuffer.length);
        break;
      }

      // Extract complete message
      const messageData = this._readBuffer.subarray(0, totalSize);
      this._readBuffer = this._readBuffer.subarray(totalSize);
      logger.debug("Extracted message. Remaining buffer size: %d", this._readBuffer.length);

      // Log incoming bytes
      bytesLogger.debug("RECV %s:%d [%d bytes]: %s", this._endpoint.host, this._endpoint.port, messageData.length, lazyHex(messageData));

      try {
        let message: GIOPMessage;

        switch (header.messageType) {
          case 0: // Request
            message = new GIOPRequest(header.version);
            break;
          case 1: // Reply
            message = new GIOPReply(header.version);
            break;
          case 2: // CancelRequest
            message = new GIOPCancelRequest(header.version);
            break;
          case 3: // LocateRequest
            message = new GIOPLocateRequest(header.version);
            break;
          case 4: // LocateReply
            message = new GIOPLocateReply(header.version);
            break;
          case 5: // CloseConnection
            message = new GIOPCloseConnection(header.version);
            break;
          case 6: // MessageError
            message = new GIOPMessageError(header.version);
            break;
          case 7: // Fragment
            message = new GIOPFragment(header.version);
            break;
          default:
            logger.error("Unsupported message type: %d", header.messageType);
            continue;
        }

        // Set header on the message object
        message.header = header;

        // Create a CDR stream for the body, configured with negotiated codesets
        const bodyCdr = new CDRInputStream(
          messageData.subarray(12),
          (header.flags & 0x01) !== 0,
          {
            charSet: this._negotiatedCharCodeSet,
            wcharSet: this._negotiatedWcharCodeset,
          },
        );

        logger.debug("Calling deserialize for message type %d...", header.messageType);
        message.deserialize(bodyCdr, 12);
        logger.debug("Deserialize completed.");

        // After deserializing, if it's a reply, check for codeset negotiation
        if (message instanceof GIOPReply) {
          const codeSetComponent = message.serviceContext.find(
            (ctx) => ctx.contextId === 1, // ServiceContextId.CodeSets
          );
          if (codeSetComponent) {
            const codeSetsCtx = IORUtil.parseCodeSetContext(
              codeSetComponent.contextData,
            );
            const charSet = codeSetsCtx.charCodeSet;
            const wcharSet = codeSetsCtx.wcharCodeSet;
            if (
              charSet !== this._negotiatedCharCodeSet ||
              wcharSet !== this._negotiatedWcharCodeset
            ) {
              this._negotiatedCharCodeSet = charSet;
              this._negotiatedWcharCodeset = wcharSet;
              logger.debug(
                "Negotiated new codesets for connection %s:%d - char: 0x%x, wchar: 0x%x",
                this._endpoint.host,
                this._endpoint.port,
                charSet,
                wcharSet,
              );
            }
          }
        }

        // Check if this is a Request or Reply with FRAGMENT flag set
        const hasFragmentFlag = (header.flags & 0x02) !== 0; // GIOPFlags.FRAGMENT

        if ((message instanceof GIOPRequest || message instanceof GIOPReply) && hasFragmentFlag) {
          // This is a fragmented Request or Reply - store it and wait for fragments
          const requestId = (message as GIOPRequest | GIOPReply).requestId;

          logger.debug(
            "Received fragmented %s %d, waiting for fragments",
            message instanceof GIOPRequest ? "Request" : "Reply",
            requestId,
          );

          // Store the initial message, initialize fragment buffer, and record timestamp
          this._fragmentedMessages.set(requestId, message);
          this._fragmentBuffers.set(requestId, []);
          this._fragmentTimestamps.set(requestId, Date.now());
          continue;
        }

        // Handle Fragment messages (type 7)
        if (message instanceof GIOPFragment) {
          const requestId = message.requestId;

          // Get fragment buffer for this request ID
          const fragments = this._fragmentBuffers.get(requestId);
          if (!fragments) {
            logger.warn("Received fragment for request %d but no initial message found, skipping", requestId);
            continue;
          }

          // Add this fragment's body to the buffer
          fragments.push(message.fragmentBody);

          // If more fragments follow, continue receiving
          if (message.hasMoreFragments()) {
            logger.debug("Fragment received for request %d, waiting for more fragments (%d so far)", requestId, fragments.length);
            continue;
          }

          // This is the last fragment - reassemble the complete message
          logger.debug("Final fragment received for request %d, reassembling %d fragments", requestId, fragments.length);

          // Get the original message
          const originalMessage = this._fragmentedMessages.get(requestId);
          if (!originalMessage) {
            logger.error("No original message found for request %d", requestId);
            // Clean up all fragment state
            this._fragmentBuffers.delete(requestId);
            this._fragmentedMessages.delete(requestId);
            this._fragmentTimestamps.delete(requestId);
            continue;
          }

          // Concatenate all fragment bodies
          const totalLength = fragments.reduce((sum, frag) => sum + frag.length, 0);
          const fragmentData = new Uint8Array(totalLength);
          let offset = 0;
          for (const frag of fragments) {
            fragmentData.set(frag, offset);
            offset += frag.length;
          }

          // Append fragments to the original message body
          if (originalMessage instanceof GIOPRequest) {
            const completeBody = new Uint8Array(originalMessage.body.length + fragmentData.length);
            completeBody.set(originalMessage.body);
            completeBody.set(fragmentData, originalMessage.body.length);
            originalMessage.body = completeBody;
          }
          else if (originalMessage instanceof GIOPReply) {
            const completeBody = new Uint8Array(originalMessage.body.length + fragmentData.length);
            completeBody.set(originalMessage.body);
            completeBody.set(fragmentData, originalMessage.body.length);
            originalMessage.body = completeBody;
          }

          // Clean up
          this._fragmentBuffers.delete(requestId);
          this._fragmentedMessages.delete(requestId);
          this._fragmentTimestamps.delete(requestId);

          logger.debug(
            "Reassembled complete message for request %d, total body size: %d bytes",
            requestId,
            originalMessage instanceof GIOPRequest ? originalMessage.body.length : (originalMessage as GIOPReply).body.length,
          );

          // Deliver the complete message
          message = originalMessage;
        }

        // Deliver message to waiting reader or queue it
        if (this._readers.length > 0) {
          const reader = this._readers.shift()!;
          logger.debug("Delivering message type %d to a waiting reader.", header.messageType);
          reader(message);
        }
        else {
          logger.debug("No waiting readers. Queuing message type %d.", header.messageType);
          this._pendingMessages.push(message);
        }
      }
      catch (error) {
        logger.error(
          "Error parsing GIOP message. Current fragment state: %d fragmented messages, %d fragment buffers",
          this._fragmentedMessages.size,
          this._fragmentBuffers.size,
        );
        logger.exception(error);
        // Note: Cannot clean up specific request fragments here as we don't know which requestId failed
        // Stale fragments will be cleaned up by timeout mechanism or on connection close
        // Skip this message and continue
      }
    }
  }
}

/**
 * Connection manager for pooling and reusing connections
 */
export class ConnectionManager {
  private _connections: Map<string, IIOPConnectionImpl> = new Map();
  private _connectingPromises: Map<string, Promise<IIOPConnection>> = new Map();
  private _config: ConnectionConfig;
  private _cleanupTimer: number | null = null;
  private _maxIdleTime: number = 300000; // 5 minutes
  private _cleanupInterval: number = 60000; // 1 minute

  constructor(config: ConnectionConfig = {}) {
    this._config = config;
    // Don't start cleanup timer automatically to avoid leaks in tests
    // Call startCleanupTimer() explicitly when needed
  }

  /**
   * Get or create a connection to the specified endpoint
   */
  getConnection(endpoint: ConnectionEndpoint): Promise<IIOPConnection> {
    const key = `${endpoint.host}:${endpoint.port}`;

    // Check if we're already connecting to this endpoint
    const connectingPromise = this._connectingPromises.get(key);
    if (connectingPromise) {
      return connectingPromise;
    }

    let connection = this._connections.get(key);
    if (!connection || connection.state === ConnectionState.CLOSED) {
      connection = new IIOPConnectionImpl(endpoint, this._config);
      this._connections.set(key, connection);
    }

    if (!connection.isConnected) {
      // Store the connecting promise to prevent concurrent connect attempts
      const connectPromise = connection.connect().then(() => {
        this._connectingPromises.delete(key);
        return connection as IIOPConnection;
      }).catch((error) => {
        this._connectingPromises.delete(key);
        throw error;
      });

      this._connectingPromises.set(key, connectPromise);
      return connectPromise;
    }

    return Promise.resolve(connection);
  }

  /**
   * Get connection for an IOR
   */
  getConnectionForIOR(ior: IOR): Promise<IIOPConnection> {
    const endpoint = IORUtil.getIIOPEndpoint(ior);
    if (!endpoint) {
      throw new Error("No IIOP endpoint found in IOR");
    }
    // Normalize localhost variants to 127.0.0.1 for Windows compatibility
    if (endpoint.host === "localhost" || endpoint.host === "localhost.localdomain") {
      endpoint.host = "127.0.0.1";
    }
    return this.getConnection(endpoint);
  }

  /**
   * Remove a connection from the manager
   */
  removeConnection(connection: IIOPConnection): void {
    // Find and remove the connection by comparing endpoints
    for (const [key, conn] of this._connections.entries()) {
      if (conn === connection) {
        this._connections.delete(key);
        break;
      }
    }
  }

  /**
   * Send CloseConnection messages to all active connections
   */
  async sendCloseMessages(): Promise<void> {
    const { GIOPCloseConnection } = await import("./messages.ts");

    for (const connection of this._connections.values()) {
      if (connection.isConnected) {
        try {
          const closeMsg = new GIOPCloseConnection({ major: 1, minor: 2 });
          await connection.send(closeMsg);
          // Close immediately after sending CloseConnection as per GIOP spec
          await connection.close();
        }
        catch (error) {
          logger.debug("Failed to send CloseConnection");
          logger.exception(error);
        }
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    if (this._cleanupTimer !== null) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }

    // Wait for any pending connections to complete or fail
    await Promise.allSettled(Array.from(this._connectingPromises.values()));
    this._connectingPromises.clear();

    const closePromises = Array.from(this._connections.values()).map((conn) => conn.close());
    await Promise.all(closePromises);
    this._connections.clear();
  }

  /**
   * Get connection statistics
   */
  getStats(): { total: number; connected: number; closed: number } {
    const connections = Array.from(this._connections.values());
    return {
      total: connections.length,
      connected: connections.filter((c) => c.isConnected).length,
      closed: connections.filter((c) => c.state === ConnectionState.CLOSED).length,
    };
  }

  /**
   * Get last used time for a connection
   */
  getLastUsed(connection: IIOPConnectionImpl): number {
    return connection._lastUsed;
  }

  /**
   * Start periodic cleanup of idle connections
   */
  startCleanupTimer(): void {
    if (this._cleanupTimer !== null) {
      return; // Already started
    }
    this._cleanupTimer = setInterval(() => {
      this._cleanupIdleConnectionsInternal();
    }, this._cleanupInterval);
  }

  /**
   * Clean up idle connections
   * Can be called manually or via timer
   */
  cleanupIdleConnections(): Promise<void> {
    return this._cleanupIdleConnectionsInternal();
  }

  /**
   * Internal cleanup implementation
   */
  private _cleanupIdleConnectionsInternal(): Promise<void> {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [key, connection] of this._connections) {
      const lastUsed = this.getLastUsed(connection);
      if (now - lastUsed > this._maxIdleTime && connection.isConnected) {
        toRemove.push(key);
        connection.close().catch((error) => {
          logger.error("Error closing idle connection");
          logger.exception(error);
        });
      }
    }

    // Remove closed connections from the pool
    for (const key of toRemove) {
      this._connections.delete(key);
    }

    return Promise.resolve();
  }

  /**
   * Set maximum idle time before connections are closed
   */
  setMaxIdleTime(ms: number): void {
    this._maxIdleTime = ms;
  }

  /**
   * Set cleanup interval for idle connections
   */
  setCleanupInterval(ms: number): void {
    if (this._cleanupTimer !== null) {
      clearInterval(this._cleanupTimer);
    }
    this._cleanupInterval = ms;
    this.startCleanupTimer();
  }
}
