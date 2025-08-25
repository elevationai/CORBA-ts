/**
 * Portable Object Adapter (POA) Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { Object, ObjectReference } from "./object.ts";
import { Policy } from "./policy.ts";

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
 * Servant base class
 */
export abstract class Servant {
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
  get_servant_manager(): Promise<ServantManager>;

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
 * Simple POA Manager implementation
 */
class POAManagerImpl extends ObjectReference implements POAManager {
  [key: string]: unknown;
  private _state: POAManagerState;

  constructor() {
    super("IDL:omg.org/PortableServer/POAManager:1.0");
    this._state = POAManagerState.HOLDING;
  }

  activate(): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new CORBA.BAD_PARAM("POAManager is in INACTIVE state");
    }
    this._state = POAManagerState.ACTIVE;
    return Promise.resolve();
  }

  hold_requests(_wait_for_completion: boolean): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new CORBA.BAD_PARAM("POAManager is in INACTIVE state");
    }
    this._state = POAManagerState.HOLDING;

    // In a complete implementation, we would wait for in-progress requests
    // if (_wait_for_completion) {
    // Wait for in-progress requests to complete
    // }
    return Promise.resolve();
  }

  discard_requests(_wait_for_completion: boolean): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      throw new CORBA.BAD_PARAM("POAManager is in INACTIVE state");
    }
    this._state = POAManagerState.DISCARDING;

    // In a complete implementation, we would wait for in-progress requests
    // if (_wait_for_completion) {
    // Wait for in-progress requests to complete
    // }
    return Promise.resolve();
  }

  deactivate(
    _etherealize_objects: boolean,
    _wait_for_completion: boolean,
  ): Promise<void> {
    if (this._state === POAManagerState.INACTIVE) {
      return Promise.resolve();
    }

    this._state = POAManagerState.INACTIVE;

    // In a complete implementation, we would etherealize objects
    // and wait for in-progress requests
    // if (_wait_for_completion) {
    // Wait for in-progress requests to complete
    // }
    return Promise.resolve();
  }

  get_state(): POAManagerState {
    return this._state;
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

  constructor(name: string, parent: POA | null = null, manager: POAManager | null = null) {
    super("IDL:omg.org/PortableServer/POA:1.0");
    this._name = name;
    this._parent = parent;
    this._manager = manager || new POAManagerImpl();
  }

  create_POA(
    adapter_name: string,
    a_POAManager: POAManager | null,
    _policies: Policy[],
  ): Promise<POA> {
    if (this._children.has(adapter_name)) {
      return Promise.reject(new CORBA.BAD_PARAM(`Child POA '${adapter_name}' already exists`));
    }

    const child = new POAImpl(
      adapter_name,
      this,
      a_POAManager || this._manager,
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

    throw new CORBA.BAD_PARAM(`Child POA '${adapter_name}' not found`);
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

  get_servant_manager(): Promise<ServantManager> {
    if (!this._servant_manager) {
      return Promise.reject(new CORBA.BAD_PARAM("No ServantManager set"));
    }
    return Promise.resolve(this._servant_manager);
  }

  set_servant_manager(imgr: ServantManager): Promise<void> {
    if (this._servant_manager) {
      return Promise.reject(new CORBA.BAD_PARAM("ServantManager already set"));
    }
    this._servant_manager = imgr;
    return Promise.resolve();
  }

  get_servant(): Promise<Servant> {
    if (!this._default_servant) {
      return Promise.reject(new CORBA.BAD_PARAM("No default servant set"));
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
      return Promise.reject(new CORBA.BAD_PARAM("Object already active"));
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
      return Promise.reject(new CORBA.BAD_PARAM("Object not active"));
    }
    this._servants.delete(id);
    return Promise.resolve();
  }

  create_reference_with_id(_oid: Uint8Array, intf: string): Object {
    // In a real implementation, this would create a proper object reference
    // with the given interface repository ID
    const obj = new ObjectReference(intf);
    return obj;
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

  reference_to_id(_reference: Object): Promise<Uint8Array> {
    // In a real implementation, this would extract the object ID from the reference
    // For simplicity, we're just creating a new ID
    return Promise.resolve(generateObjectId());
  }

  id_to_servant(oid: Uint8Array): Promise<Servant> {
    const id = bytesToHex(oid);
    const servant = this._servants.get(id);
    if (!servant) {
      return Promise.reject(new CORBA.BAD_PARAM("No servant found for the given ID"));
    }
    return Promise.resolve(servant);
  }

  async id_to_reference(oid: Uint8Array): Promise<Object> {
    const servant = await this.id_to_servant(oid);
    return this.create_reference_with_id(oid, servant._repository_id());
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
 */
export function getRootPOA(): POA {
  if (!_root_poa) {
    _root_poa = new POAImpl("RootPOA");
  }
  return _root_poa;
}

/**
 * Initialize the root POA
 */
export function initPOA(): void {
  if (!_root_poa) {
    _root_poa = new POAImpl("RootPOA");
  }
}
