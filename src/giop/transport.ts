/**
 * GIOP Message Transport Layer
 * High-level interface for sending and receiving GIOP messages
 */

import { GIOPCloseConnection, GIOPMessage, GIOPMessageError, GIOPReply, GIOPRequest } from "./messages.ts";
import { ConnectionEndpoint, ConnectionManager, IIOPConnection } from "./connection.ts";
import { GIOPMessageType, GIOPVersion, IOR, ReplyStatusType, ServiceContext } from "./types.ts";
import { IORUtil } from "./ior.ts";

/**
 * Transport configuration
 */
export interface TransportConfig {
  requestTimeout?: number; // Default: 30000ms
  maxRetries?: number; // Default: 3
  retryDelay?: number; // Default: 1000ms
}

/**
 * Request context for tracking pending requests
 */
interface RequestContext {
  requestId: number;
  resolve: (reply: GIOPReply) => void;
  reject: (error: Error) => void;
  timer: number;
}

/**
 * GIOP Transport implementation
 */
export class GIOPTransport {
  private _connectionManager: ConnectionManager;
  private _config: Required<TransportConfig>;
  private _nextRequestId: number = 1;
  private _pendingRequests: Map<number, RequestContext> = new Map();
  private _retryTimers: Set<number> = new Set();
  private _closed: boolean = false;

  constructor(config: TransportConfig = {}) {
    this._connectionManager = new ConnectionManager();
    this._config = {
      requestTimeout: config.requestTimeout ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
    };
  }

  /**
   * Send a request and wait for reply
   */
  async sendRequest(
    target: IOR,
    operation: string,
    requestBody: Uint8Array,
    serviceContext: ServiceContext[] = [],
    version: GIOPVersion = { major: 1, minor: 2 },
  ): Promise<GIOPReply> {
    const connection = await this._connectionManager.getConnectionForIOR(target);
    const requestId = this._getNextRequestId();

    // Create GIOP request
    const request = new GIOPRequest(version);
    request.requestId = requestId;
    request.responseExpected = true;
    request.operation = operation;
    request.body = requestBody;
    request.serviceContext = serviceContext;

    // Set target address based on version
    if (version.major === 1 && version.minor >= 2) {
      request.target = {
        disposition: 0, // KeyAddr
        objectKey: this._extractObjectKey(target),
      };
    }
    else {
      // GIOP 1.0/1.1 uses object key directly
      request.objectKey = this._extractObjectKey(target);
    }

    // Send request with retry logic
    return this._sendRequestWithRetry(connection, request);
  }

  /**
   * Send a oneway request (no reply expected)
   */
  async sendOnewayRequest(
    target: IOR,
    operation: string,
    requestBody: Uint8Array,
    serviceContext: ServiceContext[] = [],
    version: GIOPVersion = { major: 1, minor: 2 },
  ): Promise<void> {
    const connection = await this._connectionManager.getConnectionForIOR(target);
    const requestId = this._getNextRequestId();

    // Create GIOP request
    const request = new GIOPRequest(version);
    request.requestId = requestId;
    request.responseExpected = false;
    request.operation = operation;
    request.body = requestBody;
    request.serviceContext = serviceContext;

    // Set target address
    if (version.major === 1 && version.minor >= 2) {
      request.target = {
        disposition: 0, // KeyAddr
        objectKey: this._extractObjectKey(target),
      };
    }
    else {
      request.objectKey = this._extractObjectKey(target);
    }

    await connection.send(request);
  }

  /**
   * Start listening for incoming requests on specified endpoint
   */
  startServer(endpoint: ConnectionEndpoint): Promise<GIOPServer> {
    return Promise.resolve(new GIOPServer(endpoint, this._connectionManager));
  }

  /**
   * Close all connections and cleanup
   */
  async close(): Promise<void> {
    this._closed = true;

    // Cancel all pending requests
    for (const [_requestId, context] of this._pendingRequests) {
      clearTimeout(context.timer);
      context.reject(new Error("Transport closed"));
    }
    this._pendingRequests.clear();

    // Clear retry timers
    for (const timer of this._retryTimers) {
      clearTimeout(timer);
    }
    this._retryTimers.clear();

    await this._connectionManager.closeAll();
  }

  private async _sendRequestWithRetry(
    connection: IIOPConnection,
    request: GIOPRequest,
  ): Promise<GIOPReply> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        return await this._sendRequestOnce(connection, request);
      }
      catch (error) {
        lastError = error as Error;

        if (attempt < this._config.maxRetries && !this._closed) {
          // Wait before retry
          await new Promise<void>((resolve) => {
            const timer = setTimeout(() => {
              this._retryTimers.delete(timer);
              resolve();
            }, this._config.retryDelay);
            this._retryTimers.add(timer);
          });
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  private _processingConnections = new WeakSet<IIOPConnection>();

  private _sendRequestOnce(
    connection: IIOPConnection,
    request: GIOPRequest,
  ): Promise<GIOPReply> {
    return new Promise<GIOPReply>((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this._pendingRequests.delete(request.requestId);
        reject(new Error("Request timeout"));
      }, this._config.requestTimeout);

      // Store request context
      this._pendingRequests.set(request.requestId, {
        requestId: request.requestId,
        resolve,
        reject,
        timer,
      });

      // Send the request
      connection.send(request).catch((error) => {
        this._pendingRequests.delete(request.requestId);
        clearTimeout(timer);
        reject(error);
      });

      // Start processing replies for this connection (only once per connection)
      if (!this._processingConnections.has(connection)) {
        this._processingConnections.add(connection);
        this._processReplies(connection);
      }
    });
  }

  private async _processReplies(connection: IIOPConnection): Promise<void> {
    try {
      while (connection.isConnected && !this._closed) {
        const message = await connection.receive();

        if (message instanceof GIOPReply) {
          const context = this._pendingRequests.get(message.requestId);
          if (context) {
            this._pendingRequests.delete(message.requestId);
            clearTimeout(context.timer);
            context.resolve(message);
          }
        }
        else if (message instanceof GIOPCloseConnection) {
          console.error("Server closed connection - rejecting all pending requests");
          // Reject all pending requests for this connection
          for (const [requestId, context] of this._pendingRequests) {
            this._pendingRequests.delete(requestId);
            clearTimeout(context.timer);
            context.reject(new Error("Connection closed by server"));
          }
          // Close the connection
          await connection.disconnect();
          break;
        }
        else if (message instanceof GIOPMessageError) {
          console.error("Received MessageError from server - protocol error");
          // Reject all pending requests due to protocol error
          for (const [requestId, context] of this._pendingRequests) {
            this._pendingRequests.delete(requestId);
            clearTimeout(context.timer);
            context.reject(new Error("GIOP protocol error"));
          }
          // Close the connection after protocol error
          await connection.disconnect();
          break;
        }
      }
    }
    catch (error) {
      if (!this._closed) {
        console.error("Error processing replies:", error);
      }
    }
  }

  private _getNextRequestId(): number {
    return this._nextRequestId++;
  }

  private _extractObjectKey(ior: IOR): Uint8Array {
    const endpoint = IORUtil.getIIOPEndpoint(ior);
    if (!endpoint) {
      throw new Error("No IIOP endpoint in IOR");
    }

    // Parse IIOP profile to get object key
    const profile = ior.profiles.find((p) => p.profileId === 0); // TAG_INTERNET_IOP
    if (!profile) {
      throw new Error("No IIOP profile found");
    }

    const parsedProfile = IORUtil.parseIIOPProfile(profile);
    if (!parsedProfile) {
      throw new Error("Failed to parse IIOP profile");
    }

    return parsedProfile.object_key;
  }
}

/**
 * GIOP Server for handling incoming requests
 */
export class GIOPServer {
  private _endpoint: ConnectionEndpoint;
  private _listener: Deno.TcpListener | null = null;
  private _running: boolean = false;
  private _handlers: Map<
    string,
    (request: GIOPRequest, connection: IIOPConnection) => Promise<GIOPReply>
  > = new Map();

  constructor(endpoint: ConnectionEndpoint, _connectionManager: ConnectionManager) {
    this._endpoint = endpoint;
  }

  /**
   * Register a request handler for an operation
   */
  registerHandler(
    operation: string,
    handler: (request: GIOPRequest, connection: IIOPConnection) => Promise<GIOPReply>,
  ): void {
    this._handlers.set(operation, handler);
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    if (this._running) {
      return Promise.reject(new Error("Server already running"));
    }

    this._listener = Deno.listen({
      hostname: this._endpoint.host,
      port: this._endpoint.port,
      transport: "tcp",
    });

    this._running = true;

    // Accept connections in background
    this._acceptConnections();
    return Promise.resolve();
  }

  /**
   * Get the actual address the server is listening on
   */
  getAddress(): Deno.NetAddr | null {
    return this._listener?.addr as Deno.NetAddr || null;
  }

  /**
   * Stop the server
   */
  stop(): Promise<void> {
    this._running = false;

    if (this._listener) {
      this._listener.close();
      this._listener = null;
    }
    return Promise.resolve();
  }

  private async _acceptConnections(): Promise<void> {
    if (!this._listener) return;

    for await (const conn of this._listener) {
      if (!this._running) break;

      // Handle connection in background
      this._handleConnection(conn);
    }
  }

  private async _handleConnection(conn: Deno.TcpConn): Promise<void> {
    // Create connection wrapper
    // Note: This is a simplified approach - in practice we'd need to integrate
    // with the connection manager more tightly

    try {
      const buffer = new Uint8Array(8192);
      let readBuffer = new Uint8Array(0);

      while (this._running) {
        const bytesRead = await conn.read(buffer);
        if (bytesRead === null) break;

        // Append to read buffer
        const newBuffer = new Uint8Array(readBuffer.length + bytesRead);
        newBuffer.set(readBuffer);
        newBuffer.set(buffer.subarray(0, bytesRead), readBuffer.length);
        readBuffer = newBuffer;

        // Process complete messages
        while (readBuffer.length >= 12) {
          // Parse GIOP header to get message size
          const view = new DataView(readBuffer.buffer, readBuffer.byteOffset + 8, 4);
          const messageSize = view.getUint32(0, false);
          const totalSize = 12 + messageSize;

          if (readBuffer.length < totalSize) break;

          // Extract and process message
          const messageData = readBuffer.subarray(0, totalSize);
          readBuffer = readBuffer.subarray(totalSize);

          await this._processMessage(messageData, conn);
        }
      }
    }
    catch (error) {
      console.error("Error handling connection:", error);
    }
    finally {
      try {
        conn.close();
      }
      catch {
        // Ignore close errors
      }
    }
  }

  private async _processMessage(messageData: Uint8Array, conn: Deno.TcpConn): Promise<void> {
    try {
      // Check GIOP magic bytes
      if (
        messageData[0] !== 0x47 || messageData[1] !== 0x49 ||
        messageData[2] !== 0x4F || messageData[3] !== 0x50
      ) {
        console.error("Invalid GIOP magic bytes");
        return;
      }

      // Check message type (byte 7)
      const messageType = messageData[7];

      // Only handle Request messages
      if (messageType !== GIOPMessageType.Request) {
        console.warn(`Unexpected message type on server: ${messageType}`);
        return;
      }

      // Parse as request
      const request = new GIOPRequest();
      request.deserialize(messageData);

      // Find handler
      const handler = this._handlers.get(request.operation);
      if (!handler) {
        console.warn(`No handler for operation: ${request.operation}`);
        // Send exception reply
        const errorReply = new GIOPReply(request.version);
        errorReply.requestId = request.requestId;
        errorReply.replyStatus = ReplyStatusType.SYSTEM_EXCEPTION;
        const replyData = errorReply.serialize();
        await conn.write(replyData);
        return;
      }

      // Create a basic connection wrapper for the handler
      const connectionWrapper = {
        endpoint: this._endpoint,
        state: "connected",
        isConnected: true,
        connect: async () => {},
        disconnect: async () => {},
        send: async (message: GIOPMessage) => {
          const data = message.serialize();
          await conn.write(data);
        },
        receive: () => Promise.resolve(request),
        close: async () => {},
      } as IIOPConnection;

      // Call handler
      const reply = await handler(request, connectionWrapper);

      // Send reply if expected
      if (request.responseExpected) {
        reply.requestId = request.requestId;
        const replyData = reply.serialize();
        await conn.write(replyData);
      }
    }
    catch (error) {
      console.error("Error processing message:", error);
    }
  }
}
