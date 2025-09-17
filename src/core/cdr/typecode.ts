/**
 * TypeCode support for CDR encoding
 * CORBA 3.4 Specification compliant
 */

import { CDROutputStream } from "./encoder.ts";
import { CDRInputStream } from "./decoder.ts";
import { TypeCode as MainTypeCode } from "../../typecode.ts";

/**
 * TypeCode kinds as defined in CORBA specification
 */
export enum TCKind {
  tk_null = 0,
  tk_void = 1,
  tk_short = 2,
  tk_long = 3,
  tk_ushort = 4,
  tk_ulong = 5,
  tk_float = 6,
  tk_double = 7,
  tk_boolean = 8,
  tk_char = 9,
  tk_octet = 10,
  tk_any = 11,
  tk_TypeCode = 12,
  tk_Principal = 13,
  tk_objref = 14,
  tk_struct = 15,
  tk_union = 16,
  tk_enum = 17,
  tk_string = 18,
  tk_sequence = 19,
  tk_array = 20,
  tk_alias = 21,
  tk_except = 22,
  tk_longlong = 23,
  tk_ulonglong = 24,
  tk_longdouble = 25,
  tk_wchar = 26,
  tk_wstring = 27,
  tk_fixed = 28,
  tk_value = 29,
  tk_value_box = 30,
  tk_native = 31,
  tk_abstract_interface = 32,
  tk_local_interface = 33,
  tk_component = 34,
  tk_home = 35,
  tk_event = 36,
}

/**
 * TypeCode structure member
 */
export interface StructMember {
  name: string;
  type: TypeCode;
}

/**
 * TypeCode union member
 */
export interface UnionMember {
  name: string;
  label: number | bigint | string | boolean;
  type: TypeCode;
}

/**
 * TypeCode class
 */
export class TypeCode {
  constructor(
    public readonly kind: TCKind,
    public readonly id?: string,
    public readonly name?: string,
    public readonly members?: StructMember[],
    public readonly discriminatorType?: TypeCode,
    public readonly unionMembers?: UnionMember[],
    public readonly defaultIndex?: number,
    public readonly enumMembers?: string[],
    public readonly contentType?: TypeCode,
    public readonly length?: number,
    public readonly digits?: number,
    public readonly scale?: number,
    public readonly typeModifier?: number,
    public readonly concreteBase?: TypeCode,
  ) {}

  /**
   * Create a struct TypeCode
   */
  static createStruct(id: string, name: string, members: StructMember[]): TypeCode {
    return new TypeCode(TCKind.tk_struct, id, name, members);
  }

  /**
   * Create a sequence TypeCode
   */
  static createSequence(elementType: TypeCode, bound: number = 0): TypeCode {
    return new TypeCode(
      TCKind.tk_sequence,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      elementType,
      bound,
    );
  }

  /**
   * Create an array TypeCode
   */
  static createArray(elementType: TypeCode, length: number): TypeCode {
    return new TypeCode(
      TCKind.tk_array,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      elementType,
      length,
    );
  }

  /**
   * Create a string TypeCode
   */
  static createString(bound: number = 0): TypeCode {
    return new TypeCode(
      TCKind.tk_string,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      bound,
    );
  }

  /**
   * Create an enum TypeCode
   */
  static createEnum(id: string, name: string, members: string[]): TypeCode {
    return new TypeCode(
      TCKind.tk_enum,
      id,
      name,
      undefined,
      undefined,
      undefined,
      undefined,
      members,
    );
  }

  /**
   * Create an alias TypeCode
   */
  static createAlias(id: string, name: string, originalType: TypeCode): TypeCode {
    return new TypeCode(
      TCKind.tk_alias,
      id,
      name,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      originalType,
    );
  }

  /**
   * Create a fixed TypeCode
   */
  static createFixed(digits: number, scale: number): TypeCode {
    return new TypeCode(
      TCKind.tk_fixed,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      digits,
      scale,
    );
  }
}

/**
 * Encode a TypeCode to CDR
 */
export function encodeTypeCode(out: CDROutputStream, tc: TypeCode | MainTypeCode): void {
  // Handle both CDR TypeCode and main TypeCode
  const kind = typeof tc.kind === 'function' ? tc.kind() : tc.kind;

  // Write the kind
  out.writeULong(kind);

  // Write type-specific parameters
  switch (kind) {
    // Simple types with no parameters
    case TCKind.tk_null:
    case TCKind.tk_void:
    case TCKind.tk_short:
    case TCKind.tk_long:
    case TCKind.tk_ushort:
    case TCKind.tk_ulong:
    case TCKind.tk_float:
    case TCKind.tk_double:
    case TCKind.tk_boolean:
    case TCKind.tk_char:
    case TCKind.tk_octet:
    case TCKind.tk_any:
    case TCKind.tk_TypeCode:
    case TCKind.tk_Principal:
    case TCKind.tk_longlong:
    case TCKind.tk_ulonglong:
    case TCKind.tk_longdouble:
    case TCKind.tk_wchar:
      // No parameters to encode
      break;

    case TCKind.tk_string:
    case TCKind.tk_wstring: {
      // Write bound (0 for unbounded)
      // Handle both CDR TypeCode (property) and main TypeCode (method)
      let bound = 0;
      if (typeof tc.length === 'function') {
        try {
          bound = tc.length() || 0;
        } catch {
          bound = 0;  // If method throws, use 0 (unbounded)
        }
      } else {
        bound = tc.length || 0;
      }
      out.writeULong(bound);
      break;
    }

    case TCKind.tk_fixed: {
      // Write digits and scale
      const cdrTc = tc as TypeCode;
      out.writeUShort(cdrTc.digits || 0);
      out.writeShort(cdrTc.scale || 0);
      break;
    }

    case TCKind.tk_objref:
    case TCKind.tk_abstract_interface:
    case TCKind.tk_native:
    case TCKind.tk_local_interface:
      // Complex type: write encapsulation
      encodeComplex(out, tc as TypeCode);
      break;

    case TCKind.tk_struct:
    case TCKind.tk_except:
      // Write struct/exception TypeCode
      encodeStruct(out, tc as TypeCode);
      break;

    case TCKind.tk_union:
      // Write union TypeCode
      encodeUnion(out, tc as TypeCode);
      break;

    case TCKind.tk_enum:
      // Write enum TypeCode
      encodeEnum(out, tc as TypeCode);
      break;

    case TCKind.tk_sequence:
    case TCKind.tk_array:
      // Write sequence/array TypeCode
      encodeSequence(out, tc as TypeCode);
      break;

    case TCKind.tk_alias:
    case TCKind.tk_value_box:
      // Write alias TypeCode
      encodeAlias(out, tc as TypeCode);
      break;

    case TCKind.tk_value:
    case TCKind.tk_event:
      // Write value TypeCode
      encodeValue(out, tc as TypeCode);
      break;

    default:
      throw new Error(`Unsupported TypeCode kind: ${typeof tc.kind === 'function' ? tc.kind() : tc.kind}`);
  }
}

/**
 * Decode a TypeCode from CDR
 */
export function decodeTypeCode(inp: CDRInputStream): TypeCode {
  // Read the kind
  const kind = inp.readULong() as TCKind;

  // Read type-specific parameters
  switch (kind) {
    // Simple types with no parameters
    case TCKind.tk_null:
    case TCKind.tk_void:
    case TCKind.tk_short:
    case TCKind.tk_long:
    case TCKind.tk_ushort:
    case TCKind.tk_ulong:
    case TCKind.tk_float:
    case TCKind.tk_double:
    case TCKind.tk_boolean:
    case TCKind.tk_char:
    case TCKind.tk_octet:
    case TCKind.tk_any:
    case TCKind.tk_TypeCode:
    case TCKind.tk_Principal:
    case TCKind.tk_longlong:
    case TCKind.tk_ulonglong:
    case TCKind.tk_longdouble:
    case TCKind.tk_wchar:
      return new TypeCode(kind);

    case TCKind.tk_string:
    case TCKind.tk_wstring: {
      const bound = inp.readULong();
      return new TypeCode(
        kind,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        bound,
      );
    }

    case TCKind.tk_fixed: {
      const digits = inp.readUShort();
      const scale = inp.readShort();
      return new TypeCode(
        kind,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        digits,
        scale,
      );
    }

    case TCKind.tk_objref:
    case TCKind.tk_abstract_interface:
    case TCKind.tk_native:
    case TCKind.tk_local_interface:
      return decodeComplex(inp, kind);

    case TCKind.tk_struct:
    case TCKind.tk_except:
      return decodeStruct(inp, kind);

    case TCKind.tk_union:
      return decodeUnion(inp, kind);

    case TCKind.tk_enum:
      return decodeEnum(inp, kind);

    case TCKind.tk_sequence:
    case TCKind.tk_array:
      return decodeSequence(inp, kind);

    case TCKind.tk_alias:
    case TCKind.tk_value_box:
      return decodeAlias(inp, kind);

    case TCKind.tk_value:
    case TCKind.tk_event:
      return decodeValue(inp, kind);

    default:
      throw new Error(`Unsupported TypeCode kind: ${kind}`);
  }
}

// Helper functions for complex type encoding/decoding

function encodeComplex(out: CDROutputStream, tc: TypeCode): void {
  // Use encapsulation for complex types
  const encap = new CDROutputStream(256, out.isLittleEndian());
  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeComplex(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();

  return new TypeCode(kind, id, name);
}

function encodeStruct(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");
  encap.writeULong(tc.members?.length || 0);

  for (const member of tc.members || []) {
    encap.writeString(member.name);
    encodeTypeCode(encap, member.type);
  }

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeStruct(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();
  const memberCount = encap.readULong();

  const members: StructMember[] = [];
  for (let i = 0; i < memberCount; i++) {
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    members.push({ name: memberName, type: memberType });
  }

  return new TypeCode(kind, id, name, members);
}

function encodeUnion(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");
  encodeTypeCode(encap, tc.discriminatorType!);
  encap.writeLong(tc.defaultIndex ?? -1);
  encap.writeULong(tc.unionMembers?.length || 0);

  for (const member of tc.unionMembers || []) {
    // Encode label based on discriminator type
    encodeUnionLabel(encap, member.label, tc.discriminatorType!);
    encap.writeString(member.name);
    encodeTypeCode(encap, member.type);
  }

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeUnion(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();
  const discriminatorType = decodeTypeCode(encap);
  const defaultIndex = encap.readLong();
  const memberCount = encap.readULong();

  const unionMembers: UnionMember[] = [];
  for (let i = 0; i < memberCount; i++) {
    const label = decodeUnionLabel(encap, discriminatorType);
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    unionMembers.push({ name: memberName, label, type: memberType });
  }

  return new TypeCode(
    kind,
    id,
    name,
    undefined,
    discriminatorType,
    unionMembers,
    defaultIndex >= 0 ? defaultIndex : undefined,
  );
}

function encodeEnum(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");
  encap.writeULong(tc.enumMembers?.length || 0);

  for (const member of tc.enumMembers || []) {
    encap.writeString(member);
  }

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeEnum(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();
  const memberCount = encap.readULong();

  const enumMembers: string[] = [];
  for (let i = 0; i < memberCount; i++) {
    enumMembers.push(encap.readString());
  }

  return new TypeCode(kind, id, name, undefined, undefined, undefined, undefined, enumMembers);
}

function encodeSequence(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  // Handle both CDR TypeCode (property) and main TypeCode (method)
  const contentType = tc.contentType || (typeof (tc as any).content_type === 'function' ? (tc as any).content_type() : undefined);
  if (contentType) {
    encodeTypeCode(encap, contentType);
  } else {
    // Default to tk_any if no content type
    encodeTypeCode(encap, new TypeCode(TCKind.tk_any));
  }

  const length = tc.length || (typeof (tc as any).length === 'function' ? (tc as any).length() : 0);
  encap.writeULong(length || 0);

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeSequence(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const contentType = decodeTypeCode(encap);
  const bound = encap.readULong();

  return new TypeCode(
    kind,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    contentType,
    bound,
  );
}

function encodeAlias(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");
  encodeTypeCode(encap, tc.contentType!);

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeAlias(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();
  const contentType = decodeTypeCode(encap);

  return new TypeCode(
    kind,
    id,
    name,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    contentType,
  );
}

function encodeValue(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  encap.writeString(tc.id || "");
  encap.writeString(tc.name || "");
  encap.writeShort(tc.typeModifier || 0);

  // Encode concrete base if present
  if (tc.concreteBase) {
    encodeTypeCode(encap, tc.concreteBase);
  } else {
    encodeTypeCode(encap, new TypeCode(TCKind.tk_null));
  }

  // Encode members
  encap.writeULong(tc.members?.length || 0);
  for (const member of tc.members || []) {
    encap.writeString(member.name);
    encodeTypeCode(encap, member.type);
    encap.writeShort(0); // Visibility (PUBLIC = 0)
  }

  const encapBuffer = encap.getBuffer();
  out.writeULong(encapBuffer.length);
  out.writeOctetArray(encapBuffer);
}

function decodeValue(inp: CDRInputStream, kind: TCKind): TypeCode {
  const length = inp.readULong();
  const encap = inp.createSubStream(length);

  const id = encap.readString();
  const name = encap.readString();
  const typeModifier = encap.readShort();

  const concreteBase = decodeTypeCode(encap);
  const memberCount = encap.readULong();

  const members: StructMember[] = [];
  for (let i = 0; i < memberCount; i++) {
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    encap.readShort(); // Skip visibility
    members.push({ name: memberName, type: memberType });
  }

  return new TypeCode(
    kind,
    id,
    name,
    members,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    typeModifier,
    concreteBase.kind !== TCKind.tk_null ? concreteBase : undefined,
  );
}

function encodeUnionLabel(
  out: CDROutputStream,
  label: number | bigint | string | boolean,
  discriminatorType: TypeCode,
): void {
  switch (discriminatorType.kind) {
    case TCKind.tk_short:
      out.writeShort(label as number);
      break;
    case TCKind.tk_long:
      out.writeLong(label as number);
      break;
    case TCKind.tk_ushort:
      out.writeUShort(label as number);
      break;
    case TCKind.tk_ulong:
      out.writeULong(label as number);
      break;
    case TCKind.tk_boolean:
      out.writeBoolean(label as boolean);
      break;
    case TCKind.tk_char:
      out.writeChar(label as string);
      break;
    case TCKind.tk_enum:
      out.writeULong(label as number);
      break;
    case TCKind.tk_longlong:
      out.writeLongLong(BigInt(label));
      break;
    case TCKind.tk_ulonglong:
      out.writeULongLong(BigInt(label));
      break;
    default:
      throw new Error(`Unsupported discriminator type: ${discriminatorType.kind}`);
  }
}

function decodeUnionLabel(
  inp: CDRInputStream,
  discriminatorType: TypeCode,
): number | bigint | string | boolean {
  switch (discriminatorType.kind) {
    case TCKind.tk_short:
      return inp.readShort();
    case TCKind.tk_long:
      return inp.readLong();
    case TCKind.tk_ushort:
      return inp.readUShort();
    case TCKind.tk_ulong:
      return inp.readULong();
    case TCKind.tk_boolean:
      return inp.readBoolean();
    case TCKind.tk_char:
      return inp.readChar();
    case TCKind.tk_enum:
      return inp.readULong();
    case TCKind.tk_longlong:
      return inp.readLongLong();
    case TCKind.tk_ulonglong:
      return inp.readULongLong();
    default:
      throw new Error(`Unsupported discriminator type: ${discriminatorType.kind}`);
  }
}
