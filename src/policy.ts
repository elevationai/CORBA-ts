/**
 * CORBA Policy Implementation
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { ObjectReference } from "./object.ts";

/**
 * Standard Policy Types, numbered per the OMG policy type registry (CORBA 3.4 Part 1, Annex A)
 */
export enum PolicyType {
  SECURE_INVOCATION_POLICY_TYPE = 9, // SecTargetSecureInvocation
  THREAD_POLICY_TYPE = 16,
  LIFESPAN_POLICY_TYPE = 17,
  ID_UNIQUENESS_POLICY_TYPE = 18,
  ID_ASSIGNMENT_POLICY_TYPE = 19,
  IMPLICIT_ACTIVATION_POLICY_TYPE = 20,
  SERVANT_RETENTION_POLICY_TYPE = 21,
  REQUEST_PROCESSING_POLICY_TYPE = 22,
  REBIND_POLICY_TYPE = 23,
  SYNC_SCOPE_POLICY_TYPE = 24,
  REQUEST_PRIORITY_POLICY_TYPE = 25,
  REPLY_PRIORITY_POLICY_TYPE = 26,
  REQUEST_START_TIME_POLICY_TYPE = 27,
  REQUEST_END_TIME_POLICY_TYPE = 28,
  REPLY_START_TIME_POLICY_TYPE = 29,
  REPLY_END_TIME_POLICY_TYPE = 30,
  RELATIVE_REQ_TIMEOUT_POLICY_TYPE = 31,
  RELATIVE_RT_TIMEOUT_POLICY_TYPE = 32,
  ROUTING_POLICY_TYPE = 33,
  MAX_HOPS_POLICY_TYPE = 34,
  QUEUE_ORDER_POLICY_TYPE = 35,
  FIREWALL_POLICY_TYPE = 36,
  BIDIRECTIONAL_POLICY_TYPE = 37,
  TRANSACTION_POLICY_TYPE = 56, // CosTransactions::OTS_POLICY_TYPE
  // Implementation-specific policies
  ENDPOINT_POLICY_TYPE = 1000, // Custom policy for POA endpoint configuration
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
export class PolicyError extends CORBA.UserException {
  reason: number;

  constructor(reason: number) {
    super("IDL:omg.org/CORBA/PolicyError:1.0", "PolicyError");
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
 * EndpointPolicy value structure
 */
export interface EndpointPolicyValue {
  host: string;
  port: number;
}

/**
 * EndpointPolicy class for configuring POA network endpoints
 */
export class EndpointPolicy extends Policy {
  constructor(value: EndpointPolicyValue) {
    super(PolicyType.ENDPOINT_POLICY_TYPE, value);
  }

  get host(): string {
    return (this.value<EndpointPolicyValue>()).host;
  }

  get port(): number {
    return (this.value<EndpointPolicyValue>()).port;
  }
}

/**
 * PortableServer::ThreadPolicyValue
 */
export enum ThreadPolicyValue {
  ORB_CTRL_MODEL = 0,
  SINGLE_THREAD_MODEL = 1,
  MAIN_THREAD_MODEL = 2,
}

/**
 * ThreadPolicy class controlling how a POA dispatches concurrent requests.
 *
 * ORB_CTRL_MODEL, the default, dispatches requests concurrently. SINGLE_THREAD_MODEL runs the
 * POA's upcalls one at a time; MAIN_THREAD_MODEL runs the upcalls of every main-thread POA one
 * at a time. Under either sequential model a servant that calls back into its own POA over the
 * network waits behind itself.
 */
export class ThreadPolicy extends Policy {
  constructor(value: ThreadPolicyValue) {
    super(PolicyType.THREAD_POLICY_TYPE, value);
  }
}

/**
 * Create a policy with the specified type and value
 */
export function create_policy(policy_type: number, policy_value: unknown): Policy {
  return new Policy(policy_type, policy_value);
}

/**
 * Create an endpoint policy for POA configuration
 */
export function create_endpoint_policy(host: string, port: number): EndpointPolicy {
  return new EndpointPolicy({ host, port });
}

/**
 * Create a thread policy for POA configuration
 */
export function create_thread_policy(value: ThreadPolicyValue): ThreadPolicy {
  return new ThreadPolicy(value);
}
