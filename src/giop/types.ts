/**
 * GIOP Types and Constants
 * CORBA 3.4 Specification compliant
 */

/**
 * GIOP Message Types
 */
export enum GIOPMessageType {
  Request = 0,
  Reply = 1,
  CancelRequest = 2,
  LocateRequest = 3,
  LocateReply = 4,
  CloseConnection = 5,
  MessageError = 6,
  Fragment = 7, // GIOP 1.1+
}

/**
 * GIOP Version
 */
export interface GIOPVersion {
  major: number;
  minor: number;
}

/**
 * GIOP Header Flags
 */
export enum GIOPFlags {
  BYTE_ORDER = 0x01, // 0 = big-endian, 1 = little-endian
  FRAGMENT = 0x02, // More fragments follow (GIOP 1.1+)
}

/**
 * GIOP Header (12 bytes)
 */
export interface GIOPHeader {
  magic: Uint8Array; // [0x47, 0x49, 0x4F, 0x50] "GIOP"
  version: GIOPVersion;
  flags: number; // 8-bit flags
  messageType: GIOPMessageType;
  messageSize: number; // Size of message body in bytes
}

/**
 * Reply Status Types
 */
export enum ReplyStatusType {
  NO_EXCEPTION = 0,
  USER_EXCEPTION = 1,
  SYSTEM_EXCEPTION = 2,
  LOCATION_FORWARD = 3,
  LOCATION_FORWARD_PERM = 4, // GIOP 1.2+
  NEEDS_ADDRESSING_MODE = 5, // GIOP 1.2+
}

/**
 * Service Context
 */
export interface ServiceContext {
  contextId: number;
  contextData: Uint8Array;
}

/**
 * Standard Service Context IDs
 */
export enum ServiceContextId {
  TransactionService = 0,
  CodeSets = 1,
  ChainBypassCheck = 2,
  ChainBypassInfo = 3,
  LogicalThreadId = 4,
  InvocationPolicies = 5,
  ForwardedIdentity = 6,
  UnknownExceptionInfo = 9,
  RTCorbaPriority = 10,
  RTCorbaPriorityRange = 11,
  FTGroupVersion = 12,
  FTRequest = 13,
  ExceptionDetailMessage = 14,
  SecurityAttributeService = 15,
  ActivityService = 16,
}

/**
 * Addressing Disposition (GIOP 1.2+)
 */
export enum AddressingDisposition {
  KeyAddr = 0, // Use object key
  ProfileAddr = 1, // Use IOP::TaggedProfile
  ReferenceAddr = 2, // Use full IOR
}

/**
 * Target Address (GIOP 1.2+)
 * This is a discriminated union in CORBA IDL
 */
export type TargetAddress =
  | { disposition: AddressingDisposition.KeyAddr; objectKey: Uint8Array }
  | { disposition: AddressingDisposition.ProfileAddr; profile: TaggedProfile }
  | { disposition: AddressingDisposition.ReferenceAddr; ior: IOR };

/**
 * IOR (Interoperable Object Reference)
 */
export interface IOR {
  typeId: string;
  profiles: TaggedProfile[];
}

/**
 * Tagged Profile
 */
export interface TaggedProfile {
  profileId: number;
  profileData: Uint8Array;
}

/**
 * Standard Profile IDs
 */
export enum ProfileId {
  TAG_INTERNET_IOP = 0, // IIOP Profile
  TAG_MULTIPLE_COMPONENTS = 1,
  TAG_SCCP_IOP = 2,
}

/**
 * IIOP Profile Body
 */
export interface IIOPProfileBody {
  iiop_version: GIOPVersion;
  host: string;
  port: number;
  object_key: Uint8Array;
  components: TaggedComponent[];
}

/**
 * Tagged Component
 */
export interface TaggedComponent {
  componentId: number;
  componentData: Uint8Array;
}

/**
 * Standard Component IDs
 */
export enum ComponentId {
  TAG_ORB_TYPE = 0,
  TAG_CODE_SETS = 1,
  TAG_POLICIES = 2,
  TAG_ALTERNATE_IIOP_ADDRESS = 3,
  TAG_COMPLETE_OBJECT_KEY = 5,
  TAG_ENDPOINT_ID_POSITION = 6,
  TAG_LOCATION_POLICY = 12,
  TAG_CSI_SEC_MECH_LIST = 33,
}

/**
 * System Exception Reply Body
 */
export interface SystemExceptionReplyBody {
  exceptionId: string;
  minor: number;
  completionStatus: number;
}
