/**
 * IIOP Network Connection Management
 * Handles TCP connections for GIOP message transport
 */

import { GIOPCloseConnection, GIOPFragment, GIOPMessage, GIOPMessageError, GIOPReply, GIOPRequest } from "./messages.ts";
import { IOR } from "./types.ts";
import { IORUtil } from "./ior.ts";

/**
 * Logger interface for CORBA wire-level logging
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
  logger?: CorbaLogger; // Optional logger for wire-level logging
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
  private _config: Required<Omit<ConnectionConfig, "logger">>;
  private _logger?: CorbaLogger;
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

  constructor(endpoint: ConnectionEndpoint, config: ConnectionConfig = {}) {
    this._endpoint = endpoint;
    this._logger = config.logger;
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
    const data = message.serialize();

    // Log outgoing bytes
    if (this._logger) {
      const hexData = Array.from(data)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
      this._logger.debug(`SEND ${this._endpoint.host}:${this._endpoint.port} [${data.length} bytes]: ${hexData}`);
    }

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
      if (this._logger) {
        this._logger.warn(
          `Cleaning up ${this._fragmentBuffers.size} incomplete fragment buffers and ${this._fragmentedMessages.size} fragmented messages on connection close`,
        );
      }
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
      if (this._logger) {
        this._logger.warn(
          `Cleaning up ${staleRequestIds.length} stale fragment buffers that exceeded ${this._fragmentTimeout}ms timeout`,
        );
      }

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
          console.error("Error reading from connection:", error);
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

  private _parseMessages(): void {
    // Periodically clean up stale fragments
    const now = Date.now();
    if (now - this._lastFragmentCleanup > this._fragmentCleanupInterval) {
      this._cleanupStaleFragments();
      this._lastFragmentCleanup = now;
    }

    while (this._readBuffer.length >= 12) { // Minimum GIOP header size
      // Check for GIOP magic bytes
      if (
        this._readBuffer[0] !== 0x47 || this._readBuffer[1] !== 0x49 ||
        this._readBuffer[2] !== 0x4F || this._readBuffer[3] !== 0x50
      ) {
        throw new Error("Invalid GIOP magic bytes");
      }

      // Check byte order flag (bit 0 of flags byte)
      const flags = this._readBuffer[6];
      const isLittleEndian = (flags & 0x01) !== 0;

      // Read message size from header (bytes 8-11)
      const view = new DataView(this._readBuffer.buffer, this._readBuffer.byteOffset + 8, 4);
      const messageSize = view.getUint32(0, isLittleEndian);
      const totalSize = 12 + messageSize; // Header + body

      if (this._readBuffer.length < totalSize) {
        // Not enough data yet
        break;
      }

      // Extract complete message
      const messageData = this._readBuffer.subarray(0, totalSize);
      this._readBuffer = this._readBuffer.subarray(totalSize);

      // Log incoming bytes
      if (this._logger) {
        const hexData = Array.from(messageData)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ");
        this._logger.debug(`RECV ${this._endpoint.host}:${this._endpoint.port} [${messageData.length} bytes]: ${hexData}`);
      }

      try {
        // Check message type to create appropriate message object
        const messageType = messageData[7];
        let message: GIOPMessage;

        switch (messageType) {
          case 0: // Request
            message = new GIOPRequest({ major: messageData[4], minor: messageData[5] });
            break;
          case 1: // Reply
            message = new GIOPReply({ major: messageData[4], minor: messageData[5] });
            break;
          case 5: // CloseConnection
            message = new GIOPCloseConnection({ major: messageData[4], minor: messageData[5] });
            break;
          case 6: // MessageError
            message = new GIOPMessageError({ major: messageData[4], minor: messageData[5] });
            break;
          case 7: // Fragment
            message = new GIOPFragment({ major: messageData[4], minor: messageData[5] });
            break;
          default:
            console.error(`Unsupported message type: ${messageType}`);
            continue;
        }

        message.deserialize(messageData);

        // Check if this is a Request or Reply with FRAGMENT flag set
        const hasFragmentFlag = (messageData[6] & 0x02) !== 0; // GIOPFlags.FRAGMENT

        if ((message instanceof GIOPRequest || message instanceof GIOPReply) && hasFragmentFlag) {
          // This is a fragmented Request or Reply - store it and wait for fragments
          const requestId = message instanceof GIOPRequest ? message.requestId : message.requestId;

          if (this._logger) {
            this._logger.debug(
              `Received fragmented ${message instanceof GIOPRequest ? "Request" : "Reply"} ${requestId}, waiting for fragments`,
            );
          }

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
            if (this._logger) {
              this._logger.warn(
                `Received fragment for request ${requestId} but no initial message found, skipping`,
              );
            }
            continue;
          }

          // Add this fragment's body to the buffer
          fragments.push(message.fragmentBody);

          // If more fragments follow, continue receiving
          if (message.hasMoreFragments()) {
            if (this._logger) {
              this._logger.debug(
                `Fragment received for request ${requestId}, waiting for more fragments (${fragments.length} so far)`,
              );
            }
            continue;
          }

          // This is the last fragment - reassemble the complete message
          if (this._logger) {
            this._logger.debug(
              `Final fragment received for request ${requestId}, reassembling ${fragments.length} fragments`,
            );
          }

          // Get the original message
          const originalMessage = this._fragmentedMessages.get(requestId);
          if (!originalMessage) {
            if (this._logger) {
              this._logger.error(`No original message found for request ${requestId}`);
            }
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

          if (this._logger) {
            this._logger.debug(
              `Reassembled complete message for request ${requestId}, total body size: ${
                originalMessage instanceof GIOPRequest ? originalMessage.body.length : (originalMessage as GIOPReply).body.length
              } bytes`,
            );
          }

          // Deliver the complete message
          message = originalMessage;
        }

        // Deliver message to waiting reader or queue it
        if (this._readers.length > 0) {
          const reader = this._readers.shift()!;
          reader(message);
        }
        else {
          this._pendingMessages.push(message);
        }
      }
      catch (error) {
        console.error("Error parsing GIOP message:", error);
        if (this._logger) {
          this._logger.warn(
            `Message parsing error occurred. Current fragment state: ${this._fragmentedMessages.size} fragmented messages, ${this._fragmentBuffers.size} fragment buffers`,
          );
        }
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
          console.debug("Failed to send CloseConnection:", error);
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
          console.error("Error closing idle connection:", error);
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
