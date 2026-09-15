/**
 * Core CORBA Type System
 * Based on CORBA 3.4 specification
 */

import * as SystemExceptions from "./core/exceptions/system.ts";

/**
 * Basic CORBA Types mapped to TypeScript
 */
// deno-lint-ignore no-namespace
export namespace CORBA {
  // Primitive types
  export type Short = number;
  export type Long = number;
  export type LongLong = bigint;
  export type UShort = number;
  export type ULong = number;
  export type ULongLong = bigint;
  export type Float = number;
  export type Double = number;
  export type Boolean = boolean;
  export type Char = string; // Single character
  export type WChar = string; // Wide character
  export type Octet = number; // 8-bit unsigned
  export type Any = unknown;

  // String types
  export type String = string;
  export type WString = string; // Wide string

  // Special types
  export type TypeCode = unknown; // Will be defined fully later

  // ObjectRef is a minimal interface for CORBA objects
  // It does NOT include duplicate/release to avoid conflicts with CUSS IDL
  export interface ObjectRef {
    // Basic CORBA object methods (with underscore prefix to avoid conflicts)
    _is_a?: (repository_id: string) => Promise<boolean>;
    _non_existent?: () => Promise<boolean>;
    _is_equivalent?: (other_object: ObjectRef) => boolean;
    _hash?: (maximum: number) => number;
    // Allow any other method/property
    [key: string]: unknown;
  }

  // Sequence - maps to array in TypeScript
  export type Sequence<T> = Array<T>;

  export import CompletionStatus = SystemExceptions.CompletionStatus;
  export import SystemException = SystemExceptions.SystemException;
  export import UNKNOWN = SystemExceptions.UNKNOWN;
  export import BAD_PARAM = SystemExceptions.BAD_PARAM;
  export import NO_MEMORY = SystemExceptions.NO_MEMORY;
  export import IMP_LIMIT = SystemExceptions.IMP_LIMIT;
  export import COMM_FAILURE = SystemExceptions.COMM_FAILURE;
  export import INV_OBJREF = SystemExceptions.INV_OBJREF;
  export import NO_PERMISSION = SystemExceptions.NO_PERMISSION;
  export import INTERNAL = SystemExceptions.INTERNAL;
  export import MARSHAL = SystemExceptions.MARSHAL;
  export import INITIALIZE = SystemExceptions.INITIALIZE;
  export import NO_IMPLEMENT = SystemExceptions.NO_IMPLEMENT;
  export import BAD_TYPECODE = SystemExceptions.BAD_TYPECODE;
  export import BAD_OPERATION = SystemExceptions.BAD_OPERATION;
  export import NO_RESOURCES = SystemExceptions.NO_RESOURCES;
  export import NO_RESPONSE = SystemExceptions.NO_RESPONSE;
  export import PERSIST_STORE = SystemExceptions.PERSIST_STORE;
  export import BAD_INV_ORDER = SystemExceptions.BAD_INV_ORDER;
  export import TRANSIENT = SystemExceptions.TRANSIENT;
  export import FREE_MEM = SystemExceptions.FREE_MEM;
  export import INV_IDENT = SystemExceptions.INV_IDENT;
  export import INV_FLAG = SystemExceptions.INV_FLAG;
  export import INTF_REPOS = SystemExceptions.INTF_REPOS;
  export import BAD_CONTEXT = SystemExceptions.BAD_CONTEXT;
  export import OBJ_ADAPTER = SystemExceptions.OBJ_ADAPTER;
  export import DATA_CONVERSION = SystemExceptions.DATA_CONVERSION;
  export import OBJECT_NOT_EXIST = SystemExceptions.OBJECT_NOT_EXIST;
  export import TRANSACTION_REQUIRED = SystemExceptions.TRANSACTION_REQUIRED;
  export import TRANSACTION_ROLLEDBACK = SystemExceptions.TRANSACTION_ROLLEDBACK;
  export import INVALID_TRANSACTION = SystemExceptions.INVALID_TRANSACTION;
  export import INV_POLICY = SystemExceptions.INV_POLICY;
  export import CODESET_INCOMPATIBLE = SystemExceptions.CODESET_INCOMPATIBLE;
  export import REBIND = SystemExceptions.REBIND;
  export import TIMEOUT = SystemExceptions.TIMEOUT;
  export import TRANSACTION_UNAVAILABLE = SystemExceptions.TRANSACTION_UNAVAILABLE;
  export import TRANSACTION_MODE = SystemExceptions.TRANSACTION_MODE;
  export import BAD_QOS = SystemExceptions.BAD_QOS;

  /**
   * Base class for CORBA User Exceptions
   */
  export class UserException extends Error {
    repositoryId: string;

    constructor(repositoryId: string, message?: string) {
      super(message || "User exception");
      this.name = "CORBA.UserException";
      this.repositoryId = repositoryId;
    }
  }
}
