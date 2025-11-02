/**
 * CORBA.ts - A TypeScript implementation of CORBA for Deno
 * Based on CORBA 3.4 specification
 */

// Export core CORBA types
export * from "./types.ts";

// Export ORB interfaces and functions
export * from "./orb.ts";

// Export object interfaces and narrow support
export * from "./object.ts";

// Export stub base class
export * from "./stub.ts";

// Export TypeCode
export * from "./typecode.ts";

// Export Any class and related functions
export { Any, decodeAny, encodeAny } from "./core/cdr/any.ts";

// Export CDR streams for skeleton marshaling
export { CDRInputStream } from "./core/cdr/decoder.ts";
export { CDROutputStream } from "./core/cdr/encoder.ts";

// Export Policy interfaces
export * from "./policy.ts";

// Export Context
export * from "./context.ts";

// Export ValueType interfaces
export * from "./valuetype.ts";

// Export Exceptions
export * from "./core/exceptions/system.ts";

// Export POA (including ResponseHandler for skeletons)
export * from "./poa.ts";
export { setWireLogger } from "./poa.ts";

// Export GIOP/IIOP
export * from "./giop.ts";
export type { CorbaLogger } from "./giop/connection.ts";

// Export DII
export * from "./dii.ts";

// Export Naming Service
export * from "./naming.ts";
export { NameBuilder, NamingClient, NamingUtils } from "./naming_client.ts";
export type { NamingClientConfig } from "./naming_client.ts";
export { DEFAULT_CONFIG as DEFAULT_NAMING_SERVER_CONFIG, NamingServer, NamingServerCLI } from "./naming_server.ts";
export type { NamingServerConfig } from "./naming_server.ts";

// Export Proxy functionality
export * from "./proxy.ts";

// Export EventHandler
export { createEventHandler, type EventCallback, EventHandler, type EventListener } from "./event_handler.ts";

// Main initialization function
import { init as initORB } from "./orb.ts";
import { initPOA } from "./poa.ts";
import { init_naming_service } from "./naming.ts";

/**
 * Initialize the CORBA runtime
 */
export async function init(args: string[] = []): Promise<void> {
  // Initialize ORB (now returns Promise<ORB> and already calls init internally)
  await initORB({ args });

  // Initialize POA
  initPOA();

  // Initialize Naming Service
  await init_naming_service();
}
