/**
 * CDR (Common Data Representation) Module
 * Exports CDR encoder/decoder and type definitions
 */

export { CDROutputStream } from "./encoder.ts";
export { CDRInputStream } from "./decoder.ts";

// Re-export for convenience
export type { TCKind } from "./typecode.ts";
export { decodeTypeCode, encodeTypeCode } from "./typecode.ts";
export { decodeAny, encodeAny } from "./any.ts";
