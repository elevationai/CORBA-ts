/**
 * Core CORBA Type System
 * Based on CORBA 3.4 specification
 */

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

  // ObjectRef is defined as an interface with known static members
  export interface ObjectRef {
    // Minimum required interface for all CORBA objects
    _is_a?: (repository_id: string) => Promise<boolean>;
    _non_existent?: () => Promise<boolean>;
    _is_equivalent?: (other_object: ObjectRef) => boolean;
    _hash?: (maximum: number) => number;
    [key: string]: unknown; // Allow any other method
  }

  // Sequence - maps to array in TypeScript
  export type Sequence<T> = Array<T>;

  /**
   * CORBA System Exception base class
   */
  export class SystemException extends Error {
    minor: number;
    completed: CompletionStatus;

    constructor(
      message: string,
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(message);
      this.name = "CORBA.SystemException";
      this.minor = typeof minor === "string" ? 0 : minor;
      this.completed = completed;
    }
  }

  /**
   * Completion status for operations
   */
  export enum CompletionStatus {
    COMPLETED_YES = 0,
    COMPLETED_NO = 1,
    COMPLETED_MAYBE = 2,
  }

  /**
   * Standard System Exceptions
   */
  export class UNKNOWN extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super("CORBA.UNKNOWN", minor, completed);
      this.name = "CORBA.UNKNOWN";
    }
  }

  export class BAD_PARAM extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.BAD_PARAM: ${minor}` : "CORBA.BAD_PARAM",
        minor,
        completed,
      );
      this.name = "CORBA.BAD_PARAM";
    }
  }

  export class NO_MEMORY extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.NO_MEMORY: ${minor}` : "CORBA.NO_MEMORY",
        minor,
        completed,
      );
      this.name = "CORBA.NO_MEMORY";
    }
  }

  export class INV_OBJREF extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.INV_OBJREF: ${minor}` : "CORBA.INV_OBJREF",
        minor,
        completed,
      );
      this.name = "CORBA.INV_OBJREF";
    }
  }

  export class COMM_FAILURE extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.COMM_FAILURE: ${minor}` : "CORBA.COMM_FAILURE",
        minor,
        completed,
      );
      this.name = "CORBA.COMM_FAILURE";
    }
  }

  export class MARSHAL extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.MARSHAL: ${minor}` : "CORBA.MARSHAL",
        minor,
        completed,
      );
      this.name = "CORBA.MARSHAL";
    }
  }

  export class NO_IMPLEMENT extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.NO_IMPLEMENT: ${minor}` : "CORBA.NO_IMPLEMENT",
        minor,
        completed,
      );
      this.name = "CORBA.NO_IMPLEMENT";
    }
  }

  export class INTERNAL extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.INTERNAL: ${minor}` : "CORBA.INTERNAL",
        minor,
        completed,
      );
      this.name = "CORBA.INTERNAL";
    }
  }

  export class BAD_OPERATION extends SystemException {
    constructor(
      minor: number | string = 0,
      completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
    ) {
      super(
        typeof minor === "string" ? `CORBA.BAD_OPERATION: ${minor}` : "CORBA.BAD_OPERATION",
        minor,
        completed,
      );
      this.name = "CORBA.BAD_OPERATION";
    }
  }
}
