/**
 * TypeCode-aware CDR encoder
 * Encodes values based on their TypeCode definitions
 */

import { TypeCode } from "../../typecode.ts";
import { CDROutputStream } from "./encoder.ts";
import { Any, encodeAny } from "./any.ts";
// Import CDR TypeCode for handling internal CDR types
// deno-lint-ignore no-unused-vars
import { TCKind, TypeCode as CDRTypeCode } from "./typecode.ts";

/**
 * Encode a value to CDR based on its TypeCode
 */
export function encodeWithTypeCode(
  cdr: CDROutputStream,
  value: unknown,
  tc: TypeCode,
): void {
  switch (tc.kind()) {
    case TypeCode.Kind.tk_null:
    case TypeCode.Kind.tk_void:
      // Nothing to encode
      break;

    case TypeCode.Kind.tk_short:
      cdr.writeShort(value as number);
      break;

    case TypeCode.Kind.tk_long:
      cdr.writeLong(value as number);
      break;

    case TypeCode.Kind.tk_ushort:
      cdr.writeUShort(value as number);
      break;

    case TypeCode.Kind.tk_ulong:
      cdr.writeULong(value as number);
      break;

    case TypeCode.Kind.tk_float:
      cdr.writeFloat(value as number);
      break;

    case TypeCode.Kind.tk_double:
      cdr.writeDouble(value as number);
      break;

    case TypeCode.Kind.tk_boolean:
      cdr.writeBoolean(value as boolean);
      break;

    case TypeCode.Kind.tk_char:
      cdr.writeChar(value as string);
      break;

    case TypeCode.Kind.tk_octet:
      cdr.writeOctet(value as number);
      break;

    case TypeCode.Kind.tk_string:
      cdr.writeString(value as string || "");
      break;

    case TypeCode.Kind.tk_longlong:
      if (typeof value === "bigint") {
        cdr.writeLongLong(value);
      } else {
        cdr.writeLongLong(BigInt(value as number));
      }
      break;

    case TypeCode.Kind.tk_ulonglong:
      if (typeof value === "bigint") {
        cdr.writeULongLong(value);
      } else {
        cdr.writeULongLong(BigInt(value as number));
      }
      break;

    case TypeCode.Kind.tk_struct:
      encodeStruct(cdr, value as Record<string, unknown>, tc);
      break;

    case TypeCode.Kind.tk_sequence:
      encodeSequence(cdr, value as unknown[], tc);
      break;

    case TypeCode.Kind.tk_array:
      encodeArray(cdr, value as unknown[], tc);
      break;

    case TypeCode.Kind.tk_enum:
      // Enums are encoded as ulong
      cdr.writeULong(value as number);
      break;

    case TypeCode.Kind.tk_alias: {
      // Follow the alias to the actual type
      const contentType = tc.content_type();
      if (contentType) {
        encodeWithTypeCode(cdr, value, contentType);
      } else {
        // Fallback to string
        cdr.writeString(String(value));
      }
      break;
    }

    case TypeCode.Kind.tk_any: {
      // Encode Any type properly: TypeCode + value
      if (value instanceof Any) {
        // Already an Any object
        encodeAny(cdr, value);
      } else {
        // Create Any from value and encode
        const any = Any.fromValue(value);
        encodeAny(cdr, any);
      }
      break;
    }

    case TypeCode.Kind.tk_objref: {
      // Encode object reference as IOR string
      if (value === null || value === undefined) {
        // Null reference - encode empty IOR string
        cdr.writeString("");
      } else if (typeof value === "object" && "_ior" in value) {
        // Has _ior property - encode it as string
        cdr.writeString((value as { _ior: string })._ior);
      } else {
        throw new Error("Invalid object reference: must be null or have _ior property");
      }
      break;
    }

    default:
      // Throw error for unsupported types instead of fallback
      throw new Error(`Unsupported TypeCode kind: ${tc.kind()}`);
  }
}

/**
 * Encode a struct based on its TypeCode
 */
function encodeStruct(
  cdr: CDROutputStream,
  value: Record<string, unknown>,
  tc: TypeCode,
): void {
  // Get member count and iterate through each member
  const memberCount = tc.member_count();

  for (let i = 0; i < memberCount; i++) {
    const memberName = tc.member_name(i);
    const memberType = tc.member_type(i);
    const memberValue = value[memberName];

    if (memberType) {
      encodeWithTypeCode(cdr, memberValue, memberType);
    } else {
      // If no member type info, try to encode based on value type
      encodeBasedOnValueType(cdr, memberValue);
    }
  }
}

/**
 * Encode a sequence (variable-length array)
 */
function encodeSequence(
  cdr: CDROutputStream,
  value: unknown[],
  tc: TypeCode,
): void {
  // Write sequence length
  cdr.writeULong(value.length);

  // Get element type
  const elementType = tc.content_type();

  // Encode each element
  for (const element of value) {
    if (elementType) {
      encodeWithTypeCode(cdr, element, elementType);
    } else {
      encodeBasedOnValueType(cdr, element);
    }
  }
}

/**
 * Encode an array (fixed-length)
 */
function encodeArray(
  cdr: CDROutputStream,
  value: unknown[],
  tc: TypeCode,
): void {
  // Arrays don't encode length (it's fixed)
  // Get element type
  const elementType = tc.content_type();

  // Encode each element
  for (const element of value) {
    if (elementType) {
      encodeWithTypeCode(cdr, element, elementType);
    } else {
      encodeBasedOnValueType(cdr, element);
    }
  }
}

/**
 * Fallback encoding based on JavaScript value type
 */
function encodeBasedOnValueType(cdr: CDROutputStream, value: unknown): void {
  if (value === null || value === undefined) {
    cdr.writeString("");
  } else if (typeof value === "string") {
    cdr.writeString(value);
  } else if (typeof value === "number") {
    if (Number.isInteger(value)) {
      cdr.writeLong(value);
    } else {
      cdr.writeDouble(value);
    }
  } else if (typeof value === "boolean") {
    cdr.writeBoolean(value);
  } else if (typeof value === "bigint") {
    cdr.writeLongLong(value);
  } else if (Array.isArray(value)) {
    // Encode as sequence
    cdr.writeULong(value.length);
    for (const elem of value) {
      encodeBasedOnValueType(cdr, elem);
    }
  } else if (typeof value === "object") {
    // For objects without TypeCode, encode as JSON string
    cdr.writeString(JSON.stringify(value));
  } else {
    cdr.writeString(String(value));
  }
}
