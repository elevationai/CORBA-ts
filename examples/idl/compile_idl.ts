/**
 * IDL to TypeScript Compiler Example
 */

import { IDL } from "../../mod.ts";

// Read an IDL file
const idlContent = await Deno.readTextFile("./hello.idl");

// Create an IDL parser
const parser = new IDL.SimpleParser();

// Parse the IDL
const modules = parser.parse(idlContent);

// Generate TypeScript code
const tsCode = parser.generate_typescript(modules);

// Write the TypeScript code to a file
await Deno.writeTextFile("./hello.ts", tsCode);

console.log("Generated TypeScript code:");
console.log(tsCode);