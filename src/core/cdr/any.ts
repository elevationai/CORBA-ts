/**
 * Any type support for CDR encoding
 * CORBA 3.4 Specification compliant
 */

import { CDROutputStream } from "./encoder.ts";
import { CDRInputStream } from "./decoder.ts";
import { decodeTypeCode, encodeTypeCode } from "./typecode.ts";
import { TypeCode } from "../../typecode.ts";

// Use the Kind enum from the main TypeCode for consistency
const TCKind = TypeCode.Kind;

/**
 * CORBA value type - represents any value that can be encoded in CDR
 * Using unknown for type safety - values must be type-guarded before use
 */
export type CORBAValue = unknown;

/**
 * CORBA object reference type
 */
interface CORBAObjectRef {
  _ior: unknown; // Can be IOR object or string
}

/**
 * CORBA union value type
 */
interface CORBAUnion {
  _discriminator: number | bigint | string | boolean;
  [key: string]: CORBAValue;
}

/**
 * CORBA Any type
 */
export class Any {
  constructor(
    public type: TypeCode,
    public value: CORBAValue,
  ) {}

  /**
   * Create an Any from a value with automatic type detection
   */
  static fromValue(value: CORBAValue): Any {
    const type = detectTypeCode(value);
    return new Any(type, value);
  }
}

/**
 * Encode an Any to CDR
 */
export function encodeAny(out: CDROutputStream, any: Any): void {
  // Encode the TypeCode
  encodeTypeCode(out, any.type);

  // Encode the value based on TypeCode
  encodeValue(out, any.value, any.type);
}

/**
 * Decode an Any from CDR
 */
export function decodeAny(inp: CDRInputStream): Any {
  // Decode the TypeCode
  const cdrType = decodeTypeCode(inp);

  const type = cdrType;

  // Decode the value based on TypeCode
  const value = decodeValue(inp, type);

  return new Any(type, value);
}

/**
 * Infer TypeCode from a JavaScript value
 */
function inferTypeCode(value: CORBAValue): TypeCode {
  if (value === null || value === undefined) {
    return new TypeCode(TCKind.tk_null);
  }

  if (typeof value === "boolean") {
    return new TypeCode(TCKind.tk_boolean);
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return new TypeCode(TCKind.tk_long);
    }
    return new TypeCode(TCKind.tk_double);
  }

  if (typeof value === "string") {
    return new TypeCode(TCKind.tk_string);
  }

  if (typeof value === "bigint") {
    return new TypeCode(TCKind.tk_longlong);
  }

  if (Array.isArray(value)) {
    // For arrays, create a sequence TypeCode
    const elementType = value.length > 0 ? inferTypeCode(value[0]) : new TypeCode(TCKind.tk_any);
    return TypeCode.create_sequence_tc(0, elementType);
  }

  if (typeof value === "object") {
    // Check if it's an object reference
    if ((value as CORBAObjectRef)._ior) {
      return new TypeCode(TCKind.tk_objref);
    }
    // Generic objects can't be auto-encoded without proper TypeCode
    throw new Error("Cannot infer TypeCode for generic object. Provide explicit TypeCode.");
  }

  // Fallback
  throw new Error(`Cannot infer TypeCode for value of type: ${typeof value}`);
}

/**
 * Encode a value based on its TypeCode
 */
export function encodeValue(out: CDROutputStream, value: CORBAValue, type: TypeCode): void {
  const typeKind = type.kind();

  switch (typeKind) {
    case TCKind.tk_null:
    case TCKind.tk_void:
      // No value to encode
      break;

    case TCKind.tk_short:
      out.writeShort(value as number);
      break;

    case TCKind.tk_long:
      out.writeLong(value as number);
      break;

    case TCKind.tk_ushort:
      out.writeUShort(value as number);
      break;

    case TCKind.tk_ulong:
      out.writeULong(value as number);
      break;

    case TCKind.tk_float:
      out.writeFloat(value as number);
      break;

    case TCKind.tk_double:
      out.writeDouble(value as number);
      break;

    case TCKind.tk_boolean:
      out.writeBoolean(value as boolean);
      break;

    case TCKind.tk_char:
      out.writeChar(value as string);
      break;

    case TCKind.tk_octet:
      out.writeOctet(value as number);
      break;

    case TCKind.tk_string:
      out.writeString(value as string);
      break;

    case TCKind.tk_wstring:
      out.writeWString(value as string);
      break;

    case TCKind.tk_longlong:
      out.writeLongLong(typeof value === "bigint" ? value : BigInt(value as number));
      break;

    case TCKind.tk_ulonglong:
      out.writeULongLong(typeof value === "bigint" ? value : BigInt(value as number));
      break;

    case TCKind.tk_wchar:
      out.writeWChar(value as string);
      break;

    case TCKind.tk_fixed:
      // TODO: Fixed type encoding - need to get digits/scale from TypeCode
      throw new Error("Fixed type encoding not yet implemented");

    case TCKind.tk_any:
      // If value is not already an Any, wrap it
      if (value instanceof Any) {
        encodeAny(out, value);
      }
      else {
        // For tk_any without an Any object, try to infer type
        try {
          const detectedType = inferTypeCode(value);
          encodeAny(out, new Any(detectedType, value));
        }
        catch (_e) {
          // If we can't infer, encode as a null Any
          encodeAny(out, new Any(new TypeCode(TCKind.tk_null), null));
        }
      }
      break;

    case TCKind.tk_TypeCode:
      encodeTypeCode(out, value as TypeCode);
      break;

    case TCKind.tk_objref:
      // Note: This is now async but encodeValue is sync
      // For now, use sync version with string IOR
      if (value && typeof value === "object" && (value as CORBAObjectRef)._ior) {
        const ior = (value as CORBAObjectRef)._ior;
        out.writeString(typeof ior === "string" ? ior : JSON.stringify(ior));
      }
      else {
        out.writeString("");
      }
      break;

    case TCKind.tk_struct:
    case TCKind.tk_except:
      encodeStruct(out, value, type);
      break;

    case TCKind.tk_union:
      encodeUnion(out, value, type);
      break;

    case TCKind.tk_enum:
      out.writeULong(value as number);
      break;

    case TCKind.tk_sequence:
      encodeSequence(out, value as CORBAValue[], type);
      break;

    case TCKind.tk_array:
      encodeArray(out, value as CORBAValue[], type);
      break;

    case TCKind.tk_alias:
    case TCKind.tk_value_box: {
      // Encode the aliased/boxed type
      const contentType = type.content_type();
      if (contentType) {
        encodeValue(out, value, contentType);
      }
      break;
    }

    case TCKind.tk_value:
      encodeValueType(out, value, type);
      break;

    default:
      throw new Error(`Unsupported type kind for encoding: ${typeKind}`);
  }
}

/**
 * Decode a value based on its TypeCode
 */
export function decodeValue(inp: CDRInputStream, type: TypeCode): CORBAValue {
  const typeKind = type.kind();
  switch (typeKind) {
    case TCKind.tk_null:
    case TCKind.tk_void:
      return null;

    case TCKind.tk_short:
      return inp.readShort();

    case TCKind.tk_long:
      return inp.readLong();

    case TCKind.tk_ushort:
      return inp.readUShort();

    case TCKind.tk_ulong:
      return inp.readULong();

    case TCKind.tk_float:
      return inp.readFloat();

    case TCKind.tk_double:
      return inp.readDouble();

    case TCKind.tk_boolean:
      return inp.readBoolean();

    case TCKind.tk_char:
      return inp.readChar();

    case TCKind.tk_octet:
      return inp.readOctet();

    case TCKind.tk_string:
      return inp.readString();

    case TCKind.tk_wstring:
      return inp.readWString();

    case TCKind.tk_longlong:
      return inp.readLongLong();

    case TCKind.tk_ulonglong:
      return inp.readULongLong();

    case TCKind.tk_wchar:
      return inp.readWChar();

    case TCKind.tk_fixed:
      // TODO: Fixed type decoding - need to get digits/scale from TypeCode
      throw new Error("Fixed type decoding not yet implemented");

    case TCKind.tk_any:
      return decodeAny(inp);

    case TCKind.tk_TypeCode:
      return decodeTypeCode(inp);

    case TCKind.tk_objref: {
      // Note: This is now async but decodeValue is sync
      // For now, use sync version returning string IOR
      const iorStr = inp.readString();
      return { _ior: iorStr };
    }

    case TCKind.tk_struct:
    case TCKind.tk_except:
      return decodeStruct(inp, type);

    case TCKind.tk_union:
      return decodeUnion(inp, type);

    case TCKind.tk_enum:
      return inp.readULong();

    case TCKind.tk_sequence:
      return decodeSequence(inp, type);

    case TCKind.tk_array:
      return decodeArray(inp, type);

    case TCKind.tk_alias: {
      // Aliases directly wrap another type, no valuetype encoding
      const contentType = type.content_type();
      if (contentType) {
        return decodeValue(inp, contentType);
      }
      return null;
    }

    case TCKind.tk_value_box: {
      // Boxed valuetypes use valuetype encoding on the wire
      // Decode as a valuetype, similar to tk_value
      return decodeValueType(inp, type);
    }

    case TCKind.tk_value:
      return decodeValueType(inp, type);

    default:
      throw new Error(`Unsupported type kind for decoding: ${typeKind}`);
  }
}

// Helper functions for complex type encoding/decoding

function encodeStruct(out: CDROutputStream, value: CORBAValue, type: TypeCode): void {
  const memberCount = type.member_count();
  for (let i = 0; i < memberCount; i++) {
    const memberName = type.member_name(i);
    const memberType = type.member_type(i);
    if (memberType) {
      const memberValue = (value as Record<string, CORBAValue>)[memberName];
      encodeValue(out, memberValue, memberType);
    }
  }
}

function decodeStruct(inp: CDRInputStream, type: TypeCode): CORBAValue {
  const result: Record<string, CORBAValue> = {};

  const memberCount = type.member_count();
  for (let i = 0; i < memberCount; i++) {
    const memberName = type.member_name(i);
    const memberType = type.member_type(i);
    if (memberType) {
      result[memberName] = decodeValue(inp, memberType);
    }
  }

  return result;
}

function encodeUnion(out: CDROutputStream, value: CORBAValue, type: TypeCode): void {
  // Encode discriminator
  const discriminator = (value as CORBAUnion)._discriminator;
  const discriminatorType = type.discriminator_type();
  if (discriminatorType) {
    encodeValue(out, discriminator, discriminatorType);
  }

  // Find matching member - need to use TypeCode methods
  const memberCount = type.member_count();
  for (let i = 0; i < memberCount; i++) {
    const label = type.member_label(i);
    if (label === discriminator) {
      const memberName = type.member_name(i);
      const memberType = type.member_type(i);
      if (memberType) {
        encodeValue(out, (value as Record<string, CORBAValue>)[memberName], memberType);
      }
      return;
    }
  }

  // Use default member if no match
  const defaultIndex = type.default_index();
  if (defaultIndex >= 0) {
    const memberName = type.member_name(defaultIndex);
    const memberType = type.member_type(defaultIndex);
    if (memberType) {
      encodeValue(out, (value as Record<string, CORBAValue>)[memberName], memberType);
    }
  }
}

function decodeUnion(inp: CDRInputStream, type: TypeCode): CORBAValue {
  const result: Record<string, CORBAValue> = {};

  // Decode discriminator
  const discriminatorType = type.discriminator_type();
  const discriminator = discriminatorType ? decodeValue(inp, discriminatorType) : inp.readULong();
  result._discriminator = discriminator;

  // Find matching member - need to use TypeCode methods
  const memberCount = type.member_count();
  for (let i = 0; i < memberCount; i++) {
    const label = type.member_label(i);
    if (label === discriminator) {
      const memberName = type.member_name(i);
      const memberType = type.member_type(i);
      if (memberType) {
        result[memberName] = decodeValue(inp, memberType);
      }
      return result;
    }
  }

  // Use default member if no match
  const defaultIndex = type.default_index();
  if (defaultIndex >= 0) {
    const memberName = type.member_name(defaultIndex);
    const memberType = type.member_type(defaultIndex);
    if (memberType) {
      result[memberName] = decodeValue(inp, memberType);
    }
  }

  return result;
}

function encodeValueMembers(out: CDROutputStream, value: CORBAValue, type: TypeCode): void {
    // Encode base type members first.
    const baseType = type.concrete_base_type();
    if (baseType && baseType.kind() !== TCKind.tk_null) {
        encodeValueMembers(out, value, baseType);
    }

    // Encode own members.
    const memberCount = type.member_count();
    for (let i = 0; i < memberCount; i++) {
        const memberName = type.member_name(i);
        const memberType = type.member_type(i);
        if (memberType) {
            const memberValue = (value as Record<string, CORBAValue>)[memberName];
            encodeValue(out, memberValue, memberType);
        }
    }
}

function encodeValueType(out: CDROutputStream, value: CORBAValue, type: TypeCode): void {
  if (value === null) {
    out.writeLong(0); // Null valuetype
    return;
  }

  // A full implementation would handle sharing/indirection here.
  // For now, we encode the concrete value.
  // We will encode with a repository ID.
  const repositoryId = type.id();
  if (!repositoryId) {
      throw new Error("Cannot encode valuetype without a repository ID.");
  }

  // Let's check for boxed types first.
  if (repositoryId === "IDL:omg.org/CORBA/WStringValue:1.0") {
      out.writeLong(0x7fffff00); // Standard marshaling tag
      out.writeString(repositoryId);
      out.writeWString(value as string);
      return;
  }
  if (repositoryId === "IDL:omg.org/CORBA/StringValue:1.0") {
      out.writeLong(0x7fffff00); // Standard marshaling tag
      out.writeString(repositoryId);
      out.writeString(value as string);
      return;
  }

  // For general valuetypes, we encode their state.
  // We'll use standard marshaling with a repository ID.
  out.writeLong(0x7fffff00);
  out.writeString(repositoryId);
  encodeValueMembers(out, value, type);
}

function decodeValueMembers(inp: CDRInputStream, type: TypeCode): CORBAValue {
    const result: Record<string, CORBAValue> = {};

    // A valuetype can have a base type.
    const baseType = type.concrete_base_type();
    if (baseType && baseType.kind() !== TCKind.tk_null) {
        const baseValue = decodeValueMembers(inp, baseType) as Record<string, CORBAValue>;
        Object.assign(result, baseValue);
    }

    // Then decode own members.
    const memberCount = type.member_count();
    for (let i = 0; i < memberCount; i++) {
        const memberName = type.member_name(i);
        const memberType = type.member_type(i);
        if (memberType) {
            result[memberName] = decodeValue(inp, memberType);
        }
    }

    return result;
}

function decodeValueType(inp: CDRInputStream, type: TypeCode): CORBAValue {
  // Valuetypes can be encoded in several ways.
  // We read a tag/header first. This is a long.
  const header = inp.readLong();

  if (header === 0) {
    // Null valuetype
    return null;
  }

  if (header === -1) { // 0xFFFFFFFF
    // Indirection. The next long is the position.
    const position = inp.readLong();
    // A full implementation would need to cache decoded valuetypes and seek.
    throw new Error(`Valuetype indirection not yet supported. Position: ${position}`);
  }

  // Check for special tags for valuetypes with repository IDs.
  // 0x7fffff00: standard marshaling
  // 0x7fffff01: chunked marshaling
  // 0x7fffff02: custom marshaling
  if (header >= 0x7fffff00 && header <= 0x7fffff0f) { // Range for valuetype tags
    const repositoryId = inp.readString();

    // Handle boxed types like WStringValue, which may be sent with a tk_value TypeCode
    if (repositoryId === "IDL:omg.org/CORBA/WStringValue:1.0") {
      return inp.readWString();
    }
    if (repositoryId === "IDL:omg.org/CORBA/StringValue:1.0") {
        return inp.readString();
    }

    if (header === 0x7fffff01) { // chunked
        throw new Error("Chunked valuetype encoding not yet supported.");
    }

    // For standard (0x7fffff00) or other custom (0x7fffff02) valuetypes,
    // we decode the members.
    return decodeValueMembers(inp, type);
  }

  // If the header is not a special tag, it's the length of the state.
  // This is for valuetypes without a repository ID on the wire.
  if (header > 0) {
    const startPos = inp.getPosition();
    const value = decodeValueMembers(inp, type);
    const expectedEndPos = startPos + header;
    // If we didn't consume the exact number of bytes, seek to the end
    if (inp.getPosition() !== expectedEndPos) {
        inp.setPosition(expectedEndPos);
    }
    return value;
  }

  // Other negative values are reserved.
  throw new Error(`Invalid or unsupported valuetype header: ${header}`);
}

function encodeSequence(out: CDROutputStream, value: CORBAValue[], type: TypeCode): void {
  out.writeULong(value.length);

  // Get content type from TypeCode
  let contentType: TypeCode | undefined;
  try {
    contentType = type.content_type();
  }
  catch {
    // Method might not exist for this type
  }

  for (const element of value) {
    if (contentType) {
      encodeValue(out, element, contentType);
    }
    else {
      // If no content type, encode as Any
      encodeAny(out, Any.fromValue(element));
    }
  }
}

function decodeSequence(inp: CDRInputStream, type: TypeCode): CORBAValue[] {
  const length = inp.readULong();
  const result: CORBAValue[] = [];

  // Get content type from TypeCode
  let contentType: TypeCode | undefined;
  try {
    contentType = type.content_type();
  }
  catch {
    // Method might not exist for this type
  }

  for (let i = 0; i < length; i++) {
    if (contentType) {
      result.push(decodeValue(inp, contentType));
    }
    else {
      // If no content type and still have data, decode as long (default)
      if (inp.remaining() >= 4) {
        result.push(inp.readLong());
      }
      else {
        break; // No more data
      }
    }
  }

  return result;
}

function encodeArray(out: CDROutputStream, value: CORBAValue[], type: TypeCode): void {
  // Arrays don't encode length (fixed size)
  let length = 0;
  try {
    length = type.length() || 0;
  }
  catch {
    // Method might not exist for this type
  }

  let contentType: TypeCode | undefined;
  try {
    contentType = type.content_type();
  }
  catch {
    // Method might not exist for this type
  }
  for (let i = 0; i < length; i++) {
    if (contentType) {
      encodeValue(out, value[i], contentType);
    }
  }
}

function decodeArray(inp: CDRInputStream, type: TypeCode): CORBAValue[] {
  let length = 0;
  try {
    length = type.length() || 0;
  }
  catch {
    // Method might not exist for this type
  }
  const result: CORBAValue[] = [];

  // Get content type from TypeCode
  let contentType: TypeCode | undefined;
  try {
    contentType = type.content_type();
  }
  catch {
    // Method might not exist for this type
  }

  for (let i = 0; i < length; i++) {
    if (contentType) {
      result.push(decodeValue(inp, contentType));
    }
    else {
      // If no content type and still have data, decode as long (default)
      if (inp.remaining() >= 4) {
        result.push(inp.readLong());
      }
      else {
        break; // No more data
      }
    }
  }

  return result;
}

/**
 * Detect TypeCode from a JavaScript value
 */
function detectTypeCode(value: CORBAValue): TypeCode {
  if (value === null || value === undefined) {
    return new TypeCode(TypeCode.Kind.tk_null);
  }

  if (typeof value === "boolean") {
    return new TypeCode(TypeCode.Kind.tk_boolean);
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      if (value >= -2147483648 && value <= 2147483647) {
        return new TypeCode(TypeCode.Kind.tk_long);
      }
      else {
        return new TypeCode(TypeCode.Kind.tk_longlong);
      }
    }
    else {
      return new TypeCode(TypeCode.Kind.tk_double);
    }
  }

  if (typeof value === "string") {
    return new TypeCode(TypeCode.Kind.tk_string);
  }

  if (typeof value === "bigint") {
    return new TypeCode(TypeCode.Kind.tk_longlong);
  }

  if (Array.isArray(value)) {
    // Try to detect element type from array contents
    if (value.length === 0) {
      // Empty array - default to sequence of any
      return TypeCode.create_sequence_tc(0, new TypeCode(TypeCode.Kind.tk_any));
    }

    // Check if all elements are of the same type
    const firstElemType = detectTypeCode(value[0]);
    let uniformType = true;

    for (let i = 1; i < value.length; i++) {
      const elemType = detectTypeCode(value[i]);
      if (elemType.kind() !== firstElemType.kind()) {
        uniformType = false;
        break;
      }
    }

    if (uniformType) {
      // All elements are the same type, use that
      return TypeCode.create_sequence_tc(0, firstElemType);
    }
    else {
      // Mixed types - use any
      return TypeCode.create_sequence_tc(0, new TypeCode(TypeCode.Kind.tk_any));
    }
  }

  if (value instanceof Any) {
    return new TypeCode(TypeCode.Kind.tk_any);
  }

  if (value instanceof TypeCode) {
    return new TypeCode(TypeCode.Kind.tk_TypeCode);
  }

  if (typeof value === "object") {
    // Check if it's an object reference
    if ((value as CORBAObjectRef)._ior) {
      return new TypeCode(TypeCode.Kind.tk_objref);
    }
    // Generic objects can't be auto-encoded without proper TypeCode
    throw new Error("Cannot infer TypeCode for generic object. Provide explicit TypeCode.");
  }

  // Fallback
  throw new Error(`Cannot infer TypeCode for value of type: ${typeof value}`);
}
