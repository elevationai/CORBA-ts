/**
 * IIOP Protocol Handler
 * Internet Inter-ORB Protocol implementation
 */

import { BaseProtocolHandler } from "../protocol.ts";
import { CorbalocAddress, CorbalocProtocol } from "../corbaloc.ts";
import { ProfileId, TaggedProfile } from "../types.ts";
import { IORUtil } from "../ior.ts";

/**
 * IIOP protocol handler
 */
export class IIOPProtocolHandler extends BaseProtocolHandler {
  constructor() {
    super(CorbalocProtocol.IIOP, 2809);
  }

  validateAddress(address: CorbalocAddress): void {
    if (address.protocol !== CorbalocProtocol.IIOP) {
      throw new Error(`Invalid protocol for IIOP handler: ${address.protocol}`);
    }

    if (!address.host) {
      throw new Error("IIOP address requires a host");
    }

    if (address.port && (address.port < 1 || address.port > 65535)) {
      throw new Error(`Invalid port number: ${address.port}`);
    }

    if (address.version) {
      const { major, minor } = address.version;
      if (major !== 1 || minor < 0 || minor > 3) {
        throw new Error(`Unsupported IIOP version: ${major}.${minor}`);
      }
    }
  }

  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
    this.validateAddress(address);

    return IORUtil.createIIOPProfile({
      iiop_version: address.version || { major: 1, minor: 2 },
      host: address.host!,
      port: address.port || this.defaultPort!,
      object_key: objectKey,
      components: [],
    });
  }

  override parseProfile(profile: TaggedProfile): CorbalocAddress | null {
    if (profile.profileId !== ProfileId.TAG_INTERNET_IOP) {
      return null;
    }

    const iiop = IORUtil.parseIIOPProfile(profile);
    if (!iiop) {
      return null;
    }

    return {
      protocol: CorbalocProtocol.IIOP,
      version: iiop.iiop_version,
      host: iiop.host,
      port: iiop.port,
    };
  }

  override canHandleProfile(profile: TaggedProfile): boolean {
    return profile.profileId === ProfileId.TAG_INTERNET_IOP;
  }
}
