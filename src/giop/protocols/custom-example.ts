/**
 * Example Custom Protocol Handler
 * Demonstrates how to implement a custom protocol for corbaloc URLs
 *
 * This example implements a hypothetical "uds" (Unix Domain Socket) protocol
 * Format: corbaloc:uds:/path/to/socket/ObjectKey
 */

import { BaseProtocolHandler, ProtocolRegistry } from "../protocol.ts";
import { CorbalocAddress } from "../corbaloc.ts";
import { TaggedProfile } from "../types.ts";
import { CDROutputStream } from "../../core/cdr/index.ts";

/**
 * Custom profile ID for UDS protocol
 * In practice, this would be registered with the OMG
 */
const TAG_UDS_PROFILE = 0x55445300; // "UDS\0" in hex

/**
 * Unix Domain Socket protocol handler example
 */
export class UDSProtocolHandler extends BaseProtocolHandler {
  constructor() {
    super("uds");
    // No default port for UDS as it uses file paths
  }

  validateAddress(address: CorbalocAddress): void {
    if (address.protocol !== "uds") {
      throw new Error(`Invalid protocol for UDS handler: ${address.protocol}`);
    }

    // UDS uses the "host" field to store the socket path
    if (!address.host) {
      throw new Error("UDS address requires a socket path in the host field");
    }

    // UDS should not have a port
    if (address.port) {
      throw new Error("UDS protocol does not use ports");
    }

    // Version is not applicable to UDS
    if (address.version) {
      throw new Error("UDS protocol does not support version specification");
    }

    // Validate that the path looks reasonable
    if (!address.host.startsWith("/")) {
      throw new Error("UDS socket path must be absolute (start with /)");
    }
  }

  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
    this.validateAddress(address);

    const cdr = new CDROutputStream();

    // Encode the UDS profile data
    // Format: [socket_path_length][socket_path][object_key_length][object_key]
    const socketPath = address.host!;
    const pathBytes = new TextEncoder().encode(socketPath);

    cdr.writeULong(pathBytes.length);
    cdr.writeOctetArray(pathBytes);
    cdr.writeULong(objectKey.length);
    cdr.writeOctetArray(objectKey);

    return {
      profileId: TAG_UDS_PROFILE,
      profileData: cdr.getBuffer(),
    };
  }

  override parseProfile(profile: TaggedProfile): CorbalocAddress | null {
    if (profile.profileId !== TAG_UDS_PROFILE) {
      return null;
    }

    // Parse the UDS profile data
    // Would need CDRInputStream here, simplified for example
    try {
      // Extract socket path from profile data
      // This is simplified - real implementation would use CDRInputStream
      const view = new DataView(profile.profileData.buffer);
      const pathLength = view.getUint32(0, false); // big-endian

      if (pathLength > 0 && pathLength < profile.profileData.length) {
        const pathBytes = profile.profileData.slice(4, 4 + pathLength);
        const socketPath = new TextDecoder().decode(pathBytes);

        return {
          protocol: "uds",
          host: socketPath, // Store path in host field
        };
      }
    }
    catch {
      // Invalid profile data
    }

    return null;
  }

  override canHandleProfile(profile: TaggedProfile): boolean {
    return profile.profileId === TAG_UDS_PROFILE;
  }
}

/**
 * Example: VMC (Virtual Machine Communication) Protocol
 * For communication between VMs on the same hypervisor
 */
export class VMCProtocolHandler extends BaseProtocolHandler {
  constructor() {
    super("vmc", 9999); // Default port for VMC
  }

  validateAddress(address: CorbalocAddress): void {
    if (address.protocol !== "vmc") {
      throw new Error(`Invalid protocol for VMC handler: ${address.protocol}`);
    }

    // VMC requires a VM identifier as the host
    if (!address.host) {
      throw new Error("VMC address requires a VM identifier");
    }

    // Validate VM identifier format (UUID or name)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const nameRegex = /^[a-zA-Z][a-zA-Z0-9-_]{0,63}$/;

    if (!uuidRegex.test(address.host) && !nameRegex.test(address.host)) {
      throw new Error("VMC host must be a valid UUID or VM name");
    }
  }

  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
    this.validateAddress(address);

    const cdr = new CDROutputStream();

    // VMC profile format
    cdr.writeString(address.host!); // VM identifier
    cdr.writeUShort(address.port || this.defaultPort!);
    cdr.writeULong(objectKey.length);
    cdr.writeOctetArray(objectKey);

    // Add VMC-specific metadata
    cdr.writeString("hypervisor-v1"); // Hypervisor version
    cdr.writeULong(Date.now()); // Timestamp

    return {
      profileId: 0x564D4300, // "VMC\0"
      profileData: cdr.getBuffer(),
    };
  }
}

/**
 * Example: How to register custom protocols
 */
export function registerCustomProtocols(): void {
  // Register UDS protocol
  const udsHandler = new UDSProtocolHandler();
  ProtocolRegistry.register(udsHandler);

  // Register VMC protocol
  const vmcHandler = new VMCProtocolHandler();
  ProtocolRegistry.register(vmcHandler);
}

/**
 * Example usage:
 *
 * // Register custom protocols
 * registerCustomProtocols();
 *
 * // Now these URLs would work:
 * // corbaloc:uds:/var/run/myapp.sock/MyService
 * // corbaloc:vmc:vm-12345:9999/RemoteObject
 * // corbaloc:vmc:550e8400-e29b-41d4-a716-446655440000/Service
 */
