/**
 * Portable Object Adapter (POA) Implementation
 * Based on CORBA 3.4 specification
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { getLogger } from "logging-ts";
import { CORBA } from "./types.ts";
import { Object, ObjectReference } from "./object.ts";
import { EndpointPolicy, Policy, PolicyType, ThreadPolicyValue } from "./policy.ts";
import { BAD_INV_ORDER, CompletionStatus, OBJ_ADAPTER, OMGVMCID, TRANSIENT } from "./core/exceptions/system.ts";
import { IORUtil } from "./giop/ior.ts";
import type { IOR } from "./giop/types.ts";
import { GIOPServer } from "./giop/transport.ts";
import { ConnectionManager } from "./giop/connection.ts";
import { GIOPReply, GIOPRequest } from "./giop/messages.ts";
import { CDRInputStream } from "./core/cdr/decoder.ts";
import { CDROutputStream } from "./core/cdr/encoder.ts";
import type { IIOPConnection } from "./giop/connection.ts";

const logger = getLogger("CORBA");

/**
 * PortableServer::POAManager::AdapterInactive
 */
export class AdapterInactive extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POAManager/AdapterInactive:1.0", "AdapterInactive");
  }
}

/**
 * PortableServer::POA user exceptions
 */
export class AdapterAlreadyExists extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/AdapterAlreadyExists:1.0", "AdapterAlreadyExists");
  }
}

export class AdapterNonExistent extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/AdapterNonExistent:1.0", "AdapterNonExistent");
  }
}

export class NoServant extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/NoServant:1.0", "NoServant");
  }
}

export class ObjectAlreadyActive extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/ObjectAlreadyActive:1.0", "ObjectAlreadyActive");
  }
}

export class ObjectNotActive extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/ObjectNotActive:1.0", "ObjectNotActive");
  }
}

export class WrongAdapter extends CORBA.UserException {
  constructor() {
    super("IDL:omg.org/PortableServer/POA/WrongAdapter:1.0", "WrongAdapter");
  }
}

/**
 * AdapterActivator interface
 */
export interface AdapterActivator {
  /**
   * Called when a POA is being activated
   */
  unknown_adapter(parent: POA, name: string): Promise<boolean>;
}

/**
 * ServantManager interface
 */
export interface ServantManager {
  // Base interface for servant managers
  readonly _servant_manager_id?: string;
}

/**
 * ServantActivator interface
 */
export interface ServantActivator extends ServantManager {
  /**
   * Called when a servant is needed
   */
  incarnate(oid: Uint8Array, adapter: POA): Promise<Servant>;

  /**
   * Called when a servant is deactivated
   */
  etherealize(
    oid: Uint8Array,
    adapter: POA,
    serv: Servant,
    cleanup_in_progress: boolean,
    remaining_activations: boolean,
  ): Promise<void>;
}

/**
 * ServantLocator interface
 */
export interface ServantLocator extends ServantManager {
  /**
   * Called when a servant is needed for a request
   */
  preinvoke(
    oid: Uint8Array,
    adapter: POA,
    operation: string,
  ): Promise<{ servant: Servant; cookie: unknown }>;

  /**
   * Called after a request is completed
   */
  postinvoke(
    oid: Uint8Array,
    adapter: POA,
    operation: string,
    cookie: unknown,
    servant: Servant,
  ): Promise<void>;
}

/**
 * ResponseHandler interface for CORBA static skeleton _invoke method
 * Based on CORBA 3.4 specification
 */
export interface ResponseHandler {
  createReply(): CDROutputStream;
  createExceptionReply(): CDROutputStream;
}

/**
 * Type for CORBA static skeleton _invoke method
 */
type InvokeMethod = (
  operation: string,
  input: CDRInputStream,
  handler: ResponseHandler,
) => Promise<CDROutputStream> | CDROutputStream;

/**
 * Type for servant operation methods
 */
type ServantMethod = (input: CDRInputStream) => Promise<unknown> | unknown;

/**
 * Interface for servants with _invoke method
 */
interface InvokableServant {
  _invoke: InvokeMethod;
}

/**
 * Interface for servants with marshal method
 */
interface MarshalableResult {
  marshal(output: CDROutputStream): void;
}

/**
 * Servant base class
 */
export abstract class Servant {
  /** Connection ID of the GIOP request being dispatched to this servant, or 0 outside a request. */
  get _connectionId(): number {
    return invocationContext.getStore()?.connectionId ?? 0;
  }

  /**
   * Default POA for this servant
   */
  _default_POA(): POA {
    return getRootPOA();
  }

  /**
   * Check if this servant supports an interface
   */
  _is_a(repository_id: string): boolean {
    // Default implementation, should be overridden by derived classes
    return repository_id === "IDL:omg.org/CORBA/Object:1.0";
  }

  /**
   * Get the interface repository ID
   */
  _repository_id(): string {
    // Default implementation, should be overridden by derived classes
    return "IDL:omg.org/CORBA/Object:1.0";
  }

  /**
   * Get list of all repository IDs this servant supports
   */
  _all_interfaces(_poa: POA, _oid: Uint8Array): string[] {
    return [this._repository_id()];
  }

  /**
   * Handle a non-existent operation
   */
  _non_existent(): boolean {
    return false;
  }
}

/**
 * POA interface and implementation
 */
export interface POA extends CORBA.ObjectRef {
  /**
   * Create a child POA
   */
  create_POA(
    adapter_name: string,
    a_POAManager: POAManager | null,
    policies: Policy[],
  ): Promise<POA>;

  /**
   * Find a child POA
   */
  find_POA(adapter_name: string, activate_it: boolean): Promise<POA>;

  /**
   * Destroy the POA
   */
  destroy(etherialize_objects: boolean, wait_for_completion: boolean): Promise<void>;

  /**
   * Get the POA's name
   */
  the_name(): string;

  /**
   * Get the parent POA
   */
  the_parent(): POA | null;

  /**
   * Get the POAManager for this POA
   */
  the_POAManager(): POAManager;

  /**
   * Get the adapter activator
   */
  the_activator(): AdapterActivator | null;

  /**
   * Set the adapter activator
   */
  set_activator(activator: AdapterActivator | null): AdapterActivator | null;

  /**
   * Get all child POAs
   */
  the_children(): string[];

  /**
   * Get the servant manager
   */
  get_servant_manager(): Promise<ServantManager | null>;

  /**
   * Set the servant manager
   */
  set_servant_manager(imgr: ServantManager): Promise<void>;

  /**
   * Get the default servant
   */
  get_servant(): Promise<Servant>;

  /**
   * Set the default servant
   */
  set_servant(servant: Servant): Promise<void>;

  /**
   * Activate an object with a specific ID
   */
  activate_object_with_id(id: Uint8Array, servant: Servant): Promise<void>;

  /**
   * Activate an object and generate an ID
   */
  activate_object(servant: Servant): Promise<Uint8Array>;

  /**
   * Deactivate an object
   */
  deactivate_object(oid: Uint8Array): Promise<void>;

  /**
   * Create a reference with a specific ID
   */
  create_reference_with_id(oid: Uint8Array, intf: string): Object;

  /**
   * Create a reference
   */
  create_reference(intf: string): Object;

  /**
   * Get the ID for a servant
   */
  servant_to_id(servant: Servant): Promise<Uint8Array>;

  /**
   * Get the reference for a servant
   */
  servant_to_reference(servant: Servant): Promise<Object>;

  /**
   * Get the servant for a reference
   */
  reference_to_servant(reference: Object): Promise<Servant>;

  /**
   * Get the ID for a reference
   */
  reference_to_id(reference: Object): Promise<Uint8Array>;

  /**
   * Get the servant for an ID
   */
  id_to_servant(oid: Uint8Array): Promise<Servant>;

  /**
   * Get the reference for an ID
   */
  id_to_reference(oid: Uint8Array): Promise<Object>;

  /**
   * Register a callback for client TCP disconnections.
   */
  onClientDisconnected(callback: (connectionId: number) => void): void;
}

/**
 * POA Manager states
 */
export enum POAManagerState {
  HOLDING,
  ACTIVE,
  DISCARDING,
  INACTIVE,
}

/**
 * POA Manager interface
 */
export interface POAManager extends CORBA.ObjectRef {
  /**
   * Activate the POA manager
   */
  activate(): Promise<void>;

  /**
   * Hold requests
   */
  hold_requests(wait_for_completion: boolean): Promise<void>;

  /**
   * Discard requests
   */
  discard_requests(wait_for_completion: boolean): Promise<void>;

  /**
   * Deactivate the POA manager
   */
  deactivate(
    etherealize_objects: boolean,
    wait_for_completion: boolean,
  ): Promise<void>;

  /**
   * Get the current state
   */
  get_state(): POAManagerState;
}

/**
 * Runs tasks one at a time, in arrival order
 */
class Serializer {
  private _tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this._tail.then(task);
    this._tail = result.catch(() => {});
    return result;
  }
}

// MAIN_THREAD_MODEL serialises across every POA that uses it, not per POA.
const mainThreadSerializer = new Serializer();

interface InvocationContext {
  connectionId: number;
}

// Set for the duration of a servant upcall: it identifies the request to the servant, and lets a
// manager refuse to wait for completion from within the very request that called it.
const invocationContext = new AsyncLocalStorage<InvocationContext>();

/**
 * Simple POA Manager implementation
 */
class POAManagerImpl extends ObjectReference implements POAManager {
  [key: string]: unknown;
  private _state: POAManagerState;
  private _poas: Set<POAImpl> = new Set();
  private _active = 0;
  private _stateWaiters: Array<() => void> = [];
  private _drainWaiters: Array<() => void> = [];

  constructor() {
    super("IDL:omg.org/PortableServer/POAManager:1.0");
    this._state = POAManagerState.HOLDING;
  }

  _registerPOA(poa: POAImpl): void {
    this._poas.add(poa);
  }

  _unregisterPOA(poa: POAImpl): void {
    this._poas.delete(poa);
  }

  async activate(): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new AdapterInactive();
    }

    // Start the GIOP server for each POA
    for (const poa of this._poas) {
      await poa._startServer();
    }

    this._setState(POAManagerState.ACTIVE);
  }

  async hold_requests(wait_for_completion: boolean): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new AdapterInactive();
    }
    this._assertMayWait(wait_for_completion);
    this._setState(POAManagerState.HOLDING);

    if (wait_for_completion) {
      await this._drained(POAManagerState.HOLDING);
    }
  }

  async discard_requests(wait_for_completion: boolean): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new AdapterInactive();
    }
    this._assertMayWait(wait_for_completion);
    this._setState(POAManagerState.DISCARDING);

    if (wait_for_completion) {
      await this._drained(POAManagerState.DISCARDING);
    }
  }

  async deactivate(
    _etherealize_objects: boolean,
    wait_for_completion: boolean,
  ): Promise<void> {
    this._assertMayWait(wait_for_completion);

    if (this._state !== POAManagerState.INACTIVE) {
      this._setState(POAManagerState.INACTIVE);

      // Stop all GIOP servers
      for (const poa of this._poas) {
        await poa._stopServer();
      }
    }

    if (wait_for_completion) {
      await this._drained(POAManagerState.INACTIVE);
    }
  }

  get_state(): POAManagerState {
    return this._state;
  }

  /**
   * Resolves once the manager is active. While holding, the request waits here; while discarding
   * or inactive it is rejected with the system exception the specification prescribes.
   */
  async _admit(): Promise<void> {
    while (this._state === POAManagerState.HOLDING) {
      await this._stateChanged();
    }
    if (this._state === POAManagerState.DISCARDING) {
      throw new TRANSIENT("POAManager is discarding requests", OMGVMCID | 1);
    }
    if (this._state === POAManagerState.INACTIVE) {
      throw new OBJ_ADAPTER("POAManager is inactive", OMGVMCID | 1);
    }
  }

  /**
   * Run a servant upcall as an actively executing request of this manager
   */
  async _execute<T>(connectionId: number, task: () => Promise<T>): Promise<T> {
    this._active++;
    try {
      return await invocationContext.run({ connectionId }, task);
    }
    finally {
      this._active--;
      if (this._active === 0) {
        this._notify(this._drainWaiters);
      }
    }
  }

  private _setState(state: POAManagerState): void {
    this._state = state;
    this._notify(this._stateWaiters);
  }

  private _notify(waiters: Array<() => void>): void {
    for (const resolve of waiters.splice(0)) {
      resolve();
    }
  }

  private _stateChanged(): Promise<void> {
    return new Promise((resolve) => this._stateWaiters.push(resolve));
  }

  private _assertMayWait(wait_for_completion: boolean): void {
    if (wait_for_completion && invocationContext.getStore()) {
      throw new BAD_INV_ORDER("wait_for_completion requested from within a request", OMGVMCID | 3);
    }
  }

  /**
   * Wait until no request is executing, or until the manager leaves `state`
   */
  private async _drained(state: POAManagerState): Promise<void> {
    while (this._active > 0 && this._state === state) {
      await Promise.race([
        new Promise<void>((resolve) => this._drainWaiters.push(resolve)),
        this._stateChanged(),
      ]);
    }
  }
}

/**
 * Simple POA implementation
 */
class POAImpl extends ObjectReference implements POA {
  [key: string]: unknown;
  private _name: string;
  private _parent: POA | null;
  private _manager: POAManager;
  private _activator: AdapterActivator | null = null;
  private _servants: Map<string, Servant> = new Map();
  private _children: Map<string, POA> = new Map();
  private _servant_manager: ServantManager | null = null;
  private _default_servant: Servant | null = null;
  private _host: string = "127.0.0.1"; // Default host
  private _port: number = 9000; // Default port
  private _poa_policies: Policy[] = [];
  private _object_references: Map<string, CORBA.ObjectRef> = new Map();
  private _server: GIOPServer | null = null;
  private _connectionManager: ConnectionManager;
  private _disconnectListeners: Array<(connectionId: number) => void> = [];
  private _serializer: Serializer | null = null;

  constructor(name: string, parent: POA | null = null, manager: POAManager | null = null, policies?: Policy[]) {
    super("IDL:omg.org/PortableServer/POA:1.0");
    this._name = name;
    this._parent = parent;
    this._manager = manager || new POAManagerImpl();
    this._connectionManager = new ConnectionManager();
    this._poa_policies = policies || [];

    // Apply policies
    this._applyPolicies();

    // Register this POA with its manager
    if (this._manager instanceof POAManagerImpl) {
      this._manager._registerPOA(this);
    }
  }

  /**
   * Apply policies to configure the POA
   */
  private _applyPolicies(): void {
    for (const policy of this._poa_policies) {
      if (policy.policy_type() === PolicyType.ENDPOINT_POLICY_TYPE) {
        const endpointPolicy = policy as EndpointPolicy;
        this._host = endpointPolicy.host;
        this._port = endpointPolicy.port;
      }
      else if (policy.policy_type() === PolicyType.THREAD_POLICY_TYPE) {
        switch (policy.value<ThreadPolicyValue>()) {
          case ThreadPolicyValue.SINGLE_THREAD_MODEL:
            this._serializer = new Serializer();
            break;
          case ThreadPolicyValue.MAIN_THREAD_MODEL:
            this._serializer = mainThreadSerializer;
            break;
          default:
            this._serializer = null;
        }
      }
      // Handle other policy types as needed
    }
  }

  create_POA(
    adapter_name: string,
    a_POAManager: POAManager | null,
    policies: Policy[],
  ): Promise<POA> {
    if (this._children.has(adapter_name)) {
      return Promise.reject(new AdapterAlreadyExists());
    }

    const child = new POAImpl(
      adapter_name,
      this,
      a_POAManager || this._manager,
      policies,
    );

    this._children.set(adapter_name, child);
    return Promise.resolve(child);
  }

  async find_POA(adapter_name: string, activate_it: boolean): Promise<POA> {
    const child = this._children.get(adapter_name);
    if (child) {
      return child;
    }

    if (activate_it && this._activator) {
      const activated = await this._activator.unknown_adapter(this, adapter_name);
      if (activated) {
        const child = this._children.get(adapter_name);
        if (child) {
          return child;
        }
      }
    }

    throw new AdapterNonExistent();
  }

  async destroy(etherialize_objects: boolean, wait_for_completion: boolean): Promise<void> {
    // Destroy all child POAs
    for (const [_name, child] of this._children) {
      await child.destroy(etherialize_objects, wait_for_completion);
    }

    this._children.clear();

    // In a complete implementation, we would etherialize objects if needed
    if (etherialize_objects) {
      // Etherialize objects
    }

    // Remove this POA from parent's children
    if (this._parent) {
      // Need to cast to POAImpl to access _children
      const parentImpl = this._parent as POAImpl;
      parentImpl._children.delete(this._name);
    }
  }

  the_name(): string {
    return this._name;
  }

  the_parent(): POA | null {
    return this._parent;
  }

  the_POAManager(): POAManager {
    return this._manager;
  }

  the_activator(): AdapterActivator | null {
    return this._activator;
  }

  set_activator(activator: AdapterActivator | null): AdapterActivator | null {
    const old = this._activator;
    this._activator = activator;
    return old;
  }

  the_children(): string[] {
    return Array.from(this._children.keys());
  }

  get_servant_manager(): Promise<ServantManager | null> {
    return Promise.resolve(this._servant_manager);
  }

  set_servant_manager(imgr: ServantManager): Promise<void> {
    if (this._servant_manager) {
      return Promise.reject(new BAD_INV_ORDER("ServantManager already set", OMGVMCID | 6));
    }
    this._servant_manager = imgr;
    return Promise.resolve();
  }

  get_servant(): Promise<Servant> {
    if (!this._default_servant) {
      return Promise.reject(new NoServant());
    }
    return Promise.resolve(this._default_servant);
  }

  set_servant(servant: Servant): Promise<void> {
    this._default_servant = servant;
    return Promise.resolve();
  }

  activate_object_with_id(id: Uint8Array, servant: Servant): Promise<void> {
    const oid = bytesToHex(id);
    if (this._servants.has(oid)) {
      return Promise.reject(new ObjectAlreadyActive());
    }
    this._servants.set(oid, servant);
    return Promise.resolve();
  }

  activate_object(servant: Servant): Promise<Uint8Array> {
    // Generate a random object ID
    const id = generateObjectId();
    const oid = bytesToHex(id);
    this._servants.set(oid, servant);
    return Promise.resolve(id);
  }

  deactivate_object(oid: Uint8Array): Promise<void> {
    const id = bytesToHex(oid);
    if (!this._servants.has(id)) {
      return Promise.reject(new ObjectNotActive());
    }
    this._servants.delete(id);
    return Promise.resolve();
  }

  create_reference_with_id(oid: Uint8Array, intf: string): Object {
    // Create a proper CORBA object reference with IOR
    const ior = IORUtil.createSimpleIOR(
      intf,
      this._host,
      this._port,
      oid,
    );

    // Create the CORBA object reference
    const objRef: CORBA.ObjectRef = {
      _ior: ior,
      _is_a: (repositoryId: string): Promise<boolean> => {
        return Promise.resolve(ior.typeId === repositoryId);
      },
      _hash: (maximum: number): number => {
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
        // Check if the servant exists for this object ID
        const idStr = bytesToHex(oid);
        return Promise.resolve(!this._servants.has(idStr));
      },
    };

    // Store the reference for later retrieval
    const idStr = bytesToHex(oid);
    this._object_references.set(idStr, objRef);

    return objRef as unknown as Object;
  }

  create_reference(intf: string): Object {
    // Generate an object ID
    const oid = generateObjectId();
    return this.create_reference_with_id(oid, intf);
  }

  servant_to_id(servant: Servant): Promise<Uint8Array> {
    // Find the servant in the active objects
    for (const [id, s] of this._servants.entries()) {
      if (s === servant) {
        return Promise.resolve(hexToBytes(id));
      }
    }

    // If not found, activate it
    return this.activate_object(servant);
  }

  async servant_to_reference(servant: Servant): Promise<Object> {
    const oid = await this.servant_to_id(servant);
    return this.create_reference_with_id(oid, servant._repository_id());
  }

  async reference_to_servant(reference: Object): Promise<Servant> {
    const oid = await this.reference_to_id(reference);
    return this.id_to_servant(oid);
  }

  async reference_to_id(reference: Object): Promise<Uint8Array> {
    // Extract the object ID from the reference's IOR
    const objRef = reference as unknown as CORBA.ObjectRef;

    if (!objRef._ior) {
      return Promise.reject(new WrongAdapter());
    }

    const ior = objRef._ior as IOR;

    // Find the IIOP profile
    const iiopProfile = ior.profiles.find((p: { profileId: number }) => p.profileId === 0); // TAG_INTERNET_IOP

    if (!iiopProfile) {
      return Promise.reject(new WrongAdapter());
    }

    // Parse the IIOP profile to extract object key
    try {
      const { CDRInputStream } = await import("./core/cdr/decoder.ts");

      // IIOP profile data is an encapsulation - first byte is byte order
      const byteOrder = iiopProfile.profileData[0];
      const isLittleEndian = byteOrder === 1;

      // Create stream with proper endianness
      const cdr = new CDRInputStream(iiopProfile.profileData, isLittleEndian);

      // Skip the byte order marker we already read
      cdr.readOctet();

      // Skip version (2 octets)
      cdr.readOctet(); // major
      cdr.readOctet(); // minor

      // Skip host
      cdr.readString();

      // Skip port
      cdr.readUShort();

      // Read object key
      const keyLength = cdr.readULong();
      const objectKey = new Uint8Array(keyLength);
      for (let i = 0; i < keyLength; i++) {
        objectKey[i] = cdr.readOctet();
      }

      return Promise.resolve(objectKey);
    }
    catch (error) {
      return Promise.reject(new CORBA.MARSHAL("Failed to extract object ID from IOR: " + (error as Error).message));
    }
  }

  id_to_servant(oid: Uint8Array): Promise<Servant> {
    const id = bytesToHex(oid);
    const servant = this._servants.get(id);
    if (!servant) {
      return Promise.reject(new ObjectNotActive());
    }
    return Promise.resolve(servant);
  }

  async id_to_reference(oid: Uint8Array): Promise<Object> {
    const servant = await this.id_to_servant(oid);
    return this.create_reference_with_id(oid, servant._repository_id());
  }

  onClientDisconnected(callback: (connectionId: number) => void): void {
    this._disconnectListeners.push(callback);
    if (this._server) {
      this._server.onClientDisconnected(callback);
    }
  }

  /**
   * Start the GIOP server for this POA
   * Called by POAManager when activated
   */
  async _startServer(): Promise<void> {
    if (this._server) {
      return; // Server already started
    }

    // Only start server if this POA has an explicit endpoint policy
    // RootPOA and other POAs without endpoint policies don't need servers
    const hasEndpointPolicy = this._poa_policies.some(
      (p) => p.policy_type() === PolicyType.ENDPOINT_POLICY_TYPE,
    );
    if (!hasEndpointPolicy) {
      return; // No endpoint policy, don't start a server
    }

    logger.info("Starting POA '%s' on %s:%d", this._name, this._host, this._port);

    // Create and start the GIOP server
    this._server = new GIOPServer(
      { host: this._host, port: this._port },
      this._connectionManager,
    );

    // Register a generic handler that dispatches to servants
    this._server.registerHandler("*", (request: GIOPRequest, connection: IIOPConnection) => {
      return this._handleRequest(request, connection);
    });

    // Forward any pre-registered disconnect listeners to the server
    for (const cb of this._disconnectListeners) {
      this._server.onClientDisconnected(cb);
    }

    await this._server.start();

    // Register the server with the ORB for lifecycle management
    try {
      const { ORB_instance } = await import("./orb.ts");
      const orb = ORB_instance() as unknown as { _registerServer?: (id: string, server: GIOPServer) => void };
      if (orb._registerServer) {
        const serverId = `${this._name}:${this._host}:${this._port}`;
        orb._registerServer(serverId, this._server);
      }
    }
    catch {
      // ORB might not be initialized yet, that's okay
    }
  }

  /**
   * Admit a request through the POAManager's state and the thread policy, then dispatch it
   */
  private async _handleRequest(request: GIOPRequest, connection: IIOPConnection): Promise<GIOPReply> {
    const manager = this._manager instanceof POAManagerImpl ? this._manager : null;
    const dispatch = (): Promise<GIOPReply> =>
      manager ? manager._execute(connection?.connectionId ?? 0, () => this._dispatchRequest(request)) : this._dispatchRequest(request);

    try {
      if (!this._serializer) {
        await manager?._admit();
        return await dispatch();
      }
      // Wait for admission outside the queue, and give the turn back if the manager left the active
      // state while this request was queued, so a held POA never blocks the queue it shares.
      let reply: GIOPReply | null = null;
      while (reply === null) {
        await manager?._admit();
        reply = await this._serializer.run(() =>
          manager && manager.get_state() !== POAManagerState.ACTIVE ? Promise.resolve(null) : dispatch()
        );
      }
      return reply;
    }
    catch (error) {
      logger.debug("Request '%s' requestId=%d not admitted: %s", request.operation, request.requestId, (error as Error).message);
      return this._exceptionReply(request, error);
    }
  }

  /**
   * Build a SYSTEM_EXCEPTION reply carrying the exception's repository ID, minor code, and completion status
   */
  private _exceptionReply(request: GIOPRequest, error: unknown): GIOPReply {
    let name = "UNKNOWN";
    let minor = 0;
    let completed: number = CompletionStatus.COMPLETED_MAYBE;
    if (error instanceof CORBA.SystemException) {
      name = error.name;
      minor = error.minor;
      completed = error.completed;
    }

    const body = new CDROutputStream();
    body.writeString(`IDL:omg.org/CORBA/${name}:1.0`);
    body.writeULong(minor);
    body.writeULong(completed);

    const reply = new GIOPReply(request.version);
    reply.requestId = request.requestId;
    reply.replyStatus = 2; // SYSTEM_EXCEPTION
    reply.body = body.getBuffer();
    return reply;
  }

  /**
   * Dispatch a GIOP request to the appropriate servant
   */
  private async _dispatchRequest(request: GIOPRequest): Promise<GIOPReply> {
    logger.debug("Dispatching request: operation='%s' requestId=%d", request.operation, request.requestId);
    try {
      // Extract the object ID from the request
      let objectId = request.objectKey;

      // For GIOP 1.2+, the object key might be in the target address
      if (!objectId && request.target && request.target.disposition === 0) { // KeyAddr
        const keyAddrTarget = request.target as { disposition: 0; objectKey: Uint8Array };
        objectId = keyAddrTarget.objectKey;
      }

      if (!objectId) {
        throw new CORBA.OBJECT_NOT_EXIST("No object key in request");
      }

      // Look up the servant
      let servant: Servant;
      try {
        servant = await this.id_to_servant(objectId);
      }
      catch (error) {
        if (error instanceof ObjectNotActive) {
          throw new CORBA.OBJECT_NOT_EXIST("No servant for object key");
        }
        throw error;
      }

      // Get the operation name
      const operation = request.operation;

      // Extract codesets from request service context
      let codesets = null;
      const codeSetContext = request.serviceContext.find((ctx) => ctx.contextId === 1); // ServiceContextId.CodeSets
      if (codeSetContext) {
        const codeSetsCtx = IORUtil.parseCodeSetContext(codeSetContext.contextData);
        codesets = {
          charSet: codeSetsCtx.charCodeSet,
          wcharSet: codeSetsCtx.wcharCodeSet,
        };
      }

      // Create CDR streams for decoding request and encoding reply
      const inputCDR = new CDRInputStream(request.body, request.isLittleEndian(), codesets);

      // Handle standard CORBA operations specially
      if (operation === "_is_a") {
        const repositoryId = inputCDR.readString();

        const result = servant._is_a(repositoryId);

        const outputCDR = new CDROutputStream();
        outputCDR.writeBoolean(result);

        const reply = new GIOPReply(request.version);
        reply.requestId = request.requestId;
        reply.replyStatus = 0; // NO_EXCEPTION
        reply.body = outputCDR.getBuffer();
        return reply;
      }

      if (operation === "_non_existent") {
        // Object exists if we found the servant
        const outputCDR = new CDROutputStream();
        outputCDR.writeBoolean(false); // false = object exists

        const reply = new GIOPReply(request.version);
        reply.requestId = request.requestId;
        reply.replyStatus = 0; // NO_EXCEPTION
        reply.body = outputCDR.getBuffer();
        return reply;
      }

      // Check if servant has _invoke method (CORBA static skeleton standard)
      const invokableServant = servant as unknown as Partial<InvokableServant>;
      if (typeof invokableServant._invoke === "function") {
        // Create ResponseHandler for managing the response
        const responseHandler: ResponseHandler = {
          createReply(): CDROutputStream {
            return new CDROutputStream();
          },
          createExceptionReply(): CDROutputStream {
            return new CDROutputStream();
          },
        };

        // Call the standard CORBA _invoke method
        const outputCDR = await (invokableServant as InvokableServant)._invoke(operation, inputCDR, responseHandler);

        const reply = new GIOPReply(request.version);
        reply.requestId = request.requestId;
        reply.replyStatus = 0; // NO_EXCEPTION
        reply.body = outputCDR.getBuffer();
        return reply;
      }

      // Otherwise fall back to direct method invocation (for non-generated servants)
      // Check if servant has the operation
      const servantWithMethods = servant as unknown as Record<string, unknown>;
      if (typeof servantWithMethods[operation] !== "function") {
        throw new CORBA.BAD_OPERATION(`Operation ${operation} not found on servant`);
      }

      // Call the operation on the servant
      // This is a simplified dispatch - real implementation would need to handle
      // parameter marshalling based on the interface definition
      const method = (servant as unknown as Record<string, ServantMethod>)[operation];

      // For now, we assume the method takes CDRInputStream and returns Promise
      // Real implementation would unmarshal parameters based on IDL
      const result = await method.call(servant, inputCDR);

      // Create the reply
      const reply = new GIOPReply(request.version);
      reply.requestId = request.requestId;
      reply.replyStatus = 0; // NO_EXCEPTION

      // Marshal the result
      const outputCDR = new CDROutputStream();

      // This is simplified - real implementation would marshal based on IDL return type
      if (result !== undefined && result !== null) {
        // Try to marshal the result based on its type
        if (typeof result === "string") {
          outputCDR.writeString(result);
        }
        else if (typeof result === "number") {
          outputCDR.writeLong(result);
        }
        else if (typeof result === "boolean") {
          outputCDR.writeBoolean(result);
        }
        else if (result instanceof Uint8Array) {
          outputCDR.writeOctetArray(result);
        }
        else {
          // For complex types, assume they have a marshal method
          const marshalable = result as Partial<MarshalableResult>;
          if (typeof marshalable.marshal === "function") {
            marshalable.marshal(outputCDR);
          }
        }
      }

      reply.body = outputCDR.getBuffer();
      return reply;
    }
    catch (error) {
      // Missing servant is a normal condition during teardown — don't log stack traces
      if (error instanceof CORBA.OBJECT_NOT_EXIST) {
        logger.warn("Dispatch: %s", error.message);
      }
      else {
        logger.error("Error dispatching request");
        logger.exception(error);
      }

      return this._exceptionReply(request, error);
    }
  }

  /**
   * Stop the GIOP server
   */
  async _stopServer(): Promise<void> {
    if (this._server) {
      // Unregister from ORB
      try {
        const { ORB_instance } = await import("./orb.ts");
        const orb = ORB_instance() as unknown as { _unregisterServer?: (id: string) => void };
        if (orb._unregisterServer) {
          const serverId = `${this._name}:${this._host}:${this._port}`;
          orb._unregisterServer(serverId);
        }
      }
      catch {
        // ORB might not be initialized, that's okay
      }

      await this._server.stop();
      this._server = null;
    }
  }
}

/**
 * Helper to convert bytes to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Helper to convert hex string to bytes
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Generate a random object ID
 */
function generateObjectId(): Uint8Array {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Global root POA
 */
let _root_poa: POA | null = null;

/**
 * Get the root POA
 * @param policies Optional policies to configure the root POA
 */
export function getRootPOA(policies?: Policy[]): POA {
  if (!_root_poa) {
    _root_poa = new POAImpl("RootPOA", null, null, policies);
  }
  return _root_poa;
}

/**
 * Export RootPOA as an alias for POAImpl
 */
export { POAImpl as RootPOA };

/**
 * Initialize the root POA
 */
export function initPOA(): void {
  if (!_root_poa) {
    _root_poa = new POAImpl("RootPOA");
  }
}
