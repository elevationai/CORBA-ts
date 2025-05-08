/**
 * IDL to TypeScript Mapping
 * Based on CORBA 3.4 specification
 */

import { CORBA } from "./types.ts";
import { TypeCode } from "./typecode.ts";
import { ObjectReference } from "./object.ts";
import { ValueBase } from "./valuetype.ts";

/**
 * IDL Type Mapping to TypeScript
 */
export namespace IDL {
  /**
   * IDL Parser interface
   */
  export interface Parser {
    /**
     * Parse an IDL string
     */
    parse(idl: string): Module[];
    
    /**
     * Generate TypeScript code from parsed IDL
     */
    generate_typescript(modules: Module[]): string;
  }
  
  /**
   * Module definition
   */
  export interface Module {
    name: string;
    definitions: Definition[];
    nested_modules: Module[];
  }
  
  /**
   * Base interface for all IDL definitions
   * The type property represents the kind of definition
   */
  export interface Definition {
    name: string;
    type: DefinitionType;
  }
  
  /**
   * Definition type enum
   */
  export enum DefinitionType {
    INTERFACE,
    STRUCT,
    UNION,
    ENUM,
    EXCEPTION,
    TYPEDEF,
    CONSTANT,
    ATTRIBUTE,
    OPERATION,
    VALUETYPE,
    VALUEBOX,
    ABSTRACT_INTERFACE,
    LOCAL_INTERFACE
  }
  
  /**
   * Type specification
   */
  export interface TypeSpecification {
    kind: TypeKind;
    name?: string;
    typecode?: TypeCode;
    element_type?: TypeSpecification;
    length?: number;
    members?: MemberDefinition[];
    repository_id?: string;
  }
  
  /**
   * Interface definition
   */
  export interface InterfaceDefinition extends Definition {
    base_interfaces: string[];
    operations: OperationDefinition[];
    attributes: AttributeDefinition[];
    repository_id: string;
  }
  
  /**
   * Operation definition
   */
  export interface OperationDefinition {
    name: string;
    return_type: TypeSpecification;
    parameters: ParameterDefinition[];
    exceptions: string[];
    oneway: boolean;
  }
  
  /**
   * Parameter definition
   */
  export interface ParameterDefinition {
    name: string;
    type: TypeSpecification;
    direction: ParameterDirection;
  }
  
  /**
   * Parameter direction enum
   */
  export enum ParameterDirection {
    IN,
    OUT,
    INOUT
  }
  
  /**
   * Attribute definition
   * This no longer extends Definition to avoid type conflicts
   */
  export interface AttributeDefinition {
    name: string;
    type: TypeSpecification;
    readonly: boolean;
  }
  
  /**
   * Struct definition
   */
  export interface StructDefinition extends Definition {
    members: MemberDefinition[];
    repository_id: string;
  }
  
  /**
   * Member definition
   */
  export interface MemberDefinition {
    name: string;
    type: TypeSpecification;
  }
  
  /**
   * Union definition
   */
  export interface UnionDefinition extends Definition {
    discriminator_type: TypeSpecification;
    cases: UnionCaseDefinition[];
    default_case: MemberDefinition | null;
    repository_id: string;
  }
  
  /**
   * Union case definition
   */
  export interface UnionCaseDefinition {
    labels: any[];
    member: MemberDefinition;
  }
  
  /**
   * Enum definition
   */
  export interface EnumDefinition extends Definition {
    members: string[];
    repository_id: string;
  }
  
  /**
   * Exception definition
   */
  export interface ExceptionDefinition extends StructDefinition {
    // Exception is essentially a struct with a different type
  }
  
  /**
   * Typedef definition
   */
  export interface TypedefDefinition extends Definition {
    original_type: TypeSpecification;
    repository_id: string;
  }
  
  /**
   * Constant definition
   * This no longer extends Definition to avoid type conflicts
   */
  export interface ConstantDefinition {
    name: string;
    type: TypeSpecification;
    value: any;
    definitionType: DefinitionType; // Use this instead of 'type' to avoid conflicts
  }
  
  /**
   * ValueType definition
   */
  export interface ValueTypeDefinition extends Definition {
    base_values: string[];
    supported_interfaces: string[];
    is_abstract: boolean;
    is_custom: boolean;
    members: MemberDefinition[];
    operations: OperationDefinition[];
    repository_id: string;
  }
  
  /**
   * Type kind enum
   */
  export enum TypeKind {
    VOID,
    SHORT,
    LONG,
    LONG_LONG,
    UNSIGNED_SHORT,
    UNSIGNED_LONG,
    UNSIGNED_LONG_LONG,
    FLOAT,
    DOUBLE,
    LONG_DOUBLE,
    BOOLEAN,
    CHAR,
    WCHAR,
    OCTET,
    ANY,
    TYPECODE,
    STRING,
    WSTRING,
    FIXED,
    OBJECT,
    STRUCT,
    UNION,
    ENUM,
    SEQUENCE,
    ARRAY,
    EXCEPTION,
    VALUE,
    VALUE_BOX,
    ABSTRACT_INTERFACE,
    LOCAL_INTERFACE
  }
  
  /**
   * IDL to TypeScript type mapping
   */
  export class TypeMapping {
    /**
     * Map an IDL type to a TypeScript type
     */
    static mapType(type: TypeSpecification): string {
      switch (type.kind) {
        case TypeKind.VOID:
          return "void";
        case TypeKind.SHORT:
        case TypeKind.LONG:
        case TypeKind.LONG_LONG:
        case TypeKind.UNSIGNED_SHORT:
        case TypeKind.UNSIGNED_LONG:
        case TypeKind.UNSIGNED_LONG_LONG:
        case TypeKind.FLOAT:
        case TypeKind.DOUBLE:
        case TypeKind.LONG_DOUBLE:
          return "number";
        case TypeKind.BOOLEAN:
          return "boolean";
        case TypeKind.CHAR:
        case TypeKind.WCHAR:
        case TypeKind.STRING:
        case TypeKind.WSTRING:
          return "string";
        case TypeKind.OCTET:
          return "number";
        case TypeKind.ANY:
          return "any";
        case TypeKind.TYPECODE:
          return "TypeCode";
        case TypeKind.OBJECT:
          return "CORBA.ObjectRef";
        case TypeKind.STRUCT:
        case TypeKind.UNION:
        case TypeKind.ENUM:
        case TypeKind.EXCEPTION:
        case TypeKind.VALUE:
        case TypeKind.VALUE_BOX:
        case TypeKind.ABSTRACT_INTERFACE:
        case TypeKind.LOCAL_INTERFACE:
          return type.name || "any";
        case TypeKind.SEQUENCE:
          if (type.element_type) {
            const elemType = TypeMapping.mapType(type.element_type);
            return `${elemType}[]`;
          }
          return "any[]";
        case TypeKind.ARRAY:
          if (type.element_type) {
            const elemType = TypeMapping.mapType(type.element_type);
            return `${elemType}[]`;
          }
          return "any[]";
        case TypeKind.FIXED:
          return "bigint";
        default:
          return "any";
      }
    }
    
    /**
     * Generate TypeScript interface for an IDL interface
     */
    static generateInterface(iface: InterfaceDefinition): string {
      let code = `/**\n * Generated from IDL: ${iface.repository_id}\n */\n`;
      
      const extends_clause = iface.base_interfaces.length > 0
        ? ` extends ${iface.base_interfaces.join(", ")}`
        : "";
      
      code += `export interface ${iface.name}${extends_clause} {\n`;
      
      // Add attributes
      for (const attr of iface.attributes) {
        const readonly_modifier = attr.readonly ? "readonly " : "";
        const type = TypeMapping.mapType({ kind: TypeKind.ANY, name: attr.type.name });
        code += `  ${readonly_modifier}${attr.name}: ${type};\n`;
        
        // Generate getter if readonly
        if (attr.readonly) {
          code += `  get_${attr.name}(): Promise<${type}>;\n`;
        } else {
          // Generate getter and setter
          code += `  get_${attr.name}(): Promise<${type}>;\n`;
          code += `  set_${attr.name}(value: ${type}): Promise<void>;\n`;
        }
      }
      
      // Add operations
      for (const op of iface.operations) {
        const return_type = TypeMapping.mapType(op.return_type);
        const params = op.parameters.map(param => {
          const type = TypeMapping.mapType(param.type);
          return `${param.name}: ${type}`;
        }).join(", ");
        
        const return_promise = return_type === "void"
          ? "Promise<void>"
          : `Promise<${return_type}>`;
        
        code += `  ${op.name}(${params}): ${return_promise};\n`;
      }
      
      code += "}\n";
      return code;
    }
    
    /**
     * Generate TypeScript class for an IDL struct
     */
    static generateStruct(struct: StructDefinition): string {
      let code = `/**\n * Generated from IDL: ${struct.repository_id}\n */\n`;
      
      code += `export interface ${struct.name} {\n`;
      
      // Add members
      for (const member of struct.members) {
        const type = TypeMapping.mapType(member.type);
        code += `  ${member.name}: ${type};\n`;
      }
      
      code += "}\n";
      
      // Add constructor function
      code += `\nexport function create_${struct.name}(`;
      
      // Constructor parameters
      const params = struct.members.map(member => {
        const type = TypeMapping.mapType(member.type);
        return `${member.name}: ${type}`;
      }).join(", ");
      
      code += `${params}): ${struct.name} {\n`;
      code += `  return { ${struct.members.map(m => m.name).join(", ")} };\n`;
      code += "}\n";
      
      return code;
    }
    
    /**
     * Generate TypeScript class for an IDL exception
     */
    static generateException(exc: ExceptionDefinition): string {
      let code = `/**\n * Generated from IDL: ${exc.repository_id}\n */\n`;
      
      code += `export class ${exc.name} extends CORBA.SystemException {\n`;
      
      // Add members
      for (const member of exc.members) {
        const type = TypeMapping.mapType(member.type);
        code += `  ${member.name}: ${type};\n`;
      }
      
      // Add constructor
      code += `\n  constructor(`;
      
      // Constructor parameters
      const params = exc.members.map(member => {
        const type = TypeMapping.mapType(member.type);
        return `${member.name}: ${type}`;
      }).join(", ");
      
      code += `${params}) {\n`;
      code += `    super("${exc.name}");\n`;
      code += `    this.name = "${exc.name}";\n`;
      
      // Set member values
      for (const member of exc.members) {
        code += `    this.${member.name} = ${member.name};\n`;
      }
      
      code += "  }\n";
      code += "}\n";
      
      return code;
    }
    
    /**
     * Generate TypeScript enum for an IDL enum
     */
    static generateEnum(enum_def: EnumDefinition): string {
      let code = `/**\n * Generated from IDL: ${enum_def.repository_id}\n */\n`;
      
      code += `export enum ${enum_def.name} {\n`;
      
      // Add enum values
      for (let i = 0; i < enum_def.members.length; i++) {
        const member = enum_def.members[i];
        code += `  ${member} = ${i}${i < enum_def.members.length - 1 ? "," : ""}\n`;
      }
      
      code += "}\n";
      
      return code;
    }
  }
  
  /**
   * Simple IDL parser implementation
   */
  export class SimpleParser implements Parser {
    parse(idl: string): Module[] {
      // This is a placeholder
      // A real implementation would parse the IDL string into a syntax tree
      console.log("IDL parsing not implemented yet");
      return [];
    }
    
    generate_typescript(modules: Module[]): string {
      // This is a placeholder
      // A real implementation would generate TypeScript code from the syntax tree
      let code = "";
      for (const module of modules) {
        code += this.generate_module(module);
      }
      return code;
    }
    
    private generate_module(module: Module): string {
      let code = `export namespace ${module.name} {\n`;
      
      // Generate nested modules
      for (const nested of module.nested_modules) {
        code += this.generate_module(nested);
      }
      
      // Generate definitions
      for (const def of module.definitions) {
        switch (def.type) {
          case DefinitionType.INTERFACE:
            code += TypeMapping.generateInterface(def as InterfaceDefinition);
            break;
          case DefinitionType.STRUCT:
            code += TypeMapping.generateStruct(def as StructDefinition);
            break;
          case DefinitionType.EXCEPTION:
            code += TypeMapping.generateException(def as ExceptionDefinition);
            break;
          case DefinitionType.ENUM:
            code += TypeMapping.generateEnum(def as EnumDefinition);
            break;
          // Other definition types would be implemented in a complete implementation
        }
      }
      
      code += "}\n";
      return code;
    }
  }
}