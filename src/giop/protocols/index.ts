/**
 * Standard CORBA Protocol Handlers
 */

import { ProtocolRegistry } from "../protocol.ts";
import { IIOPProtocolHandler } from "./iiop.ts";
import { SSLIOPProtocolHandler } from "./ssliop.ts";
import { RIRProtocolHandler } from "./rir.ts";

// Export individual handlers
export { IIOPProtocolHandler } from "./iiop.ts";
export { SSLIOPProtocolHandler, type SSLSecurityOptions } from "./ssliop.ts";
export { RIRProtocolHandler } from "./rir.ts";

// Export registry
export { ProtocolRegistry } from "../protocol.ts";

/**
 * Initialize standard protocol handlers
 */
export function initializeStandardProtocols(): void {
  // Clear any existing handlers
  ProtocolRegistry.clear();

  // Register standard protocols
  ProtocolRegistry.register(new IIOPProtocolHandler());
  ProtocolRegistry.register(new SSLIOPProtocolHandler());
  ProtocolRegistry.register(new RIRProtocolHandler());
}

/**
 * Check if standard protocols are initialized
 */
export function areStandardProtocolsInitialized(): boolean {
  return ProtocolRegistry.isSupported("iiop") &&
         ProtocolRegistry.isSupported("ssliop") &&
         ProtocolRegistry.isSupported("rir");
}

// Auto-initialize on module load
initializeStandardProtocols();