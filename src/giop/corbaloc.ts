/**
 * CORBA corbaloc URL Parser
 * Implements full corbaloc URL specification
 *
 * Format: corbaloc:[<protocol>]:[<version>@]<host>[:<port>][,<addr>...][/<object_key>]
 *
 * Examples:
 * - corbaloc:iiop:1.2@host.example.com:2809/NameService
 * - corbaloc::host.example.com/MyObject
 * - corbaloc:iiop:server1:2809,iiop:server2:2810/LoadBalanced
 * - corbaloc:rir:/NameService
 * - corbaloc:ssliop:secure.example.com:2810/SecureObject
 */

import { GIOPVersion } from "./types.ts";

/**
 * Supported corbaloc protocols
 */
export enum CorbalocProtocol {
  IIOP = "iiop",
  RIR = "rir",
  SSLIOP = "ssliop",
}

/**
 * A single address in a corbaloc URL
 */
export interface CorbalocAddress {
  protocol: CorbalocProtocol;
  version?: GIOPVersion;
  host?: string;
  port?: number;
}

/**
 * Parsed corbaloc URL components
 */
export interface CorbalocURL {
  addresses: CorbalocAddress[];
  objectKey: string;
  rawObjectKey: Uint8Array;
}

/**
 * Corbaloc parsing errors
 */
export class CorbalocParseError extends Error {
  constructor(message: string, public readonly url: string, public readonly position?: number) {
    super(`Invalid corbaloc URL: ${message} in "${url}"${position ? ` at position ${position}` : ""}`);
    this.name = "CorbalocParseError";
  }
}

/**
 * Parse a corbaloc URL into its components
 */
export function parseCorbaloc(url: string): CorbalocURL {
  if (!url.startsWith("corbaloc:")) {
    throw new CorbalocParseError("URL must start with 'corbaloc:'", url);
  }

  const content = url.substring(9); // Remove "corbaloc:"

  // Split into address part and object key
  const slashIndex = content.indexOf("/");
  const addressPart = slashIndex === -1 ? content : content.substring(0, slashIndex);
  const objectKeyPart = slashIndex === -1 ? "" : content.substring(slashIndex + 1);

  // Handle RIR protocol special case (no addresses)
  if (addressPart === "rir:") {
    return {
      addresses: [{ protocol: CorbalocProtocol.RIR }],
      objectKey: objectKeyPart,
      rawObjectKey: encodeObjectKey(objectKeyPart),
    };
  }

  // Parse addresses (comma-separated)
  const addresses = parseAddresses(addressPart);

  if (addresses.length === 0) {
    throw new CorbalocParseError("No valid addresses found", url);
  }

  return {
    addresses,
    objectKey: objectKeyPart,
    rawObjectKey: encodeObjectKey(objectKeyPart),
  };
}

/**
 * Parse comma-separated addresses
 */
function parseAddresses(addressPart: string): CorbalocAddress[] {
  const addresses: CorbalocAddress[] = [];
  const parts = splitAddresses(addressPart);

  for (const part of parts) {
    const address = parseAddress(part);
    if (address) {
      addresses.push(address);
    }
  }

  return addresses;
}

/**
 * Split addresses handling IPv6 brackets correctly
 */
function splitAddresses(addressPart: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inBrackets = 0;

  for (const char of addressPart) {
    if (char === "[") {
      inBrackets++;
    } else if (char === "]") {
      inBrackets--;
    } else if (char === "," && inBrackets === 0) {
      if (current) {
        parts.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Parse a single address component
 */
function parseAddress(part: string): CorbalocAddress | null {
  // Try to match protocol:version@host:port format
  // Also handle implicit protocol and optional components

  let protocol: CorbalocProtocol = CorbalocProtocol.IIOP; // Default
  let version: GIOPVersion | undefined;
  let host: string | undefined;
  let port: number | undefined;

  // Check for explicit protocol
  const protocolMatch = part.match(/^(iiop|rir|ssliop):/i);
  if (protocolMatch) {
    protocol = protocolMatch[1].toLowerCase() as CorbalocProtocol;
    part = part.substring(protocolMatch[0].length);
  } else if (part.startsWith(":")) {
    // Implicit IIOP protocol
    part = part.substring(1);
  }

  // Handle RIR protocol (no host/port)
  if (protocol === CorbalocProtocol.RIR) {
    return { protocol };
  }

  // Check for version
  const versionMatch = part.match(/^(\d+)\.(\d+)@/);
  if (versionMatch) {
    version = {
      major: parseInt(versionMatch[1]),
      minor: parseInt(versionMatch[2]),
    };
    part = part.substring(versionMatch[0].length);
  }

  // Parse host and port
  if (part.startsWith("[")) {
    // IPv6 address
    const endBracket = part.indexOf("]");
    if (endBracket === -1) {
      throw new CorbalocParseError("Unclosed IPv6 address bracket", part);
    }

    host = part.substring(1, endBracket);
    part = part.substring(endBracket + 1);

    if (part.startsWith(":")) {
      port = parseInt(part.substring(1));
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new CorbalocParseError("Invalid port number", part);
      }
    }
  } else {
    // IPv4 or hostname
    const colonIndex = part.lastIndexOf(":");
    if (colonIndex === -1) {
      host = part;
    } else {
      host = part.substring(0, colonIndex);
      const portStr = part.substring(colonIndex + 1);
      port = parseInt(portStr);
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new CorbalocParseError("Invalid port number", portStr);
      }
    }
  }

  if (!host) {
    throw new CorbalocParseError("Missing host", part);
  }

  // Apply defaults
  if (!version) {
    version = { major: 1, minor: 2 }; // Default GIOP version
  }

  if (!port) {
    port = protocol === CorbalocProtocol.SSLIOP ? 2810 : 2809; // Default ports
  }

  return { protocol, version, host, port };
}

/**
 * Encode object key with proper CORBA escaping
 */
function encodeObjectKey(key: string): Uint8Array {
  if (!key) {
    return new Uint8Array(0);
  }

  // Decode URI encoding and handle CORBA-specific escaping
  const decoded = decodeCorbalocString(key);
  return new TextEncoder().encode(decoded);
}

/**
 * Decode corbaloc string with CORBA-specific rules
 */
function decodeCorbalocString(str: string): string {
  // Handle percent encoding
  let result = "";
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "%" && i + 2 < str.length) {
      const hex = str.substring(i + 1, i + 3);
      const code = parseInt(hex, 16);
      if (!isNaN(code)) {
        result += String.fromCharCode(code);
        i += 2;
        continue;
      }
    }
    result += str[i];
  }
  return result;
}

/**
 * Validate a corbaloc URL
 */
export function validateCorbaloc(url: string): { valid: boolean; error?: string } {
  try {
    parseCorbaloc(url);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Build a corbaloc URL from components
 */
export function buildCorbaloc(url: CorbalocURL): string {
  let result = "corbaloc:";

  // Build addresses
  const addressStrings = url.addresses.map(addr => {
    if (addr.protocol === CorbalocProtocol.RIR) {
      return "rir:";
    }

    let addrStr = "";

    // Protocol (can be omitted for IIOP)
    if (addr.protocol !== CorbalocProtocol.IIOP) {
      addrStr += addr.protocol + ":";
    } else {
      addrStr += ":"; // Implicit IIOP
    }

    // Version
    if (addr.version && (addr.version.major !== 1 || addr.version.minor !== 2)) {
      addrStr += `${addr.version.major}.${addr.version.minor}@`;
    }

    // Host (with IPv6 brackets if needed)
    if (addr.host) {
      if (addr.host.includes(":")) {
        addrStr += `[${addr.host}]`;
      } else {
        addrStr += addr.host;
      }
    }

    // Port (omit if default)
    if (addr.port) {
      const defaultPort = addr.protocol === CorbalocProtocol.SSLIOP ? 2810 : 2809;
      if (addr.port !== defaultPort) {
        addrStr += `:${addr.port}`;
      }
    }

    return addrStr;
  });

  result += addressStrings.join(",");

  // Object key
  if (url.objectKey) {
    result += "/" + encodeCorbalocString(url.objectKey);
  }

  return result;
}

/**
 * Encode string for corbaloc URL
 */
function encodeCorbalocString(str: string): string {
  let result = "";
  for (const char of str) {
    // Encode special characters
    if (char === "/" || char === "," || char === ":" || char === "@" || char === "%") {
      result += "%" + char.charCodeAt(0).toString(16).padStart(2, "0").toUpperCase();
    } else {
      result += char;
    }
  }
  return result;
}