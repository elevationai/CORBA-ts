/**
 * CORBA System Exceptions
 * Complete set of system exceptions as defined in CORBA 3.4 specification
 */

/**
 * Completion status for CORBA operations
 */
export enum CompletionStatus {
  COMPLETED_YES = 0, // Operation completed successfully
  COMPLETED_NO = 1, // Operation did not complete
  COMPLETED_MAYBE = 2, // Unknown whether operation completed
}

/**
 * Base class for all CORBA system exceptions
 */
export abstract class SystemException extends Error {
  public readonly minor: number;
  public readonly completed: CompletionStatus;

  constructor(
    name: string,
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super(message || name);
    this.name = name;
    this.minor = minor;
    this.completed = completed;
  }

  override toString(): string {
    return `${this.name}: ${this.message} (minor: ${this.minor}, completed: ${CompletionStatus[this.completed]})`;
  }
}

// Standard CORBA System Exceptions (31 total as per CORBA 3.4)

/**
 * UNKNOWN - Unknown exception
 */
export class UNKNOWN extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("UNKNOWN", message || "Unknown exception", minor, completed);
  }
}

/**
 * BAD_PARAM - Invalid parameter passed
 */
export class BAD_PARAM extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_PARAM", message || "Invalid parameter", minor, completed);
  }
}

/**
 * NO_MEMORY - Insufficient memory
 */
export class NO_MEMORY extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("NO_MEMORY", message || "Insufficient memory", minor, completed);
  }
}

/**
 * IMP_LIMIT - Implementation limit exceeded
 */
export class IMP_LIMIT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("IMP_LIMIT", message || "Implementation limit exceeded", minor, completed);
  }
}

/**
 * COMM_FAILURE - Communication failure
 */
export class COMM_FAILURE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("COMM_FAILURE", message || "Communication failure", minor, completed);
  }
}

/**
 * INV_OBJREF - Invalid object reference
 */
export class INV_OBJREF extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INV_OBJREF", message || "Invalid object reference", minor, completed);
  }
}

/**
 * NO_PERMISSION - No permission for operation
 */
export class NO_PERMISSION extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("NO_PERMISSION", message || "No permission for operation", minor, completed);
  }
}

/**
 * INTERNAL - Internal ORB error
 */
export class INTERNAL extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INTERNAL", message || "Internal error", minor, completed);
  }
}

/**
 * MARSHAL - Error marshaling parameter or result
 */
export class MARSHAL extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("MARSHAL", message || "Marshaling error", minor, completed);
  }
}

/**
 * INITIALIZE - ORB initialization failure
 */
export class INITIALIZE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INITIALIZE", message || "Initialization failure", minor, completed);
  }
}

/**
 * NO_IMPLEMENT - Operation not implemented
 */
export class NO_IMPLEMENT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("NO_IMPLEMENT", message || "Operation not implemented", minor, completed);
  }
}

/**
 * BAD_TYPECODE - Bad TypeCode
 */
export class BAD_TYPECODE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_TYPECODE", message || "Bad TypeCode", minor, completed);
  }
}

/**
 * BAD_OPERATION - Invalid operation
 */
export class BAD_OPERATION extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_OPERATION", message || "Invalid operation", minor, completed);
  }
}

/**
 * NO_RESOURCES - Insufficient resources
 */
export class NO_RESOURCES extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("NO_RESOURCES", message || "Insufficient resources", minor, completed);
  }
}

/**
 * NO_RESPONSE - No response from server
 */
export class NO_RESPONSE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("NO_RESPONSE", message || "No response", minor, completed);
  }
}

/**
 * PERSIST_STORE - Persistent storage failure
 */
export class PERSIST_STORE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("PERSIST_STORE", message || "Persistent storage failure", minor, completed);
  }
}

/**
 * BAD_INV_ORDER - Operations invoked in wrong order
 */
export class BAD_INV_ORDER extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_INV_ORDER", message || "Bad invocation order", minor, completed);
  }
}

/**
 * TRANSIENT - Transient failure
 */
export class TRANSIENT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TRANSIENT", message || "Transient failure", minor, completed);
  }
}

/**
 * FREE_MEM - Cannot free memory
 */
export class FREE_MEM extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("FREE_MEM", message || "Cannot free memory", minor, completed);
  }
}

/**
 * INV_IDENT - Invalid identifier
 */
export class INV_IDENT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INV_IDENT", message || "Invalid identifier", minor, completed);
  }
}

/**
 * INV_FLAG - Invalid flag
 */
export class INV_FLAG extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INV_FLAG", message || "Invalid flag", minor, completed);
  }
}

/**
 * INTF_REPOS - Interface repository error
 */
export class INTF_REPOS extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INTF_REPOS", message || "Interface repository error", minor, completed);
  }
}

/**
 * BAD_CONTEXT - Invalid context
 */
export class BAD_CONTEXT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_CONTEXT", message || "Invalid context", minor, completed);
  }
}

/**
 * OBJ_ADAPTER - Object adapter failure
 */
export class OBJ_ADAPTER extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("OBJ_ADAPTER", message || "Object adapter failure", minor, completed);
  }
}

/**
 * DATA_CONVERSION - Data conversion error
 */
export class DATA_CONVERSION extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("DATA_CONVERSION", message || "Data conversion error", minor, completed);
  }
}

/**
 * OBJECT_NOT_EXIST - Object does not exist
 */
export class OBJECT_NOT_EXIST extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("OBJECT_NOT_EXIST", message || "Object does not exist", minor, completed);
  }
}

/**
 * TRANSACTION_REQUIRED - Transaction required
 */
export class TRANSACTION_REQUIRED extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TRANSACTION_REQUIRED", message || "Transaction required", minor, completed);
  }
}

/**
 * TRANSACTION_ROLLEDBACK - Transaction rolled back
 */
export class TRANSACTION_ROLLEDBACK extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TRANSACTION_ROLLEDBACK", message || "Transaction rolled back", minor, completed);
  }
}

/**
 * INVALID_TRANSACTION - Invalid transaction
 */
export class INVALID_TRANSACTION extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INVALID_TRANSACTION", message || "Invalid transaction", minor, completed);
  }
}

/**
 * INV_POLICY - Invalid policy
 */
export class INV_POLICY extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("INV_POLICY", message || "Invalid policy", minor, completed);
  }
}

/**
 * CODESET_INCOMPATIBLE - Incompatible code set
 */
export class CODESET_INCOMPATIBLE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("CODESET_INCOMPATIBLE", message || "Incompatible code set", minor, completed);
  }
}

/**
 * REBIND - Rebind needed
 */
export class REBIND extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("REBIND", message || "Rebind needed", minor, completed);
  }
}

/**
 * TIMEOUT - Operation timed out
 */
export class TIMEOUT extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TIMEOUT", message || "Operation timed out", minor, completed);
  }
}

/**
 * TRANSACTION_UNAVAILABLE - Transaction unavailable
 */
export class TRANSACTION_UNAVAILABLE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TRANSACTION_UNAVAILABLE", message || "Transaction unavailable", minor, completed);
  }
}

/**
 * TRANSACTION_MODE - Invalid transaction mode
 */
export class TRANSACTION_MODE extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("TRANSACTION_MODE", message || "Invalid transaction mode", minor, completed);
  }
}

/**
 * BAD_QOS - Bad quality of service
 */
export class BAD_QOS extends SystemException {
  constructor(
    message?: string,
    minor: number = 0,
    completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
  ) {
    super("BAD_QOS", message || "Bad quality of service", minor, completed);
  }
}

/**
 * User exception base class
 */
export abstract class UserException extends Error {
  constructor(name: string, message?: string) {
    super(message || name);
    this.name = name;
  }
}

/**
 * Factory for creating system exceptions by name
 */
export function createSystemException(
  name: string,
  message?: string,
  minor: number = 0,
  completed: CompletionStatus = CompletionStatus.COMPLETED_NO,
): SystemException {
  switch (name) {
    case "UNKNOWN":
      return new UNKNOWN(message, minor, completed);
    case "BAD_PARAM":
      return new BAD_PARAM(message, minor, completed);
    case "NO_MEMORY":
      return new NO_MEMORY(message, minor, completed);
    case "IMP_LIMIT":
      return new IMP_LIMIT(message, minor, completed);
    case "COMM_FAILURE":
      return new COMM_FAILURE(message, minor, completed);
    case "INV_OBJREF":
      return new INV_OBJREF(message, minor, completed);
    case "NO_PERMISSION":
      return new NO_PERMISSION(message, minor, completed);
    case "INTERNAL":
      return new INTERNAL(message, minor, completed);
    case "MARSHAL":
      return new MARSHAL(message, minor, completed);
    case "INITIALIZE":
      return new INITIALIZE(message, minor, completed);
    case "NO_IMPLEMENT":
      return new NO_IMPLEMENT(message, minor, completed);
    case "BAD_TYPECODE":
      return new BAD_TYPECODE(message, minor, completed);
    case "BAD_OPERATION":
      return new BAD_OPERATION(message, minor, completed);
    case "NO_RESOURCES":
      return new NO_RESOURCES(message, minor, completed);
    case "NO_RESPONSE":
      return new NO_RESPONSE(message, minor, completed);
    case "PERSIST_STORE":
      return new PERSIST_STORE(message, minor, completed);
    case "BAD_INV_ORDER":
      return new BAD_INV_ORDER(message, minor, completed);
    case "TRANSIENT":
      return new TRANSIENT(message, minor, completed);
    case "FREE_MEM":
      return new FREE_MEM(message, minor, completed);
    case "INV_IDENT":
      return new INV_IDENT(message, minor, completed);
    case "INV_FLAG":
      return new INV_FLAG(message, minor, completed);
    case "INTF_REPOS":
      return new INTF_REPOS(message, minor, completed);
    case "BAD_CONTEXT":
      return new BAD_CONTEXT(message, minor, completed);
    case "OBJ_ADAPTER":
      return new OBJ_ADAPTER(message, minor, completed);
    case "DATA_CONVERSION":
      return new DATA_CONVERSION(message, minor, completed);
    case "OBJECT_NOT_EXIST":
      return new OBJECT_NOT_EXIST(message, minor, completed);
    case "TRANSACTION_REQUIRED":
      return new TRANSACTION_REQUIRED(message, minor, completed);
    case "TRANSACTION_ROLLEDBACK":
      return new TRANSACTION_ROLLEDBACK(message, minor, completed);
    case "INVALID_TRANSACTION":
      return new INVALID_TRANSACTION(message, minor, completed);
    case "INV_POLICY":
      return new INV_POLICY(message, minor, completed);
    case "CODESET_INCOMPATIBLE":
      return new CODESET_INCOMPATIBLE(message, minor, completed);
    case "REBIND":
      return new REBIND(message, minor, completed);
    case "TIMEOUT":
      return new TIMEOUT(message, minor, completed);
    case "TRANSACTION_UNAVAILABLE":
      return new TRANSACTION_UNAVAILABLE(message, minor, completed);
    case "TRANSACTION_MODE":
      return new TRANSACTION_MODE(message, minor, completed);
    case "BAD_QOS":
      return new BAD_QOS(message, minor, completed);
    default:
      return new UNKNOWN(`Unknown exception type: ${name}`, minor, completed);
  }
}
