/**
 * TypeCode-aware CDR decoder
 * Decodes values based on their TypeCode definitions
 */

import { TypeCode } from "../../typecode.ts";
import { CDRInputStream } from "./decoder.ts";

/**
 * Decode a value from CDR based on its TypeCode
 */
export function decodeWithTypeCode(
  cdr: CDRInputStream,
  tc: TypeCode
): unknown {
  switch (tc.kind()) {
    case TypeCode.Kind.tk_null:
    case TypeCode.Kind.tk_void:
      return null;

    case TypeCode.Kind.tk_short:
      return cdr.readShort();

    case TypeCode.Kind.tk_long:
      return cdr.readLong();

    case TypeCode.Kind.tk_ushort:
      return cdr.readUShort();

    case TypeCode.Kind.tk_ulong:
      return cdr.readULong();

    case TypeCode.Kind.tk_float:
      return cdr.readFloat();

    case TypeCode.Kind.tk_double:
      return cdr.readDouble();

    case TypeCode.Kind.tk_boolean:
      return cdr.readBoolean();

    case TypeCode.Kind.tk_char:
      return cdr.readChar();

    case TypeCode.Kind.tk_octet:
      return cdr.readOctet();

    case TypeCode.Kind.tk_string:
      return cdr.readString();

    case TypeCode.Kind.tk_longlong:
      return cdr.readLongLong();

    case TypeCode.Kind.tk_ulonglong:
      return cdr.readULongLong();

    case TypeCode.Kind.tk_struct:
      return decodeStruct(cdr, tc);

    case TypeCode.Kind.tk_sequence:
      return decodeSequence(cdr, tc);

    case TypeCode.Kind.tk_array:
      return decodeArray(cdr, tc);

    case TypeCode.Kind.tk_enum:
      // Enums are decoded as ulong
      return cdr.readULong();

    case TypeCode.Kind.tk_alias: {
      // Follow the alias to the actual type
      const contentType = tc.content_type();
      if (contentType) {
        return decodeWithTypeCode(cdr, contentType);
      } else {
        // Fallback to string
        return cdr.readString();
      }
    }

    case TypeCode.Kind.tk_any:
      // For Any type, we need to decode TypeCode + value
      // For now, decode as string (simplified)
      return cdr.readString();

    default:
      // For unknown types, try to read as string
      console.warn(`Unsupported TypeCode kind for decoding: ${tc.kind()}`);
      return cdr.readString();
  }
}

/**
 * Decode a struct based on its TypeCode
 */
function decodeStruct(
  cdr: CDRInputStream,
  tc: TypeCode
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  // Get member count and iterate through each member
  const memberCount = tc.member_count();
  
  for (let i = 0; i < memberCount; i++) {
    const memberName = tc.member_name(i);
    const memberType = tc.member_type(i);
    
    if (memberType) {
      result[memberName] = decodeWithTypeCode(cdr, memberType);
    } else {
      // If no member type info, try to decode based on common patterns
      result[memberName] = decodeBasedOnName(cdr, memberName);
    }
  }
  
  return result;
}

/**
 * Decode a sequence (variable-length array)
 */
function decodeSequence(
  cdr: CDRInputStream,
  tc: TypeCode
): unknown[] {
  // Read sequence length
  const length = cdr.readULong();
  const result: unknown[] = [];
  
  // Get element type
  const elementType = tc.content_type();
  
  // Decode each element
  for (let i = 0; i < length; i++) {
    if (elementType) {
      result.push(decodeWithTypeCode(cdr, elementType));
    } else {
      // Fallback to string
      result.push(cdr.readString());
    }
  }
  
  return result;
}

/**
 * Decode an array (fixed-length)
 */
function decodeArray(
  cdr: CDRInputStream,
  tc: TypeCode
): unknown[] {
  // Arrays don't encode length (it's fixed)
  // Get the length from TypeCode
  const length = tc.length();
  const result: unknown[] = [];
  
  // Get element type
  const elementType = tc.content_type();
  
  // Decode each element
  for (let i = 0; i < length; i++) {
    if (elementType) {
      result.push(decodeWithTypeCode(cdr, elementType));
    } else {
      // Fallback to string
      result.push(cdr.readString());
    }
  }
  
  return result;
}

/**
 * Fallback decoding based on field name patterns
 */
function decodeBasedOnName(cdr: CDRInputStream, name: string): unknown {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('id') || lowerName.includes('code') || lowerName.includes('type')) {
    return cdr.readLong();
  } else if (lowerName.includes('name') || lowerName.includes('string') || lowerName.includes('text')) {
    return cdr.readString();
  } else if (lowerName.includes('flag') || lowerName.includes('enabled') || lowerName.includes('active')) {
    return cdr.readBoolean();
  } else if (lowerName.includes('count') || lowerName.includes('size') || lowerName.includes('length')) {
    return cdr.readULong();
  } else {
    // Default to string
    return cdr.readString();
  }
}