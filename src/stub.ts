/**
 * CORBA Stub Base Class
 * Provides narrow() functionality for all generated stubs
 */

import { CORBA } from "./types.ts";
import { Object } from "./object.ts";

/**
 * Helper types for typing the constructor side of subclasses
 */
type StubCtor<T> = new (ref: CORBA.ObjectRef) => T;
type HasRepoId = { _repository_id: string };

/**
 * Abstract base class for all CORBA stubs
 * Provides narrow() and narrowAsync() static methods with proper typing
 */
export abstract class CorbaStub implements Object {
  // Subclasses must provide a CORBA repository id
  static readonly _repository_id: string;

  // Accept either ObjectRef or Object as the backing reference
  constructor(protected readonly _ref: CORBA.ObjectRef | Object) {}

  /**
   * Narrow (sync): returns an instance of the subclass
   * Uses the `this` type to ensure correct return type
   */
  static narrow<TSub>(
    this: StubCtor<TSub>,
    obj: CORBA.ObjectRef | Object | null | undefined,
  ): TSub | null {
    if (!obj) return null;
    if ("is_nil" in obj && typeof obj.is_nil === "function" && obj.is_nil()) return null;

    // If it's already the right stub type, just return it
    if (obj instanceof this) {
      return obj as TSub;
    }

    // Wrap the CORBA ref in the specific subclass
    return new this(obj);
  }

  /**
   * Narrow (async): checks interface support via the subclass's repo id
   * Performs is_a() check before narrowing
   */
  static async narrowAsync<TSub>(
    this: StubCtor<TSub> & HasRepoId & { narrow: (obj: CORBA.ObjectRef | Object | null | undefined) => TSub | null },
    obj: CORBA.ObjectRef | Object | null | undefined,
  ): Promise<TSub | null> {
    if (!obj) return null;
    if ("is_nil" in obj && typeof obj.is_nil === "function" && obj.is_nil()) return null;

    // Check if object supports the interface
    const supportsInterface = "is_a" in obj && typeof obj.is_a === "function"
      ? await obj.is_a(this._repository_id)
      : "_is_a" in obj && typeof obj._is_a === "function"
      ? await obj._is_a(this._repository_id)
      : false;
    if (!supportsInterface) return null;

    return this.narrow(obj);
  }

  // Implement Object interface by delegating to _ref if it's an Object
  get_interface() {
    if ("get_interface" in this._ref && typeof this._ref.get_interface === "function") {
      return this._ref.get_interface();
    }
    throw new Error("get_interface not available on ObjectRef");
  }

  is_nil() {
    if ("is_nil" in this._ref && typeof this._ref.is_nil === "function") {
      return this._ref.is_nil();
    }
    return false;
  }

  is_equivalent(other_object: Object) {
    if ("is_equivalent" in this._ref && typeof this._ref.is_equivalent === "function") {
      return this._ref.is_equivalent(other_object);
    }
    if ("_is_equivalent" in this._ref && typeof this._ref._is_equivalent === "function") {
      return this._ref._is_equivalent(other_object as CORBA.ObjectRef);
    }
    return false;
  }

  is_a(repository_id: string) {
    if ("is_a" in this._ref && typeof this._ref.is_a === "function") {
      return this._ref.is_a(repository_id);
    }
    if ("_is_a" in this._ref && typeof this._ref._is_a === "function") {
      return this._ref._is_a(repository_id);
    }
    return Promise.resolve(false);
  }

  non_existent() {
    if ("non_existent" in this._ref && typeof this._ref.non_existent === "function") {
      return this._ref.non_existent();
    }
    if ("_non_existent" in this._ref && typeof this._ref._non_existent === "function") {
      return this._ref._non_existent();
    }
    return Promise.resolve(false);
  }

  hash(maximum: number) {
    if ("hash" in this._ref && typeof this._ref.hash === "function") {
      return this._ref.hash(maximum);
    }
    if ("_hash" in this._ref && typeof this._ref._hash === "function") {
      return this._ref._hash(maximum);
    }
    return 0;
  }

  duplicate() {
    if ("duplicate" in this._ref && typeof this._ref.duplicate === "function") {
      return this._ref.duplicate();
    }
    return this; // Return self if no duplicate method
  }

  release() {
    if ("release" in this._ref && typeof this._ref.release === "function") {
      return this._ref.release();
    }
    // No-op if no release method
  }

  get_domain_managers() {
    if ("get_domain_managers" in this._ref && typeof this._ref.get_domain_managers === "function") {
      return this._ref.get_domain_managers();
    }
    return Promise.resolve([]);
  }

  set_policy_overrides(policies: import("./policy.ts").Policy[], set_add: import("./object.ts").SetOverrideType) {
    if ("set_policy_overrides" in this._ref && typeof this._ref.set_policy_overrides === "function") {
      return this._ref.set_policy_overrides(policies, set_add);
    }
    return this;
  }

  get_policy(policy_type: number) {
    if ("get_policy" in this._ref && typeof this._ref.get_policy === "function") {
      return this._ref.get_policy(policy_type);
    }
    throw new Error("get_policy not available");
  }

  get_client_policy(type: number) {
    if ("get_client_policy" in this._ref && typeof this._ref.get_client_policy === "function") {
      return this._ref.get_client_policy(type);
    }
    throw new Error("get_client_policy not available");
  }

  get_policy_overrides(types: number[]) {
    if ("get_policy_overrides" in this._ref && typeof this._ref.get_policy_overrides === "function") {
      return this._ref.get_policy_overrides(types);
    }
    return [];
  }

  validate_connection(inconsistent_policies: import("./policy.ts").Policy[]) {
    if ("validate_connection" in this._ref && typeof this._ref.validate_connection === "function") {
      return this._ref.validate_connection(inconsistent_policies);
    }
    return true;
  }

  get_component() {
    if ("get_component" in this._ref && typeof this._ref.get_component === "function") {
      return this._ref.get_component();
    }
    throw new Error("get_component not available");
  }

  get_type_id() {
    if ("get_type_id" in this._ref && typeof this._ref.get_type_id === "function") {
      return this._ref.get_type_id();
    }
    return Promise.resolve((this.constructor as { _repository_id?: string })._repository_id || "unknown");
  }

  _get_interface_id() {
    if ("_get_interface_id" in this._ref && typeof this._ref._get_interface_id === "function") {
      return this._ref._get_interface_id();
    }
    return (this.constructor as { _repository_id?: string })._repository_id || "unknown";
  }

  // Allow index access for compatibility
  [key: string]: unknown;
}
