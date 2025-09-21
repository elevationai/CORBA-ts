/**
 * SSLIOP Protocol Handler
 * Secure Socket Layer Inter-ORB Protocol implementation
 */

import { BaseProtocolHandler } from "../protocol.ts";
import { CorbalocAddress, CorbalocProtocol } from "../corbaloc.ts";
import { ComponentId, ProfileId, TaggedComponent, TaggedProfile } from "../types.ts";
import { IORUtil } from "../ior.ts";
import { CDROutputStream } from "../../core/cdr/index.ts";

/**
 * SSL security options
 */
export interface SSLSecurityOptions {
  /**
   * Security association options supported
   */
  supports?: number;

  /**
   * Security association options required
   */
  requires?: number;

  /**
   * SSL port (may differ from IIOP port)
   */
  port?: number;
}

/**
 * SSLIOP protocol handler
 */
export class SSLIOPProtocolHandler extends BaseProtocolHandler {
  constructor(
    private sslOptions: SSLSecurityOptions = {
      supports: 0x0001, // Default: supports integrity
      requires: 0x0001, // Default: requires integrity
    }
  ) {
    super(CorbalocProtocol.SSLIOP, 2810);
  }

  validateAddress(address: CorbalocAddress): void {
    if (address.protocol !== CorbalocProtocol.SSLIOP) {
      throw new Error(`Invalid protocol for SSLIOP handler: ${address.protocol}`);
    }

    if (!address.host) {
      throw new Error("SSLIOP address requires a host");
    }

    if (address.port && (address.port < 1 || address.port > 65535)) {
      throw new Error(`Invalid port number: ${address.port}`);
    }

    if (address.version) {
      const { major, minor } = address.version;
      if (major !== 1 || minor < 0 || minor > 3) {
        throw new Error(`Unsupported SSLIOP version: ${major}.${minor}`);
      }
    }
  }

  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
    this.validateAddress(address);

    const port = address.port || this.defaultPort!;

    // Create SSL component
    const sslComponent = this.createSSLComponent(port);

    // Create IIOP profile with SSL component
    return IORUtil.createIIOPProfile({
      iiop_version: address.version || { major: 1, minor: 2 },
      host: address.host!,
      port: port,
      object_key: objectKey,
      components: [sslComponent],
    });
  }

  private createSSLComponent(port: number): TaggedComponent {
    const cdr = new CDROutputStream();

    // SSL component structure
    cdr.writeUShort(this.sslOptions.supports || 0x0001);
    cdr.writeUShort(this.sslOptions.requires || 0x0001);
    cdr.writeUShort(this.sslOptions.port || port);

    return {
      componentId: ComponentId.TAG_SSL_SEC_TRANS,
      componentData: cdr.getBuffer(),
    };
  }

  override parseProfile(profile: TaggedProfile): CorbalocAddress | null {
    if (profile.profileId !== ProfileId.TAG_INTERNET_IOP) {
      return null;
    }

    const iiop = IORUtil.parseIIOPProfile(profile);
    if (!iiop) {
      return null;
    }

    // Check for SSL component
    const hasSSL = iiop.components.some(
      comp => comp.componentId === ComponentId.TAG_SSL_SEC_TRANS
    );

    if (!hasSSL) {
      return null; // Not an SSLIOP profile
    }

    return {
      protocol: CorbalocProtocol.SSLIOP,
      version: iiop.iiop_version,
      host: iiop.host,
      port: iiop.port,
    };
  }

  override canHandleProfile(profile: TaggedProfile): boolean {
    if (profile.profileId !== ProfileId.TAG_INTERNET_IOP) {
      return false;
    }

    const iiop = IORUtil.parseIIOPProfile(profile);
    if (!iiop) {
      return false;
    }

    // Check for SSL component
    return iiop.components.some(
      comp => comp.componentId === ComponentId.TAG_SSL_SEC_TRANS
    );
  }

  /**
   * Update SSL security options
   */
  setSecurityOptions(options: SSLSecurityOptions): void {
    this.sslOptions = { ...this.sslOptions, ...options };
  }
}