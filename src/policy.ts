/**
 * CORBA Policy Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { ObjectReference } from "./object.ts";

/**
 * Standard Policy Types
 */
export enum PolicyType {
  LIFESPAN_POLICY_TYPE = 1,
  ID_UNIQUENESS_POLICY_TYPE = 2,
  ID_ASSIGNMENT_POLICY_TYPE = 3,
  IMPLICIT_ACTIVATION_POLICY_TYPE = 4,
  SERVANT_RETENTION_POLICY_TYPE = 5,
  REQUEST_PROCESSING_POLICY_TYPE = 6,
  THREAD_POLICY_TYPE = 7,
  TRANSACTION_POLICY_TYPE = 8,
  REBIND_POLICY_TYPE = 9,
  SYNC_SCOPE_POLICY_TYPE = 10,
  REQUEST_PRIORITY_POLICY_TYPE = 11,
  REPLY_PRIORITY_POLICY_TYPE = 12,
  REQUEST_START_TIME_POLICY_TYPE = 13,
  REQUEST_END_TIME_POLICY_TYPE = 14,
  REPLY_START_TIME_POLICY_TYPE = 15,
  REPLY_END_TIME_POLICY_TYPE = 16,
  RELATIVE_REQ_TIMEOUT_POLICY_TYPE = 17,
  RELATIVE_RT_TIMEOUT_POLICY_TYPE = 18,
  ROUTING_POLICY_TYPE = 19,
  MAX_HOPS_POLICY_TYPE = 20,
  QUEUE_ORDER_POLICY_TYPE = 21,
  FIREWALL_POLICY_TYPE = 22,
  BIDIRECTIONAL_POLICY_TYPE = 23,
  SECURE_INVOCATION_POLICY_TYPE = 24,
  // ... others can be added
}

/**
 * Policy interface
 */
export interface PolicyInterface {
  /**
   * Get the policy type
   */
  policy_type(): number;

  /**
   * Copy the policy
   */
  copy(): PolicyInterface;

  /**
   * Destroy the policy
   */
  destroy(): void;
}

/**
 * Policy implementation
 */
export class Policy extends ObjectReference implements PolicyInterface {
  [key: string]: unknown;
  private _policy_type: number;
  private _policy_value: unknown;

  constructor(policy_type: number, policy_value: unknown) {
    super("IDL:omg.org/CORBA/Policy:1.0");
    this._policy_type = policy_type;
    this._policy_value = policy_value;
  }

  policy_type(): number {
    return this._policy_type;
  }

  copy(): PolicyInterface {
    return new Policy(this._policy_type, this._policy_value);
  }

  destroy(): void {
    // In TypeScript with garbage collection, this is a no-op
    // In a complete CORBA implementation, this would release resources
  }

  /**
   * Get the policy value
   */
  value<T>(): T {
    return this._policy_value as T;
  }

  /**
   * Check if this policy is equal to another
   */
  equals(other: Policy): boolean {
    if (!(other instanceof Policy)) {
      return false;
    }

    if (this._policy_type !== other._policy_type) {
      return false;
    }

    // Proper deep comparison of policy values
    return this._deepEqual(this._policy_value, other._policy_value);
  }

  /**
   * Deep equality comparison for policy values
   */
  private _deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;

    if (a === null || b === null) return false;
    if (a === undefined || b === undefined) return false;

    if (typeof a !== typeof b) return false;

    if (typeof a === "object" && typeof b === "object") {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;

      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!bKeys.includes(key)) return false;
        if (!this._deepEqual(aObj[key], bObj[key])) return false;
      }

      return true;
    }

    return false;
  }
}

/**
 * Policy-related exceptions
 */
export class PolicyError extends CORBA.SystemException {
  reason: number;

  constructor(reason: number) {
    super("PolicyError", 0, CORBA.CompletionStatus.COMPLETED_NO);
    this.name = "PolicyError";
    this.reason = reason;
  }
}

/**
 * Policy error codes
 */
export enum PolicyErrorCode {
  BAD_POLICY = 0,
  UNSUPPORTED_POLICY = 1,
  BAD_POLICY_TYPE = 2,
  BAD_POLICY_VALUE = 3,
  UNSUPPORTED_POLICY_VALUE = 4,
}

/**
 * Create a policy with the specified type and value
 */
export function create_policy(policy_type: number, policy_value: unknown): Policy {
  return new Policy(policy_type, policy_value);
}
