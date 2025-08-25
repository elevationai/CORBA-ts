/**
 * CORBA.ts - A TypeScript implementation of CORBA for Deno
 * Based on CORBA 3.4 specification
 */

// Export core CORBA types
export * from "./types.ts";

// Export ORB interfaces and functions
export * from "./orb.ts";

// Export object interfaces
export * from "./object.ts";

// Export TypeCode
export * from "./typecode.ts";

// Export Policy interfaces
export * from "./policy.ts";

// Export Context
export * from "./context.ts";

// Export ValueType interfaces
export * from "./valuetype.ts";

// Export POA
export * from "./poa.ts";

// Export GIOP/IIOP
export * from "./giop.ts";

// Export DII
export * from "./dii.ts";

// Export Naming Service
export * from "./naming.ts";

// Main initialization function
import { init as initORB } from "./orb.ts";
import { initPOA } from "./poa.ts";
import { init_naming_service } from "./naming.ts";

/**
 * Initialize the CORBA runtime
 */
export async function init(args: string[] = []): Promise<void> {
  // Initialize ORB
  const orb = initORB({ args });
  await orb.init();

  // Initialize POA
  initPOA();

  // Initialize Naming Service
  await init_naming_service();
}
