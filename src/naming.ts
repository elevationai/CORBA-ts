/**
 * CORBA Naming Service Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { ObjectReference } from "./object.ts";
import { ORB_instance } from "./orb.ts";

/**
 * CosNaming Exceptions
 */
// deno-lint-ignore no-namespace
export namespace CosNaming {
  export class NotFound extends CORBA.UserException {
    why: NotFoundReason;
    rest_of_name: Name;

    constructor(why: NotFoundReason, rest_of_name: Name) {
      super("IDL:omg.org/CosNaming/NamingContext/NotFound:1.0");
      this.why = why;
      this.rest_of_name = rest_of_name;
    }
  }

  export enum NotFoundReason {
    missing_node,
    not_context,
    not_object,
  }

  export class CannotProceed extends CORBA.UserException {
    cxt: NamingContext;
    rest_of_name: Name;

    constructor(cxt: NamingContext, rest_of_name: Name) {
      super("IDL:omg.org/CosNaming/NamingContext/CannotProceed:1.0");
      this.cxt = cxt;
      this.rest_of_name = rest_of_name;
    }
  }

  export class InvalidName extends CORBA.UserException {
    constructor() {
      super("IDL:omg.org/CosNaming/NamingContext/InvalidName:1.0");
    }
  }

  export class AlreadyBound extends CORBA.UserException {
    constructor() {
      super("IDL:omg.org/CosNaming/NamingContext/AlreadyBound:1.0");
    }
  }

  export class NotEmpty extends CORBA.UserException {
    constructor() {
      super("IDL:omg.org/CosNaming/NamingContext/NotEmpty:1.0");
    }
  }
}

/**
 * NameComponent - a single component of a compound name
 */
export interface NameComponent {
  id: string;
  kind: string;
}

/**
 * Type alias for a sequence of NameComponents
 */
export type Name = NameComponent[];

/**
 * Binding type enumeration
 */
export enum BindingType {
  nobject,
  ncontext,
}

/**
 * Binding structure
 */
export interface Binding {
  binding_name: Name;
  binding_type: BindingType;
}

/**
 * Type alias for a sequence of Bindings
 */
export type BindingList = Binding[];

/**
 * Interface for a naming context
 */
export interface NamingContext extends CORBA.ObjectRef {
  /**
   * Bind an object to a name within this context
   */
  bind(n: Name, obj: CORBA.ObjectRef): Promise<void>;

  /**
   * Bind a naming context to a name within this context
   */
  bind_context(n: Name, nc: NamingContext): Promise<void>;

  /**
   * Rebind an object to a name within this context
   */
  rebind(n: Name, obj: CORBA.ObjectRef): Promise<void>;

  /**
   * Rebind a naming context to a name within this context
   */
  rebind_context(n: Name, nc: NamingContext): Promise<void>;

  /**
   * Resolve a name to an object reference
   */
  resolve(n: Name): Promise<CORBA.ObjectRef>;

  /**
   * Unbind a name from this context
   */
  unbind(n: Name): Promise<void>;

  /**
   * Create a new context
   */
  new_context(): Promise<NamingContext>;

  /**
   * Create a new subcontext
   */
  bind_new_context(n: Name): Promise<NamingContext>;

  /**
   * Destroy this context
   */
  destroy(): Promise<void>;

  /**
   * List the bindings in this context
   */
  list(how_many: number): Promise<{
    bl: BindingList;
    bi: BindingIterator;
  }>;
}

/**
 * Interface for a binding iterator
 */
export interface BindingIterator extends CORBA.ObjectRef {
  /**
   * Get the next binding
   */
  next_one(): Promise<{
    b: Binding;
    success: boolean;
  }>;

  /**
   * Get the next n bindings
   */
  next_n(how_many: number): Promise<{
    bl: BindingList;
    success: boolean;
  }>;

  /**
   * Destroy this iterator
   */
  destroy(): Promise<void>;
}

/**
 * Interface for the naming context factory
 */
export interface NamingContextExt extends NamingContext {
  /**
   * Convert a string name to a Name
   */
  to_name(sn: string): Promise<Name>;

  /**
   * Convert a Name to a string
   */
  to_string(n: Name): Promise<string>;

  /**
   * Convert a URL to a string name
   */
  to_url(addr: string, sn: string): Promise<string>;

  /**
   * Resolve a stringified name to an object reference
   */
  resolve_str(sn: string): Promise<CORBA.ObjectRef>;
}

/**
 * Implementation of NamingContext
 */
export class NamingContextImpl extends ObjectReference implements NamingContext {
  [key: string]: unknown;
  private _bindings: Map<string, { obj: CORBA.ObjectRef; type: BindingType }> = new Map();

  constructor() {
    super("IDL:omg.org/CosNaming/NamingContext:1.0");
  }

  /**
   * Get a string key from a Name
   */
  private getKey(n: Name): string {
    return n.map((component) => `${component.id}.${component.kind}`).join("/");
  }

  /**
   * Parse a key back to a Name (inverse of getKey)
   */
  private parseKey(key: string): Name {
    if (!key) return [];

    return key.split("/").map((component) => {
      const lastDotIndex = component.lastIndexOf(".");
      if (lastDotIndex === -1) {
        return { id: component, kind: "" };
      }
      return {
        id: component.substring(0, lastDotIndex),
        kind: component.substring(lastDotIndex + 1),
      };
    });
  }

  /**
   * Get the parent context and last component of a Name
   */
  private async getContext(n: Name): Promise<{ parent: NamingContext; last: NameComponent }> {
    if (n.length === 0) {
      throw new CosNaming.InvalidName();
    }

    if (n.length === 1) {
      return { parent: this, last: n[0] };
    }

    const prefix = n.slice(0, n.length - 1);
    const last = n[n.length - 1];

    const context = await this.resolve(prefix) as NamingContext;
    return { parent: context, last };
  }

  async bind(n: Name, obj: CORBA.ObjectRef): Promise<void> {
    if (n.length === 0) {
      throw new CosNaming.InvalidName();
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      if (this._bindings.has(key)) {
        throw new CosNaming.AlreadyBound();
      }
      this._bindings.set(key, { obj, type: BindingType.nobject });
      return;
    }

    const { parent, last } = await this.getContext(n);
    await parent.bind([last], obj);
  }

  async bind_context(n: Name, nc: NamingContext): Promise<void> {
    if (n.length === 0) {
      throw new CosNaming.InvalidName();
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      if (this._bindings.has(key)) {
        throw new CosNaming.AlreadyBound();
      }
      this._bindings.set(key, { obj: nc, type: BindingType.ncontext });
      return;
    }

    const { parent, last } = await this.getContext(n);
    await parent.bind_context([last], nc);
  }

  async rebind(n: Name, obj: CORBA.ObjectRef): Promise<void> {
    if (n.length === 0) {
      throw new CORBA.BAD_PARAM("Empty name");
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      this._bindings.set(key, { obj, type: BindingType.nobject });
      return;
    }

    const { parent, last } = await this.getContext(n);
    await parent.rebind([last], obj);
  }

  async rebind_context(n: Name, nc: NamingContext): Promise<void> {
    if (n.length === 0) {
      throw new CosNaming.InvalidName();
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      this._bindings.set(key, { obj: nc, type: BindingType.ncontext });
      return;
    }

    const { parent, last } = await this.getContext(n);
    await parent.rebind_context([last], nc);
  }

  resolve(n: Name): Promise<CORBA.ObjectRef> {
    if (n.length === 0) {
      return Promise.reject(new CosNaming.InvalidName());
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      const binding = this._bindings.get(key);
      if (!binding) {
        return Promise.reject(new CosNaming.NotFound(CosNaming.NotFoundReason.missing_node, n));
      }
      return Promise.resolve(binding.obj);
    }

    // Resolve the first component and delegate
    const first = n[0];
    const key = this.getKey([first]);
    const binding = this._bindings.get(key);

    if (!binding) {
      return Promise.reject(
        new CosNaming.NotFound(CosNaming.NotFoundReason.missing_node, n.slice(1)),
      );
    }

    if (binding.type !== BindingType.ncontext) {
      return Promise.reject(
        new CosNaming.NotFound(CosNaming.NotFoundReason.not_context, n.slice(1)),
      );
    }

    const context = binding.obj as NamingContext;
    return context.resolve(n.slice(1));
  }

  async unbind(n: Name): Promise<void> {
    if (n.length === 0) {
      throw new CosNaming.InvalidName();
    }

    if (n.length === 1) {
      const key = this.getKey(n);
      if (!this._bindings.has(key)) {
        throw new CosNaming.NotFound(CosNaming.NotFoundReason.missing_node, n);
      }
      this._bindings.delete(key);
      return;
    }

    const { parent, last } = await this.getContext(n);
    await parent.unbind([last]);
  }

  new_context(): Promise<NamingContext> {
    return Promise.resolve(new NamingContextImpl());
  }

  async bind_new_context(n: Name): Promise<NamingContext> {
    const ctx = await this.new_context();
    await this.bind_context(n, ctx);
    return ctx;
  }

  destroy(): Promise<void> {
    // Check if the context is empty
    if (this._bindings.size > 0) {
      return Promise.reject(new CosNaming.NotEmpty());
    }

    // Cleanup resources
    this._bindings.clear();
    return Promise.resolve();
  }

  /**
   * Check if a name exists in this context
   */
  exists(n: Name): boolean {
    if (n.length === 0) return false;
    if (n.length === 1) {
      return this._bindings.has(this.getKey(n));
    }
    // For compound names, would need to check recursively
    // This is a simplified implementation
    return false;
  }

  /**
   * Get the number of bindings in this context
   */
  size(): number {
    return this._bindings.size;
  }

  /**
   * Check if the context is empty
   */
  isEmpty(): boolean {
    return this._bindings.size === 0;
  }

  list(how_many: number): Promise<{ bl: BindingList; bi: BindingIterator }> {
    const all_bindings: BindingList = [];

    // Convert the internal map to the expected format
    for (const [key, binding] of this._bindings.entries()) {
      // Parse the key back to a Name
      const name = this.parseKey(key);

      all_bindings.push({
        binding_name: name,
        binding_type: binding.type,
      });
    }

    // If we have less bindings than requested, return them all
    if (all_bindings.length <= how_many) {
      return Promise.resolve({
        bl: all_bindings,
        bi: new BindingIteratorImpl([]), // Empty iterator
      });
    }

    // Otherwise, return the first how_many and create an iterator for the rest
    const returned_bindings = all_bindings.slice(0, how_many);
    const remaining_bindings = all_bindings.slice(how_many);

    return Promise.resolve({
      bl: returned_bindings,
      bi: new BindingIteratorImpl(remaining_bindings),
    });
  }
}

/**
 * Implementation of BindingIterator
 */
export class BindingIteratorImpl extends ObjectReference implements BindingIterator {
  [key: string]: unknown;
  private _bindings: BindingList;

  constructor(bindings: BindingList) {
    super("IDL:omg.org/CosNaming/BindingIterator:1.0");
    this._bindings = bindings;
  }

  next_one(): Promise<{ b: Binding; success: boolean }> {
    if (this._bindings.length === 0) {
      return Promise.resolve({
        b: { binding_name: [], binding_type: BindingType.nobject },
        success: false,
      });
    }

    const b = this._bindings.shift()!;
    return Promise.resolve({ b, success: true });
  }

  next_n(how_many: number): Promise<{ bl: BindingList; success: boolean }> {
    if (this._bindings.length === 0) {
      return Promise.resolve({ bl: [], success: false });
    }

    const count = Math.min(how_many, this._bindings.length);
    const bl = this._bindings.slice(0, count);
    this._bindings = this._bindings.slice(count);

    return Promise.resolve({ bl, success: true });
  }

  destroy(): Promise<void> {
    // Clear the internal list
    this._bindings = [];
    return Promise.resolve();
  }
}

/**
 * Implementation of NamingContextExt
 */
export class NamingContextExtImpl extends NamingContextImpl implements NamingContextExt {
  [key: string]: unknown;
  constructor() {
    super();
  }

  to_name(sn: string): Promise<Name> {
    if (!sn || sn.trim() === "") {
      return Promise.reject(new CosNaming.InvalidName());
    }

    try {
      // Parse a stringified name like "id1.kind1/id2.kind2"
      const components = sn.split("/").filter((comp) => comp.length > 0);

      const name: Name = [];
      for (const component of components) {
        // Handle escaped characters if needed
        const unescaped = component.replace(/\\([./])/g, "$1");
        const lastDotIndex = unescaped.lastIndexOf(".");

        let id: string;
        let kind: string;

        if (lastDotIndex === -1) {
          id = unescaped;
          kind = "";
        } else {
          id = unescaped.substring(0, lastDotIndex);
          kind = unescaped.substring(lastDotIndex + 1);
        }

        name.push({ id, kind });
      }

      return Promise.resolve(name);
    } catch (_error) {
      return Promise.reject(new CosNaming.InvalidName());
    }
  }

  to_string(n: Name): Promise<string> {
    if (!n || n.length === 0) {
      return Promise.reject(new CosNaming.InvalidName());
    }

    try {
      // Convert a Name to a string like "id1.kind1/id2.kind2"
      const stringified = n.map((component) => {
        // Escape special characters
        const escapedId = component.id.replace(/([./])/g, "\\$1");
        const escapedKind = component.kind.replace(/([./])/g, "\\$1");
        return `${escapedId}.${escapedKind}`;
      }).join("/");

      return Promise.resolve(stringified);
    } catch (_error) {
      return Promise.reject(new CosNaming.InvalidName());
    }
  }

  to_url(addr: string, sn: string): Promise<string> {
    if (!addr || addr.trim() === "") {
      return Promise.reject(new CORBA.BAD_PARAM("Invalid address"));
    }

    if (!sn || sn.trim() === "") {
      return Promise.reject(new CosNaming.InvalidName());
    }

    try {
      // Convert an address and stringified name to a corbaname URL
      // Format: corbaname:iiop:host:port#stringified_name
      const url = `corbaname:${addr}#${encodeURIComponent(sn)}`;
      return Promise.resolve(url);
    } catch (_error) {
      return Promise.reject(new CORBA.BAD_PARAM("Failed to create URL"));
    }
  }

  async resolve_str(sn: string): Promise<CORBA.ObjectRef> {
    const name = await this.to_name(sn);
    return this.resolve(name);
  }
}

/**
 * Utility functions for name manipulation
 */
export class NameUtil {
  /**
   * Create a simple name with a single component
   */
  static createSimpleName(id: string, kind: string = ""): Name {
    return [{ id, kind }];
  }

  /**
   * Create a compound name from individual components
   */
  static createCompoundName(...components: Array<{ id: string; kind?: string }>): Name {
    return components.map((comp) => ({ id: comp.id, kind: comp.kind || "" }));
  }

  /**
   * Check if two names are equal
   */
  static areEqual(n1: Name, n2: Name): boolean {
    if (n1.length !== n2.length) return false;

    return n1.every((comp1, index) => {
      const comp2 = n2[index];
      return comp1.id === comp2.id && comp1.kind === comp2.kind;
    });
  }

  /**
   * Get the string representation of a name for display
   */
  static toString(n: Name): string {
    return n.map((comp) => `${comp.id}${comp.kind ? `.${comp.kind}` : ""}`).join("/");
  }

  /**
   * Validate that a name is well-formed
   */
  static isValid(n: Name): boolean {
    if (!n || n.length === 0) return false;

    return n.every((comp) =>
      comp.id !== undefined &&
      comp.id !== null &&
      comp.kind !== undefined &&
      comp.kind !== null
    );
  }

  /**
   * Get the parent name (all components except the last)
   */
  static getParentName(n: Name): Name {
    if (n.length <= 1) return [];
    return n.slice(0, n.length - 1);
  }

  /**
   * Get the last component of a name
   */
  static getLastComponent(n: Name): NameComponent | null {
    if (n.length === 0) return null;
    return n[n.length - 1];
  }
}

/**
 * Create a new naming context
 */
export function create_naming_context(): NamingContext {
  return new NamingContextImpl();
}

/**
 * Create a new extended naming context
 */
export function create_naming_context_ext(): NamingContextExt {
  return new NamingContextExtImpl();
}

/**
 * Initialize the naming service and register it with the ORB
 */
export async function init_naming_service(): Promise<NamingContextExt> {
  const orb = ORB_instance();
  const root_context = create_naming_context_ext();

  // Register the root naming context with the ORB
  await orb.register_initial_reference("NameService", root_context);

  return root_context;
}
