/**
 * TypeCode implementation for CORBA
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";

/**
 * TypeCode class and namespace
 */
export class TypeCode {
  private _kind: TypeCode.Kind;
  private _params: Map<string, unknown> = new Map();

  constructor(kind: TypeCode.Kind) {
    this._kind = kind;
  }

  /**
   * Get the kind of this TypeCode
   */
  kind(): TypeCode.Kind {
    return this._kind;
  }

  /**
   * Check if this TypeCode is equal to another
   */
  equal(tc: TypeCode): boolean {
    if (this._kind !== tc._kind) {
      return false;
    }

    // For simple types, just comparing kind is enough
    if (TypeCode.is_simple_type(this._kind)) {
      return true;
    }

    // For complex types, compare parameters
    // This would need a complete implementation based on TypeCode kind
    return false;
  }

  /**
   * Get the ID for this type
   * Only valid for certain kinds of TypeCodes
   */
  id(): string {
    this.check_method_validity("id");
    return this._params.get("id") as string;
  }

  /**
   * Get the name for this type
   * Only valid for certain kinds of TypeCodes
   */
  name(): string {
    this.check_method_validity("name");
    return this._params.get("name") as string;
  }

  /**
   * Get the member count
   * Only valid for struct, union, enum, exception, and value types
   */
  member_count(): number {
    this.check_method_validity("member_count");
    const members = this._params.get("members") as Array<unknown>;
    return members ? members.length : 0;
  }

  /**
   * Get the name of a member
   * Only valid for struct, union, enum, exception, and value types
   */
  member_name(index: number): string {
    this.check_method_validity("member_name");
    const members = this._params.get("members") as Array<{ name: string; type: TypeCode }>;
    this.check_index(index, members.length);
    return members[index].name;
  }

  /**
   * Get the TypeCode of a member
   * Only valid for struct, union, exception, and value types
   */
  member_type(index: number): TypeCode {
    this.check_method_validity("member_type");
    const members = this._params.get("members") as Array<{ name: string; type: TypeCode }>;
    this.check_index(index, members.length);
    return members[index].type;
  }

  /**
   * Get the content type for sequences and arrays
   */
  content_type(): TypeCode {
    this.check_method_validity("content_type");
    return this._params.get("content_type") as TypeCode;
  }

  /**
   * Get the length for bounded sequences and arrays
   */
  length(): number {
    this.check_method_validity("length");
    return this._params.get("length") as number;
  }

  /**
   * Set a parameter for this TypeCode
   * Used internally during TypeCode construction
   */
  set_param(name: string, value: unknown): void {
    this._params.set(name, value);
  }

  /**
   * Helper to check if a method is valid for this TypeCode kind
   */
  private check_method_validity(method: string): void {
    const valid_methods = TypeCode.valid_methods_for_kind(this._kind);
    if (!valid_methods.includes(method)) {
      throw new CORBA.BAD_PARAM(
        `Operation ${method} not valid for TypeCode of kind ${TypeCode.Kind[this._kind]}`,
      );
    }
  }

  /**
   * Helper to check array index validity
   */
  private check_index(index: number, length: number): void {
    if (index < 0 || index >= length) {
      throw new CORBA.BAD_PARAM(`Index ${index} out of bounds (0..${length - 1})`);
    }
  }
}

/**
 * TypeCode namespace - contains constants and helper functions
 */
// deno-lint-ignore no-namespace
export namespace TypeCode {
  /**
   * TypeCode Kinds
   */
  export enum Kind {
    // Basic types
    tk_null,
    tk_void,
    tk_short,
    tk_long,
    tk_ushort,
    tk_ulong,
    tk_float,
    tk_double,
    tk_boolean,
    tk_char,
    tk_octet,
    tk_any,
    tk_TypeCode,
    tk_Principal,
    tk_objref,
    tk_struct,
    tk_union,
    tk_enum,
    tk_string,
    tk_sequence,
    tk_array,
    tk_alias,
    tk_except,
    tk_longlong,
    tk_ulonglong,
    tk_longdouble,
    tk_wchar,
    tk_wstring,
    tk_fixed,
    tk_value,
    tk_value_box,
    tk_native,
    tk_abstract_interface,
    tk_local_interface,
    tk_component,
    tk_home,
    tk_event,
  }

  /**
   * Check if a TypeCode kind is a simple type
   */
  export function is_simple_type(kind: Kind): boolean {
    return (
      kind === Kind.tk_null ||
      kind === Kind.tk_void ||
      kind === Kind.tk_short ||
      kind === Kind.tk_long ||
      kind === Kind.tk_ushort ||
      kind === Kind.tk_ulong ||
      kind === Kind.tk_float ||
      kind === Kind.tk_double ||
      kind === Kind.tk_boolean ||
      kind === Kind.tk_char ||
      kind === Kind.tk_octet ||
      kind === Kind.tk_any ||
      kind === Kind.tk_TypeCode ||
      kind === Kind.tk_Principal ||
      kind === Kind.tk_longlong ||
      kind === Kind.tk_ulonglong ||
      kind === Kind.tk_longdouble ||
      kind === Kind.tk_wchar
    );
  }

  /**
   * Get valid methods for a TypeCode kind
   */
  export function valid_methods_for_kind(kind: Kind): string[] {
    // All TypeCodes support kind() and equal()
    const basic_methods = ["kind", "equal"];

    switch (kind) {
      case Kind.tk_objref:
      case Kind.tk_value_box:
      case Kind.tk_abstract_interface:
      case Kind.tk_local_interface:
      case Kind.tk_component:
      case Kind.tk_home:
      case Kind.tk_event:
        return [...basic_methods, "id", "name"];

      case Kind.tk_struct:
      case Kind.tk_union:
      case Kind.tk_enum:
      case Kind.tk_except:
      case Kind.tk_value:
        return [...basic_methods, "id", "name", "member_count", "member_name", "member_type"];

      case Kind.tk_string:
      case Kind.tk_wstring:
        return [...basic_methods, "length"];

      case Kind.tk_sequence:
      case Kind.tk_array:
        return [...basic_methods, "content_type", "length"];

      case Kind.tk_alias:
        return [...basic_methods, "id", "name", "content_type"];

      default:
        return basic_methods;
    }
  }

  /**
   * Create a TypeCode for a struct
   */
  export function create_struct_tc(
    id: string,
    name: string,
    members: Array<{ name: string; type: TypeCode }>,
  ): TypeCode {
    const tc = new TypeCode(Kind.tk_struct);
    tc.set_param("id", id);
    tc.set_param("name", name);
    tc.set_param("members", members);
    return tc;
  }

  /**
   * Create a TypeCode for a sequence
   */
  export function create_sequence_tc(bound: number, element_type: TypeCode): TypeCode {
    const tc = new TypeCode(Kind.tk_sequence);
    tc.set_param("length", bound);
    tc.set_param("content_type", element_type);
    return tc;
  }

  /**
   * Create a TypeCode for a string
   */
  export function create_string_tc(bound: number): TypeCode {
    const tc = new TypeCode(Kind.tk_string);
    tc.set_param("length", bound);
    return tc;
  }

  /**
   * Create a TypeCode for an object reference
   */
  export function create_interface_tc(id: string, name: string): TypeCode {
    const tc = new TypeCode(Kind.tk_objref);
    tc.set_param("id", id);
    tc.set_param("name", name);
    return tc;
  }
}
