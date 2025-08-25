/**
 * CORBA Context Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { ObjectReference } from "./object.ts";

/**
 * Context interface
 */
export interface ContextInterface {
  /**
   * Get the context name
   */
  context_name(): string;

  /**
   * Get the parent context
   */
  parent(): Context | null;

  /**
   * Create a child context
   */
  create_child(child_ctx_name: string): Context;

  /**
   * Set a property value in the context
   */
  set_one_value(propname: string, propvalue: unknown): void;

  /**
   * Set multiple property values
   */
  set_values(values: { [key: string]: unknown }): void;

  /**
   * Delete a property
   */
  delete_values(propnames: string[]): void;

  /**
   * Get a property value
   */
  get_value(propname: string, flags: number): unknown;

  /**
   * Get all property values that match a pattern
   */
  get_values(pattern: string, flags: number): { [key: string]: unknown };
}

/**
 * Context implementation
 */
export class Context extends ObjectReference implements ContextInterface {
  [key: string]: unknown;
  private _name: string;
  private _parent: Context | null;
  private _properties: Map<string, unknown>;

  constructor(name: string, parent: Context | null = null) {
    super("IDL:omg.org/CORBA/Context:1.0");
    this._name = name;
    this._parent = parent;
    this._properties = new Map();
  }

  context_name(): string {
    return this._name;
  }

  parent(): Context | null {
    return this._parent;
  }

  create_child(child_ctx_name: string): Context {
    return new Context(child_ctx_name, this);
  }

  set_one_value(propname: string, propvalue: unknown): void {
    this._properties.set(propname, propvalue);
  }

  set_values(values: { [key: string]: unknown }): void {
    for (const [key, value] of Object.entries(values)) {
      this._properties.set(key, value);
    }
  }

  delete_values(propnames: string[]): void {
    for (const name of propnames) {
      this._properties.delete(name);
    }
  }

  get_value(propname: string, flags: number): unknown {
    // Check if the property exists in this context
    if (this._properties.has(propname)) {
      return this._properties.get(propname);
    }

    // If not found and we should check parent contexts
    if ((flags & ContextFlags.CTX_RESTRICT_SCOPE) === 0 && this._parent !== null) {
      return this._parent.get_value(propname, flags);
    }

    throw new CORBA.BAD_PARAM(`Property '${propname}' not found in context`);
  }

  get_values(pattern: string, flags: number): { [key: string]: unknown } {
    const result: { [key: string]: unknown } = {};

    // Function to match property names against pattern
    const matches = (name: string, pattern: string): boolean => {
      // Simple wildcard implementation
      // * matches any sequence of characters
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return regex.test(name);
    };

    // Add matching properties from this context
    for (const [key, value] of this._properties.entries()) {
      if (matches(key, pattern)) {
        result[key] = value;
      }
    }

    // If we should check parent contexts
    if ((flags & ContextFlags.CTX_RESTRICT_SCOPE) === 0 && this._parent !== null) {
      const parent_values = this._parent.get_values(pattern, flags);

      // Add parent values if they don't exist in this context
      for (const [key, value] of Object.entries(parent_values)) {
        if (!result[key]) {
          result[key] = value;
        }
      }
    }

    return result;
  }
}

/**
 * Context flags
 */
export enum ContextFlags {
  CTX_RESTRICT_SCOPE = 15,
  CTX_MATCH_CASE_SENSITIVE = 16,
}

/**
 * Create a new context
 */
export function create_context(name: string): Context {
  return new Context(name);
}
