/**
 * CORBA.ts Core Module
 * Exports CDR encoding, network layer, and system exceptions
 */

// CDR (Common Data Representation)
export * from "./cdr/index.ts";
export { CDROutputStream } from "./cdr/encoder.ts";
export { CDRInputStream } from "./cdr/decoder.ts";

// Network layer
export { IIOPConnection, IIOPListener } from "./network/iiop-connection.ts";

// System exceptions
export * from "./exceptions/system.ts";
