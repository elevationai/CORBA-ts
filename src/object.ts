/**
 * CORBA Object Reference Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { Policy } from "./policy.ts";
import { TypeCode } from "./typecode.ts";

/**
 * Interface for all CORBA Objects
 */
export interface Object {
  [key: string]: unknown;
  /**
   * Get the interface definition for this object
   */
  get_interface(): Promise<InterfaceDef>;

  /**
   * Check if this object is nil
   */
  is_nil(): boolean;

  /**
   * Check if this object is equivalent to another
   */
  is_equivalent(other_object: Object): boolean;

  /**
   * Check if this object is a proxy
   */
  is_a(repository_id: string): Promise<boolean>;

  /**
   * Get a non-existent object reference
   */
  non_existent(): Promise<boolean>;

  /**
   * Hash this object reference
   */
  hash(max: number): number;

  /**
   * Create a duplicate of this object reference
   */
  duplicate(): Object;

  /**
   * Release this object reference
   */
  release(): void;

  /**
   * Get all policies associated with this object
   */
  get_policy(policy_type: number): Policy;

  /**
   * Get the domain managers associated with this object
   */
  get_domain_managers(): Promise<CORBA.ObjectRef[]>;

  /**
   * Set multiple policies on this object
   */
  set_policy_overrides(policies: Policy[], set_add: SetOverrideType): Object;

  /**
   * Get the object's type id
   */
  get_type_id(): Promise<string>;

  /**
   * Convert to string representation
   */
  toString(): string;

  /**
   * Get the interface repository ID (for narrow support)
   */
  _get_interface_id(): string;
}

/**
 * Interface repository object definition
 */
export interface InterfaceDef {
  name: string;
  id: string;
  operations: OperationDef[];
  attributes: AttributeDef[];
}

/**
 * Operation definition
 */
export interface OperationDef {
  name: string;
  id: string;
  return_type: TypeCode;
  parameters: ParameterDef[];
  exceptions: ExceptionDef[];
}

/**
 * Parameter definition
 */
export interface ParameterDef {
  name: string;
  type: TypeCode;
  mode: ParameterMode;
}

/**
 * Attribute definition
 */
export interface AttributeDef {
  name: string;
  id: string;
  type: TypeCode;
  readonly: boolean;
}

/**
 * Exception definition
 */
export interface ExceptionDef {
  name: string;
  id: string;
  members: { name: string; type: TypeCode }[];
}

/**
 * Parameter mode enum
 */
export enum ParameterMode {
  PARAM_IN,
  PARAM_OUT,
  PARAM_INOUT,
}

/**
 * Policy override type
 */
export enum SetOverrideType {
  SET_OVERRIDE,
  ADD_OVERRIDE,
}

/**
 * Base implementation of a CORBA object reference
 */
export class ObjectReference implements Object {
  [key: string]: unknown;
  protected _type_id: string;
  protected _is_nil: boolean;
  protected _policies: Map<number, Policy>;

  constructor(type_id: string = "") {
    this._type_id = type_id;
    this._is_nil = type_id === "";
    this._policies = new Map();
  }

  get_interface(): Promise<InterfaceDef> {
    // In a complete implementation, this would query the Interface Repository
    return Promise.reject(new CORBA.NO_IMPLEMENT("get_interface not implemented"));
  }

  is_nil(): boolean {
    return this._is_nil;
  }

  is_equivalent(other_object: Object): boolean {
    // In a complete implementation, this would check for equivalent object references
    return this === (other_object as unknown);
  }

  is_a(repository_id: string): Promise<boolean> {
    if (this._is_nil) {
      return Promise.resolve(false);
    }

    return Promise.resolve(this._type_id === repository_id);
  }

  non_existent(): Promise<boolean> {
    // In a complete implementation, this would check if the object exists
    return Promise.resolve(this._is_nil);
  }

  hash(max: number): number {
    if (this._is_nil) {
      return 0;
    }

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < this._type_id.length; i++) {
      hash = (hash * 31 + this._type_id.charCodeAt(i)) % max;
    }
    return hash;
  }

  duplicate(): Object {
    // Create a new object with the same state
    const obj = new ObjectReference(this._type_id);
    obj._is_nil = this._is_nil;
    this._policies.forEach((value, key) => {
      obj._policies.set(key, value);
    });
    return obj;
  }

  release(): void {
    // In a complete implementation, this would release resources
    // In JavaScript/TypeScript with garbage collection, this is mostly a no-op
  }

  get_policy(policy_type: number): Policy {
    const policy = this._policies.get(policy_type);
    if (!policy) {
      throw new CORBA.INV_OBJREF(`Policy of type ${policy_type} not found`);
    }
    return policy;
  }

  get_domain_managers(): Promise<CORBA.ObjectRef[]> {
    // In a complete implementation, this would return domain managers
    return Promise.resolve([]);
  }

  set_policy_overrides(policies: Policy[], set_add: SetOverrideType): Object {
    const new_obj = this.duplicate() as unknown as ObjectReference;

    if (set_add === SetOverrideType.SET_OVERRIDE) {
      // Clear existing policies
      new_obj._policies.clear();
    }

    // Add new policies
    for (const policy of policies) {
      new_obj._policies.set(policy.policy_type(), policy);
    }

    return new_obj;
  }

  get_type_id(): Promise<string> {
    return Promise.resolve(this._type_id);
  }

  toString(): string {
    if (this._is_nil) {
      return "nil";
    }

    // In a complete implementation, this would convert to an IOR string
    return `Object(${this._type_id})`;
  }

  _get_interface_id(): string {
    return this._type_id;
  }
}

/**
 * Create a nil object reference
 */
export function create_nil_reference(): Object {
  return new ObjectReference();
}

/**
 * Create an object reference with a type id
 */
export function create_object_reference(type_id: string): Object {
  return new ObjectReference(type_id);
}

/**
 * Check if an object reference is nil
 */
export function is_nil(obj: CORBA.ObjectRef | null | undefined): boolean {
  if (!obj) {
    return true;
  }

  const o = obj as unknown as Object;
  return o.is_nil ? o.is_nil() : true;
}

/**
 * Helper interface for types that support narrowing
 */
export interface NarrowableType<T extends Object> {
  _repository_id: string;
  _narrow(obj: Object): T | null;
}

/**
 * Narrow an object reference to a specific interface type
 * This is a synchronous version that assumes the object is already the correct type
 */
export function narrow<T extends Object>(
  obj: Object | null | undefined,
  targetType: NarrowableType<T>,
): T | null {
  if (!obj || obj.is_nil()) {
    return null;
  }

  return targetType._narrow(obj);
}

/**
 * Narrow an object reference to a specific interface type with type checking
 * This version performs an async is_a() check before narrowing
 */
export async function narrow_async<T extends Object>(
  obj: Object | null | undefined,
  targetType: NarrowableType<T>,
): Promise<T | null> {
  if (!obj || obj.is_nil()) {
    return null;
  }

  // Check if object supports the target interface
  const supportsInterface = await obj.is_a(targetType._repository_id);
  if (!supportsInterface) {
    return null;
  }

  return targetType._narrow(obj);
}
