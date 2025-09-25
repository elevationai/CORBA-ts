/**
 * ORB (Object Request Broker) Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { TypeCode } from "./typecode.ts";
import { Policy } from "./policy.ts";
import { ValueFactory } from "./valuetype.ts";
import { GIOPServer, GIOPTransport } from "./giop/transport.ts";
import { IORUtil } from "./giop/ior.ts";
import { IOR } from "./giop/types.ts";

/**
 * ORB initialization options
 */
export interface ORBInitOptions {
  orb_id?: string;
  args?: string[];
}

/**
 * Core ORB interface
 */
export interface ORB {
  /**
   * Get ORB identifier
   */
  id(): string;

  /**
   * Initialize the ORB
   */
  init(): Promise<void>;

  /**
   * Shutdown the ORB
   */
  shutdown(wait_for_completion: boolean): Promise<void>;

  /**
   * Check if ORB is running
   */
  is_running(): boolean;

  /**
   * Run the ORB event loop
   */
  run(): Promise<void>;

  /**
   * Make a remote method invocation
   */
  invoke(target: CORBA.ObjectRef, operation: string, args: unknown[]): Promise<unknown>;

  /**
   * Make a remote method invocation with pre-encoded arguments
   */
  invokeWithEncodedArgs(
    target: CORBA.ObjectRef,
    operation: string,
    encodedArgs: Uint8Array,
    returnTypeCode?: TypeCode,
  ): Promise<{ returnValue: unknown; outputBuffer: Uint8Array; isLittleEndian: boolean }>;

  /**
   * Convert a stringified object reference to an object
   */
  string_to_object(str: string): Promise<CORBA.ObjectRef>;

  /**
   * Convert an object reference to a string
   */
  object_to_string(obj: CORBA.ObjectRef): Promise<string>;

  /**
   * Get a reference to the Root POA
   */
  resolve_initial_references(id: string): Promise<CORBA.ObjectRef>;

  /**
   * List available initial references
   */
  list_initial_services(): Promise<string[]>;

  /**
   * Register an initial reference
   */
  register_initial_reference(id: string, obj: CORBA.ObjectRef): Promise<void>;

  /**
   * Create a typecode for a simple type
   */
  create_typecode(tc_kind: TypeCode.Kind): TypeCode;

  /**
   * Register a value factory
   */
  register_value_factory(id: string, factory: ValueFactory): ValueFactory | null;

  /**
   * Lookup a value factory
   */
  lookup_value_factory(id: string): ValueFactory | null;

  /**
   * Unregister a value factory
   */
  unregister_value_factory(id: string): ValueFactory | null;

  /**
   * Create a new Policy object with the specified type and value
   */
  create_policy(type: number, value: unknown): Policy;
}

/**
 * ORB implementation
 */
export class ORBImpl implements ORB {
  private _id: string;
  private _running: boolean = false;
  private _initial_references: Map<string, CORBA.ObjectRef> = new Map();
  private _value_factories: Map<string, ValueFactory> = new Map();
  private _transport: GIOPTransport;
  private _servers: Map<string, GIOPServer> = new Map();
  private _pendingRequests: Map<number, Promise<void>> = new Map();
  private _requestIdCounter: number = 0;
  private _lastHealthCheck: number = Date.now();
  private _healthCheckInterval: number = 5000; // Check every 5 seconds

  constructor(id: string = "default") {
    this._id = id;
    this._transport = new GIOPTransport();
  }

  id(): string {
    return this._id;
  }

  async init(): Promise<void> {
    // Initialize the ORB infrastructure
    this._running = true;

    // Register the RootPOA
    const { getRootPOA } = await import("./poa.ts");
    const rootPOA = getRootPOA();
    this._initial_references.set("RootPOA", rootPOA);

    return Promise.resolve();
  }

  async shutdown(wait_for_completion: boolean): Promise<void> {
    this._running = false;

    if (wait_for_completion) {
      // Wait for all pending operations to complete
      const timeout = 30000; // 30 second timeout
      const startTime = Date.now();

      while (this._pendingRequests.size > 0) {
        if (Date.now() - startTime > timeout) {
          console.warn(`ORB shutdown timeout: ${this._pendingRequests.size} requests still pending`);
          break;
        }

        // Check for completed requests and remove them
        const completedRequests: number[] = [];
        for (const [id, promise] of this._pendingRequests.entries()) {
          const result = await Promise.race([
            promise.then(() => ({ completed: true })).catch(() => ({ completed: true })),
            Promise.resolve({ completed: false }),
          ]);

          if (result.completed) {
            completedRequests.push(id);
          }
        }

        // Remove completed requests
        for (const id of completedRequests) {
          this._pendingRequests.delete(id);
        }

        // If still have pending requests, wait a bit and check again
        if (this._pendingRequests.size > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    // Close all servers
    for (const server of this._servers.values()) {
      await server.stop();
    }
    this._servers.clear();

    // Close transport if it exists
    if (this._transport) {
      await this._transport.close();
    }

    // Reset the singleton instance so next init() creates a fresh ORB
    if (_orb_instance === this) {
      _orb_instance = null;
    }
  }

  is_running(): boolean {
    return this._running;
  }

  async run(): Promise<void> {
    if (!this._running) {
      throw new CORBA.BAD_PARAM("ORB is not running");
    }

    // Run the event loop until shutdown is called
    while (this._running) {
      // Process incoming requests
      await this.processRequests();
    }
  }

  private async processRequests(): Promise<void> {
    // Process pending requests from all active servers (POAs)
    const now = Date.now();

    // Periodic health check for servers and connections
    if (now - this._lastHealthCheck > this._healthCheckInterval) {
      await this._performHealthCheck();
      this._lastHealthCheck = now;
    }

    // Clean up completed pending requests
    const completedRequests: number[] = [];
    for (const [id, promise] of this._pendingRequests.entries()) {
      // Check if promise is settled using Promise.race with immediate resolution
      const result = await Promise.race([
        promise.then(() => ({ completed: true })).catch(() => ({ completed: true })),
        Promise.resolve({ completed: false }),
      ]);

      if (result.completed) {
        completedRequests.push(id);
      }
    }

    // Remove completed requests from tracking
    for (const id of completedRequests) {
      this._pendingRequests.delete(id);
    }

    // Process any deferred work from the transport layer
    await this._transport.processPendingWork?.();

    // Small yield to prevent CPU spinning while remaining responsive
    // This is necessary because POA servers handle requests independently
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  /**
   * Perform health checks on servers and connections
   */
  private async _performHealthCheck(): Promise<void> {
    const deadServers: string[] = [];

    for (const [id, server] of this._servers.entries()) {
      if (!server.isRunning()) {
        deadServers.push(id);
      }
    }

    // Clean up dead servers
    for (const id of deadServers) {
      const server = this._servers.get(id);
      if (server) {
        try {
          await server.stop();
        }
        catch {
          // Ignore errors during cleanup
        }
      }
      this._servers.delete(id);
    }

    // Clean up idle connections in the transport layer
    await this._transport.cleanupIdleConnections?.();
  }

  /**
   * Track a pending request
   * @internal
   */
  _trackRequest(promise: Promise<void>): number {
    const id = this._requestIdCounter++;
    this._pendingRequests.set(id, promise);
    return id;
  }

  /**
   * Untrack a completed request
   * @internal
   */
  _untrackRequest(id: number): void {
    this._pendingRequests.delete(id);
  }

  /**
   * Register a server with the ORB for lifecycle management
   * @internal
   */
  _registerServer(id: string, server: GIOPServer): void {
    this._servers.set(id, server);
  }

  /**
   * Unregister a server from the ORB
   * @internal
   */
  _unregisterServer(id: string): void {
    this._servers.delete(id);
  }

  string_to_object(str: string): Promise<CORBA.ObjectRef> {
    // Parse IOR or corbaloc URL
    let ior: IOR;

    if (str.startsWith("IOR:")) {
      ior = IORUtil.fromString(str);
    }
    else if (str.startsWith("corbaloc:")) {
      ior = IORUtil.fromString(str);
    }
    else {
      throw new CORBA.BAD_PARAM(`Invalid object reference format: ${str}`);
    }

    // Create object reference with IOR
    const objRef: CORBA.ObjectRef = {
      _ior: ior,
      _is_a: (repositoryId: string): Promise<boolean> => {
        // Implementation would check if object supports the interface
        return Promise.resolve(ior.typeId === repositoryId);
      },
      _hash: (maximum: number): number => {
        // Simple hash based on IOR string
        let hash = 0;
        const iorStr = IORUtil.toString(ior);
        for (let i = 0; i < iorStr.length; i++) {
          hash = ((hash << 5) - hash + iorStr.charCodeAt(i)) & 0xffffffff;
        }
        return Math.abs(hash) % maximum;
      },
      _is_equivalent: (other: CORBA.ObjectRef): boolean => {
        return IORUtil.toString(ior) === IORUtil.toString((other as { _ior: IOR })._ior);
      },
      _non_existent: (): Promise<boolean> => {
        // Would ping the object to check if it exists
        return Promise.resolve(false);
      },
    };

    return Promise.resolve(objRef);
  }

  object_to_string(obj: CORBA.ObjectRef): Promise<string> {
    // Extract IOR from object reference
    const ior = (obj as { _ior: IOR })._ior;
    if (!ior) {
      throw new CORBA.BAD_PARAM("Object reference does not contain IOR");
    }

    return Promise.resolve(IORUtil.toString(ior));
  }

  resolve_initial_references(id: string): Promise<CORBA.ObjectRef> {
    const ref = this._initial_references.get(id);
    if (!ref) {
      return Promise.reject(new CORBA.INV_OBJREF(`Initial reference '${id}' not found`));
    }
    return Promise.resolve(ref);
  }

  list_initial_services(): Promise<string[]> {
    return Promise.resolve(Array.from(this._initial_references.keys()));
  }

  register_initial_reference(id: string, obj: CORBA.ObjectRef): Promise<void> {
    if (this._initial_references.has(id)) {
      return Promise.reject(new CORBA.BAD_PARAM(`Initial reference '${id}' already exists`));
    }
    this._initial_references.set(id, obj);
    return Promise.resolve();
  }

  create_typecode(tc_kind: TypeCode.Kind): TypeCode {
    return new TypeCode(tc_kind);
  }

  register_value_factory(id: string, factory: ValueFactory): ValueFactory | null {
    const existing = this._value_factories.get(id) || null;
    this._value_factories.set(id, factory);
    return existing;
  }

  lookup_value_factory(id: string): ValueFactory | null {
    return this._value_factories.get(id) || null;
  }

  unregister_value_factory(id: string): ValueFactory | null {
    const factory = this._value_factories.get(id) || null;
    if (factory) {
      this._value_factories.delete(id);
    }
    return factory;
  }

  create_policy(type: number, value: unknown): Policy {
    return new Policy(type, value);
  }

  async invoke(target: CORBA.ObjectRef, operation: string, args: unknown[]): Promise<unknown> {
    // Without TypeCodes, we can only handle basic types
    // For complex types, use invokeWithEncodedArgs or DII

    const ior = (target as { _ior: IOR })._ior;
    if (!ior) {
      throw new CORBA.BAD_PARAM("Object reference does not contain IOR");
    }

    // Import CDR encoder and TypeCode
    const { CDROutputStream } = await import("./core/cdr/encoder.ts");
    const { TypeCode } = await import("./typecode.ts");
    const { encodeWithTypeCode } = await import("./core/cdr/typecode-encoder.ts");

    // Create CDR output stream for request body
    const cdr = new CDROutputStream(1024, false); // Big-endian by default

    // Encode arguments using best-guess TypeCodes based on JavaScript types
    for (const arg of args) {
      let tc: TypeCode;

      if (arg === null || arg === undefined) {
        tc = new TypeCode(TypeCode.Kind.tk_null);
      }
      else if (typeof arg === "string") {
        tc = new TypeCode(TypeCode.Kind.tk_string);
      }
      else if (typeof arg === "number") {
        if (Number.isInteger(arg)) {
          // Use long for integers
          tc = new TypeCode(TypeCode.Kind.tk_long);
        }
        else {
          // Use double for floating point
          tc = new TypeCode(TypeCode.Kind.tk_double);
        }
      }
      else if (typeof arg === "boolean") {
        tc = new TypeCode(TypeCode.Kind.tk_boolean);
      }
      else if (typeof arg === "bigint") {
        tc = new TypeCode(TypeCode.Kind.tk_longlong);
      }
      else if (Array.isArray(arg)) {
        // Encode as sequence of Any
        tc = new TypeCode(TypeCode.Kind.tk_sequence);
        tc.content_type = () => new TypeCode(TypeCode.Kind.tk_any);
      }
      else if (typeof arg === "object") {
        // Without TypeCode info, encode as Any (which falls back to JSON string)
        tc = new TypeCode(TypeCode.Kind.tk_any);
      }
      else {
        // Unknown type - use Any
        tc = new TypeCode(TypeCode.Kind.tk_any);
      }

      encodeWithTypeCode(cdr, arg, tc);
    }

    const requestBody = cdr.getBuffer();

    // Use invokeWithEncodedArgs to handle the actual invocation
    const result = await this.invokeWithEncodedArgs(target, operation, requestBody, undefined);

    // Return just the return value (ignore output parameters since we don't have TypeCodes for them)
    return result.returnValue;
  }

  async invokeWithEncodedArgs(
    target: CORBA.ObjectRef,
    operation: string,
    encodedArgs: Uint8Array,
    returnTypeCode?: TypeCode,
  ): Promise<{ returnValue: unknown; outputBuffer: Uint8Array; isLittleEndian: boolean }> {
    const ior = (target as { _ior: IOR })._ior;
    if (!ior) {
      throw new CORBA.BAD_PARAM("Object reference does not contain IOR");
    }

    // Send request through transport with pre-encoded arguments
    const reply = await this._transport.sendRequest(ior, operation, encodedArgs);

    // Check reply status
    if (reply.replyStatus === 0) { // NO_EXCEPTION
      // Deserialize result using CDR
      const { CDRInputStream } = await import("./core/cdr/decoder.ts");
      // Use the endianness from the GIOP reply message
      const inCdr = new CDRInputStream(reply.body, reply.isLittleEndian());

      // Read the return value based on TypeCode or default to void
      let returnValue: unknown;
      if (returnTypeCode) {
        const { decodeWithTypeCode } = await import("./core/cdr/typecode-decoder.ts");
        try {
          returnValue = decodeWithTypeCode(inCdr, returnTypeCode);
        }
        catch {
          // If decoding fails, try to read as void
          returnValue = undefined;
        }
      }
      else {
        // No TypeCode provided - assume void return
        returnValue = undefined;
      }

      // Return both the return value and the remaining buffer for output parameters
      return {
        returnValue,
        outputBuffer: reply.body,
        isLittleEndian: reply.isLittleEndian(),
      };
    }
    else if (reply.replyStatus === 2) { // SYSTEM_EXCEPTION
      const sysEx = reply.getSystemException();
      if (sysEx) {
        throw new CORBA.SystemException(sysEx.exceptionId, sysEx.minor, sysEx.completionStatus);
      }
      throw new CORBA.INTERNAL("System exception with no details");
    }
    else {
      throw new CORBA.INTERNAL(`Unhandled reply status: ${reply.replyStatus}`);
    }
  }
}

/**
 * Global ORB instance
 */
let _orb_instance: ORB | null = null;

/**
 * Initialize a new ORB or get the existing one
 */
export async function init(options: ORBInitOptions = {}): Promise<ORB> {
  if (!_orb_instance) {
    _orb_instance = new ORBImpl(options.orb_id);
    await _orb_instance.init();
  }
  return _orb_instance;
}

/**
 * Get the singleton ORB instance
 */
export function ORB_instance(): ORB {
  if (!_orb_instance) {
    throw new CORBA.INTERNAL("ORB not initialized");
  }
  return _orb_instance;
}
