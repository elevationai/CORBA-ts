/**
 * TypeCode wire format encoding/decoding for CDR
 * CORBA 3.4 Specification compliant
 *
 * This module ONLY handles encoding/decoding TypeCodes for transmission.
 * It uses the main TypeCode class from ../../typecode.ts exclusively.
 */

import { CDROutputStream } from "./encoder.ts";
import { CDRInputStream } from "./decoder.ts";
import { TypeCode } from "../../typecode.ts";

/**
 * Re-export TCKind as an alias to TypeCode.Kind for backward compatibility
 * This will be removed after full refactoring
 */
export const TCKind = TypeCode.Kind;
export type TCKind = TypeCode.Kind;

/**
 * Encode a TypeCode to CDR wire format
 */
export function encodeTypeCode(out: CDROutputStream, tc: TypeCode): void {
  const kind = tc.kind();

  // Write the kind as ulong
  out.writeULong(kind);

  // Handle each kind according to CORBA spec
  switch (kind) {
    case TypeCode.Kind.tk_null:
    case TypeCode.Kind.tk_void:
    case TypeCode.Kind.tk_short:
    case TypeCode.Kind.tk_long:
    case TypeCode.Kind.tk_ushort:
    case TypeCode.Kind.tk_ulong:
    case TypeCode.Kind.tk_float:
    case TypeCode.Kind.tk_double:
    case TypeCode.Kind.tk_boolean:
    case TypeCode.Kind.tk_char:
    case TypeCode.Kind.tk_octet:
    case TypeCode.Kind.tk_any:
    case TypeCode.Kind.tk_TypeCode:
    case TypeCode.Kind.tk_Principal:
    case TypeCode.Kind.tk_longlong:
    case TypeCode.Kind.tk_ulonglong:
    case TypeCode.Kind.tk_longdouble:
    case TypeCode.Kind.tk_wchar:
      // Simple types - no parameters
      break;

    case TypeCode.Kind.tk_string:
    case TypeCode.Kind.tk_wstring: {
      // Write bound (0 for unbounded)
      let bound = 0;
      try {
        bound = tc.length() || 0;
      }
      catch {
        // Method might not exist or throw for unbounded
      }
      out.writeULong(bound);
      break;
    }

    case TypeCode.Kind.tk_fixed: {
      // Write digits and scale
      let digits = 0;
      let scale = 0;
      try {
        // Fixed types would have fixed_digits() and fixed_scale() in full impl
        // For now, use defaults
        digits = tc.get_param("digits") as number || 0;
        scale = tc.get_param("scale") as number || 0;
      }
      catch {
        // Use defaults
      }
      out.writeUShort(digits);
      out.writeShort(scale);
      break;
    }

    case TypeCode.Kind.tk_objref:
    case TypeCode.Kind.tk_abstract_interface:
    case TypeCode.Kind.tk_native:
    case TypeCode.Kind.tk_local_interface:
      // Complex type: write encapsulation
      encodeComplex(out, tc);
      break;

    case TypeCode.Kind.tk_struct:
    case TypeCode.Kind.tk_except:
      // Write struct/exception TypeCode
      encodeStruct(out, tc);
      break;

    case TypeCode.Kind.tk_union:
      // Write union TypeCode
      encodeUnion(out, tc);
      break;

    case TypeCode.Kind.tk_enum:
      // Write enum TypeCode
      encodeEnum(out, tc);
      break;

    case TypeCode.Kind.tk_sequence:
    case TypeCode.Kind.tk_array:
      // Write sequence/array TypeCode
      encodeSequence(out, tc);
      break;

    case TypeCode.Kind.tk_alias:
    case TypeCode.Kind.tk_value_box:
      // Write alias TypeCode
      encodeAlias(out, tc);
      break;

    case TypeCode.Kind.tk_value:
    case TypeCode.Kind.tk_event:
      // Write value TypeCode
      encodeValue(out, tc);
      break;

    default:
      throw new Error(`Unsupported TypeCode kind: ${kind}`);
  }
}

/**
 * Decode a TypeCode from CDR wire format
 */
export function decodeTypeCode(inp: CDRInputStream): TypeCode {
  const kind = inp.readULong() as TypeCode.Kind;

  switch (kind) {
    case TypeCode.Kind.tk_null:
    case TypeCode.Kind.tk_void:
    case TypeCode.Kind.tk_short:
    case TypeCode.Kind.tk_long:
    case TypeCode.Kind.tk_ushort:
    case TypeCode.Kind.tk_ulong:
    case TypeCode.Kind.tk_float:
    case TypeCode.Kind.tk_double:
    case TypeCode.Kind.tk_boolean:
    case TypeCode.Kind.tk_char:
    case TypeCode.Kind.tk_octet:
    case TypeCode.Kind.tk_any:
    case TypeCode.Kind.tk_TypeCode:
    case TypeCode.Kind.tk_Principal:
    case TypeCode.Kind.tk_longlong:
    case TypeCode.Kind.tk_ulonglong:
    case TypeCode.Kind.tk_longdouble:
    case TypeCode.Kind.tk_wchar:
      // Simple types
      return new TypeCode(kind);

    case TypeCode.Kind.tk_string:
    case TypeCode.Kind.tk_wstring: {
      const bound = inp.readULong();
      if (kind === TypeCode.Kind.tk_string) {
        return TypeCode.create_string_tc(bound);
      }
      else {
        return TypeCode.create_wstring_tc(bound);
      }
    }

    case TypeCode.Kind.tk_fixed: {
      const digits = inp.readUShort();
      const scale = inp.readShort();
      return TypeCode.create_fixed_tc(digits, scale);
    }

    case TypeCode.Kind.tk_objref:
    case TypeCode.Kind.tk_abstract_interface:
    case TypeCode.Kind.tk_native:
    case TypeCode.Kind.tk_local_interface:
      return decodeComplex(inp, kind);

    case TypeCode.Kind.tk_struct:
    case TypeCode.Kind.tk_except:
      return decodeStruct(inp, kind);

    case TypeCode.Kind.tk_union:
      return decodeUnion(inp, kind);

    case TypeCode.Kind.tk_enum:
      return decodeEnum(inp, kind);

    case TypeCode.Kind.tk_sequence:
    case TypeCode.Kind.tk_array:
      return decodeSequence(inp, kind);

    case TypeCode.Kind.tk_alias:
    case TypeCode.Kind.tk_value_box:
      return decodeAlias(inp, kind);

    case TypeCode.Kind.tk_value:
    case TypeCode.Kind.tk_event:
      return decodeValue(inp, kind);

    default:
      throw new Error(`Unsupported TypeCode kind: ${kind}`);
  }
}

// Helper functions for complex type encoding

function encodeComplex(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(512, out.isLittleEndian());

  // Get repository ID and name from TypeCode
  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";

  encap.writeString(id);
  encap.writeString(name);

  out.writeEncapsulation(encap);
}

function encodeStruct(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(1024, out.isLittleEndian());

  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";

  encap.writeString(id);
  encap.writeString(name);

  // Write member count and members
  const memberCount = tc.member_count();
  encap.writeULong(memberCount);

  for (let i = 0; i < memberCount; i++) {
    encap.writeString(tc.member_name(i));
    encodeTypeCode(encap, tc.member_type(i));
  }

  out.writeEncapsulation(encap);
}

function encodeUnion(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(1024, out.isLittleEndian());

  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";

  encap.writeString(id);
  encap.writeString(name);

  // Encode discriminator type
  const discriminatorType = tc.discriminator_type();
  encodeTypeCode(encap, discriminatorType);

  // Encode default index
  const defaultIndex = tc.default_index();
  encap.writeLong(defaultIndex);

  // Encode member count and members
  const memberCount = tc.member_count();
  encap.writeULong(memberCount);

  for (let i = 0; i < memberCount; i++) {
    // Encode label
    const label = tc.member_label(i);
    encodeUnionLabel(encap, label, discriminatorType);

    // Encode member name and type
    encap.writeString(tc.member_name(i));
    encodeTypeCode(encap, tc.member_type(i));
  }

  out.writeEncapsulation(encap);
}

function encodeUnionLabel(out: CDROutputStream, label: unknown, discriminatorType: TypeCode): void {
  const discrKind = discriminatorType.kind();

  switch (discrKind) {
    case TypeCode.Kind.tk_short:
      out.writeShort(label as number);
      break;
    case TypeCode.Kind.tk_long:
      out.writeLong(label as number);
      break;
    case TypeCode.Kind.tk_ushort:
      out.writeUShort(label as number);
      break;
    case TypeCode.Kind.tk_ulong:
    case TypeCode.Kind.tk_enum:
      out.writeULong(label as number);
      break;
    case TypeCode.Kind.tk_boolean:
      out.writeBoolean(label as boolean);
      break;
    case TypeCode.Kind.tk_char:
      out.writeChar(label as string);
      break;
    case TypeCode.Kind.tk_longlong:
      out.writeLongLong(label as bigint);
      break;
    case TypeCode.Kind.tk_ulonglong:
      out.writeULongLong(label as bigint);
      break;
    default:
      // Default case or octet label
      if (typeof label === "number") {
        out.writeOctet(label);
      }
      else {
        out.writeLong(0);
      }
  }
}

function encodeEnum(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(512, out.isLittleEndian());

  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";

  encap.writeString(id);
  encap.writeString(name);

  // Write member count and names
  const memberCount = tc.member_count();
  encap.writeULong(memberCount);

  for (let i = 0; i < memberCount; i++) {
    encap.writeString(tc.member_name(i));
  }

  out.writeEncapsulation(encap);
}

function encodeSequence(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(256, out.isLittleEndian());

  // Get content type and length
  const contentType = tc.content_type();
  const length = tc.length() || 0;

  encodeTypeCode(encap, contentType);
  encap.writeULong(length);

  out.writeEncapsulation(encap);
}

function encodeAlias(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(512, out.isLittleEndian());

  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";

  encap.writeString(id);
  encap.writeString(name);

  // Encode aliased type
  const contentType = tc.content_type();
  if (contentType) {
    encodeTypeCode(encap, contentType);
  }
  else {
    // Default to null if no content type
    encodeTypeCode(encap, new TypeCode(TypeCode.Kind.tk_null));
  }

  out.writeEncapsulation(encap);
}

function encodeValue(out: CDROutputStream, tc: TypeCode): void {
  const encap = new CDROutputStream(512, out.isLittleEndian());

  const id = tc.get_param("id") as string || "";
  const name = tc.get_param("name") as string || "";
  const typeModifier = tc.get_param("typeModifier") as number || 0;

  encap.writeString(id);
  encap.writeString(name);
  encap.writeShort(typeModifier);

  // Encode concrete base type if present
  const concreteBase = tc.get_param("concreteBase") as TypeCode;
  if (concreteBase) {
    encodeTypeCode(encap, concreteBase);
  }
  else {
    encodeTypeCode(encap, new TypeCode(TypeCode.Kind.tk_null));
  }

  // Encode member count and members
  const memberCount = tc.member_count();
  encap.writeULong(memberCount);

  for (let i = 0; i < memberCount; i++) {
    encap.writeString(tc.member_name(i));
    encodeTypeCode(encap, tc.member_type(i));
    encap.writeShort(tc.get_param(`member_visibility_${i}`) as number || 0);
  }

  out.writeEncapsulation(encap);
}

// Helper functions for complex type decoding

function decodeComplex(inp: CDRInputStream, kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with byte order + padding to 4-byte boundary
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const id = encap.readString();
  const name = encap.readString();

  const tc = new TypeCode(kind);
  tc.set_param("id", id);
  tc.set_param("name", name);

  return tc;
}

function decodeStruct(inp: CDRInputStream, kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with a byte order flag
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;

  // Create stream starting at position 4 (after byte order + padding)
  // Encapsulations are aligned to 4-byte boundaries
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const id = encap.readString();
  const name = encap.readString();

  const memberCount = encap.readULong();
  const members = [];

  for (let i = 0; i < memberCount; i++) {
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    members.push({ name: memberName, type: memberType });
  }

  // Create the struct TypeCode
  if (kind === TypeCode.Kind.tk_struct) {
    return TypeCode.create_struct_tc(id, name, members);
  }
  else {
    return TypeCode.create_exception_tc(id, name, members);
  }
}

function decodeUnion(inp: CDRInputStream, _kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with byte order + padding to 4-byte boundary
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const id = encap.readString();
  const name = encap.readString();

  const discriminatorType = decodeTypeCode(encap);
  const defaultIndex = encap.readLong();

  const memberCount = encap.readULong();
  const members = [];

  for (let i = 0; i < memberCount; i++) {
    const label = decodeUnionLabel(encap, discriminatorType);
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    members.push({ label, name: memberName, type: memberType });
  }

  const tc = TypeCode.create_union_tc(id, name, discriminatorType, members);
  if (defaultIndex >= 0) {
    tc.set_param("default_index", defaultIndex);
  }
  return tc;
}

function decodeUnionLabel(inp: CDRInputStream, discriminatorType: TypeCode): unknown {
  const discrKind = discriminatorType.kind();

  switch (discrKind) {
    case TypeCode.Kind.tk_short:
      return inp.readShort();
    case TypeCode.Kind.tk_long:
      return inp.readLong();
    case TypeCode.Kind.tk_ushort:
      return inp.readUShort();
    case TypeCode.Kind.tk_ulong:
    case TypeCode.Kind.tk_enum:
      return inp.readULong();
    case TypeCode.Kind.tk_boolean:
      return inp.readBoolean();
    case TypeCode.Kind.tk_char:
      return inp.readChar();
    case TypeCode.Kind.tk_longlong:
      return inp.readLongLong();
    case TypeCode.Kind.tk_ulonglong:
      return inp.readULongLong();
    default:
      return inp.readOctet();
  }
}

function decodeEnum(inp: CDRInputStream, _kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with byte order + padding to 4-byte boundary
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const id = encap.readString();
  const name = encap.readString();

  const memberCount = encap.readULong();
  const members = [];

  for (let i = 0; i < memberCount; i++) {
    members.push(encap.readString());
  }

  return TypeCode.create_enum_tc(id, name, members);
}

function decodeSequence(inp: CDRInputStream, kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with byte order + padding to 4-byte boundary
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const contentType = decodeTypeCode(encap);
  const bound = encap.readULong();

  if (kind === TypeCode.Kind.tk_sequence) {
    return TypeCode.create_sequence_tc(bound, contentType);
  }
  else {
    return TypeCode.create_array_tc(bound, contentType);
  }
}

function decodeAlias(inp: CDRInputStream, kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);

  // CORBA encapsulations start with byte order + padding to 4-byte boundary
  const byteOrder = encapData[0];
  const littleEndian = byteOrder === 1;
  const encap = new CDRInputStream(encapData.slice(4), littleEndian);

  const id = encap.readString();
  const name = encap.readString();
  const contentType = decodeTypeCode(encap);

  if (kind === TypeCode.Kind.tk_alias) {
    return TypeCode.create_alias_tc(id, name, contentType);
  }
  else {
    // tk_value_box
    return TypeCode.create_value_box_tc(id, name, contentType);
  }
}

function decodeValue(inp: CDRInputStream, _kind: TypeCode.Kind): TypeCode {
  const length = inp.readULong();
  const encapData = inp.readOctetArray(length);
  const encap = new CDRInputStream(encapData);

  const id = encap.readString();
  const name = encap.readString();
  const typeModifier = encap.readShort();
  const concreteBase = decodeTypeCode(encap);

  const memberCount = encap.readULong();
  const members = [];

  for (let i = 0; i < memberCount; i++) {
    const memberName = encap.readString();
    const memberType = decodeTypeCode(encap);
    const visibility = encap.readShort();
    members.push({ name: memberName, type: memberType, visibility });
  }

  return TypeCode.create_value_tc(id, name, typeModifier, concreteBase, members);
}
