/**
 * Corbaloc to IOR conversion using protocol handlers
 */

import { IOR, TaggedProfile } from "./types.ts";
import { CorbalocAddress, parseCorbaloc as parseCorbalocURL } from "./corbaloc.ts";
import { ProtocolRegistry } from "./protocol.ts";
import { areStandardProtocolsInitialized, initializeStandardProtocols } from "./protocols/index.ts";

/**
 * Convert a corbaloc URL to an IOR using registered protocol handlers
 */
export function corbalocToIOR(url: string): IOR {
  // Ensure standard protocols are initialized
  if (!areStandardProtocolsInitialized()) {
    initializeStandardProtocols();
  }

  // Parse the corbaloc URL
  const parsed = parseCorbalocURL(url);

  // Create profiles using protocol handlers
  const profiles: TaggedProfile[] = [];

  for (const address of parsed.addresses) {
    const protocolName = typeof address.protocol === "string" ? address.protocol : address.protocol;

    const handler = ProtocolRegistry.get(protocolName);

    if (!handler) {
      throw new Error(`No protocol handler registered for '${protocolName}'`);
    }

    // Validate the address
    handler.validateAddress(address);

    // Create the profile
    const profile = handler.createProfile(address, parsed.rawObjectKey);
    profiles.push(profile);
  }

  if (profiles.length === 0) {
    throw new Error("No valid profiles created from corbaloc URL");
  }

  // Derive type ID - use standard CORBA Object if not specified
  const typeId = "IDL:omg.org/CORBA/Object:1.0";

  return {
    typeId,
    profiles,
  };
}

/**
 * Convert an IOR to corbaloc URLs using registered protocol handlers
 * Returns multiple URLs if the IOR has multiple profiles
 */
export function iorToCorbaloc(ior: IOR): string[] {
  const urls: string[] = [];

  for (const profile of ior.profiles) {
    const handler = ProtocolRegistry.findHandlerForProfile(profile);

    if (handler && handler.parseProfile) {
      const address = handler.parseProfile(profile);

      if (address) {
        // Build corbaloc URL from address
        // Note: This is simplified - would need proper URL building
        const corbalocStr = buildSimpleCorbaloc(address);
        if (corbalocStr) {
          urls.push(corbalocStr);
        }
      }
    }
  }

  return urls;
}

/**
 * Build a simple corbaloc string from an address
 */
function buildSimpleCorbaloc(address: CorbalocAddress): string {
  const protocol = address.protocol;

  if (protocol === "rir") {
    return `corbaloc:rir:/`;
  }

  let result = `corbaloc:${protocol}:`;

  if (address.version && (address.version.major !== 1 || address.version.minor !== 2)) {
    result += `${address.version.major}.${address.version.minor}@`;
  }

  if (address.host) {
    if (address.host.includes(":")) {
      result += `[${address.host}]`;
    }
    else {
      result += address.host;
    }
  }

  if (address.port) {
    result += `:${address.port}`;
  }

  return result;
}
