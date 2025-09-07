/**
 * CORBA ValueType Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";

/**
 * Base class for all value types
 */
export abstract class ValueBase {
  /**
   * Get the type id for this value type
   */
  abstract _type_id(): string;

  /**
   * Create a copy of this value
   */
  abstract _copy_value(): ValueBase;

  /**
   * Marshal the value to a stream
   * This would be implemented in a complete CORBA implementation
   */
  _marshal(_output_stream: unknown): void {
    throw new CORBA.NO_IMPLEMENT("_marshal not implemented");
  }

  /**
   * Unmarshal the value from a stream
   * This would be implemented in a complete CORBA implementation
   */
  _unmarshal(_input_stream: unknown): void {
    throw new CORBA.NO_IMPLEMENT("_unmarshal not implemented");
  }

  /**
   * Convert to truncatable base type
   */
  _truncatable_to(id: string): ValueBase | null {
    // Default implementation - only returns self if id matches
    return this._type_id() === id ? this : null;
  }
}

/**
 * Interface for value factories
 */
export interface ValueFactory {
  /**
   * Create a new value instance
   */
  create_for_unmarshal(): ValueBase;
}

/**
 * Abstract base class for implementing value factories
 */
export abstract class DefaultValueFactory implements ValueFactory {
  /**
   * The repository ID this factory creates
   */
  abstract _repository_id(): string;

  /**
   * Create a new instance - must be implemented by subclasses
   */
  abstract create_for_unmarshal(): ValueBase;
}

/**
 * Registry of value factories
 */
export class ValueFactoryRegistry {
  private static _instance: ValueFactoryRegistry | null = null;
  private _factories: Map<string, ValueFactory> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static get_instance(): ValueFactoryRegistry {
    if (!ValueFactoryRegistry._instance) {
      ValueFactoryRegistry._instance = new ValueFactoryRegistry();
    }
    return ValueFactoryRegistry._instance;
  }

  /**
   * Register a value factory
   */
  register_factory(id: string, factory: ValueFactory): ValueFactory | null {
    const existing = this._factories.get(id) || null;
    this._factories.set(id, factory);
    return existing;
  }

  /**
   * Find a factory by id
   */
  lookup_factory(id: string): ValueFactory | null {
    return this._factories.get(id) || null;
  }

  /**
   * Unregister a factory
   */
  unregister_factory(id: string): ValueFactory | null {
    const factory = this._factories.get(id) || null;
    if (factory) {
      this._factories.delete(id);
    }
    return factory;
  }
}

/**
 * BoxedValueBase is a special case of ValueBase for boxed values
 */
export class BoxedValueBase<T> extends ValueBase {
  private _id: string;
  private _value: T;

  constructor(id: string, value: T) {
    super();
    this._id = id;
    this._value = value;
  }

  /**
   * Get the contained value
   */
  get value(): T {
    return this._value;
  }

  /**
   * Set the contained value
   */
  set value(value: T) {
    this._value = value;
  }

  _type_id(): string {
    return this._id;
  }

  _copy_value(): ValueBase {
    // Perform deep copy of the value
    const copiedValue = this._deepCopy(this._value);
    return new BoxedValueBase<T>(this._id, copiedValue);
  }

  /**
   * Deep copy implementation for boxed values
   */
  private _deepCopy(value: T): T {
    // Handle primitives and null/undefined
    if (value === null || value === undefined || typeof value !== "object") {
      return value;
    }

    // Handle Date objects
    if (value instanceof Date) {
      return new Date(value.getTime()) as unknown as T;
    }

    // Handle Arrays
    if (Array.isArray(value)) {
      return value.map((item) => this._deepCopy(item)) as unknown as T;
    }

    // Handle regular objects
    const copy = {} as Record<string, unknown>;
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        copy[key] = this._deepCopy((value as Record<string, unknown>)[key] as T);
      }
    }

    return copy as T;
  }
}

/**
 * Factory for creating boxed values
 */
export class BoxedValueFactory<T> extends DefaultValueFactory {
  private _id: string;
  private _default_value: T;

  constructor(id: string, default_value: T) {
    super();
    this._id = id;
    this._default_value = default_value;
  }

  _repository_id(): string {
    return this._id;
  }

  create_for_unmarshal(): ValueBase {
    return new BoxedValueBase<T>(this._id, this._default_value);
  }
}

/**
 * AbstractBase is the root of the abstract interface inheritance tree
 */
export abstract class AbstractBase {
  /**
   * Check if this object supports a specific interface
   */
  abstract _is_a(id: string): boolean;

  /**
   * Get a local servant for this abstract object
   */
  abstract _get_servant(): unknown;
}

/**
 * Create a boxed value
 */
export function create_boxed_value<T>(id: string, value: T): BoxedValueBase<T> {
  return new BoxedValueBase<T>(id, value);
}
