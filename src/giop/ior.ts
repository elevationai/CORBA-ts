/**
 * IOR (Interoperable Object Reference) Implementation
 * CORBA 3.4 Specification compliant
 */

import { CDRInputStream, CDROutputStream } from "../core/cdr/index.ts";
import {
  ComponentId,
  GIOPVersion,
  IIOPProfileBody,
  IOR,
  ProfileId,
  TaggedComponent,
  TaggedProfile,
} from "./types.ts";

/**
 * IOR utilities and operations
 */
export class IORUtil {
  /**
   * Convert IOR to string representation (corbaloc or IOR:)
   */
  static toString(ior: IOR): string {
    const cdr = new CDROutputStream();
    this.encodeIOR(cdr, ior);
    const buffer = cdr.getBuffer();

    // Convert to hex string
    let hex = "IOR:";
    for (const byte of buffer) {
      hex += byte.toString(16).padStart(2, "0");
    }
    return hex;
  }

  /**
   * Parse IOR from string representation
   */
  static fromString(iorString: string): IOR {
    if (iorString.startsWith("IOR:")) {
      return this.parseHexIOR(iorString.substring(4));
    } else if (iorString.startsWith("corbaloc:")) {
      return this.parseCorbaloc(iorString.substring(9));
    } else {
      throw new Error("Invalid IOR string format");
    }
  }

  /**
   * Parse hexadecimal IOR string
   */
  private static parseHexIOR(hexString: string): IOR {
    // Convert hex to bytes
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }

    const cdr = new CDRInputStream(bytes);
    return this.decodeIOR(cdr);
  }

  /**
   * Parse corbaloc URL
   * Format: corbaloc:[iiop]:[version@]host[:port][/object_key]
   */
  private static parseCorbaloc(url: string): IOR {
    // Simple corbaloc parser (IIOP only)
    const parts = url.match(/^(?:iiop:)?(?:(\d+\.\d+)@)?([^:/]+)(?::(\d+))?(?:\/(.*))?$/);

    if (!parts) {
      throw new Error("Invalid corbaloc URL");
    }

    const [, version, host, portStr, keyStr] = parts;

    // Parse version
    const iiop_version: GIOPVersion = version
      ? { major: parseInt(version[0]), minor: parseInt(version[2]) }
      : { major: 1, minor: 2 };

    // Parse port
    const port = portStr ? parseInt(portStr) : 2809; // Default IIOP port

    // Parse object key
    const object_key = keyStr
      ? new TextEncoder().encode(decodeURIComponent(keyStr))
      : new Uint8Array(0);

    // Create IIOP profile
    const profile = this.createIIOPProfile({
      iiop_version,
      host,
      port,
      object_key,
      components: [],
    });

    return {
      typeId: "",
      profiles: [profile],
    };
  }

  /**
   * Encode IOR to CDR
   */
  static encodeIOR(cdr: CDROutputStream, ior: IOR): void {
    // Type ID
    cdr.writeString(ior.typeId);

    // Profile count
    cdr.writeULong(ior.profiles.length);

    // Profiles
    for (const profile of ior.profiles) {
      cdr.writeULong(profile.profileId);
      cdr.writeULong(profile.profileData.length);
      cdr.writeOctetArray(profile.profileData);
    }
  }

  /**
   * Decode IOR from CDR
   */
  static decodeIOR(cdr: CDRInputStream): IOR {
    // Type ID
    const typeId = cdr.readString();

    // Profile count
    const profileCount = cdr.readULong();

    // Profiles
    const profiles: TaggedProfile[] = [];
    for (let i = 0; i < profileCount; i++) {
      const profileId = cdr.readULong();
      const length = cdr.readULong();
      const profileData = cdr.readOctetArray(length);
      profiles.push({ profileId, profileData });
    }

    return { typeId, profiles };
  }

  /**
   * Create an IIOP profile
   */
  static createIIOPProfile(body: IIOPProfileBody): TaggedProfile {
    const cdr = new CDROutputStream();

    // Encode profile body
    // Version
    cdr.writeOctet(body.iiop_version.major);
    cdr.writeOctet(body.iiop_version.minor);

    // Host
    cdr.writeString(body.host);

    // Port
    cdr.writeUShort(body.port);

    // Object key
    cdr.writeULong(body.object_key.length);
    cdr.writeOctetArray(body.object_key);

    // Components (GIOP 1.1+)
    if (body.iiop_version.minor >= 1) {
      cdr.writeULong(body.components.length);
      for (const component of body.components) {
        cdr.writeULong(component.componentId);
        cdr.writeULong(component.componentData.length);
        cdr.writeOctetArray(component.componentData);
      }
    }

    return {
      profileId: ProfileId.TAG_INTERNET_IOP,
      profileData: cdr.getBuffer(),
    };
  }

  /**
   * Parse an IIOP profile
   */
  static parseIIOPProfile(profile: TaggedProfile): IIOPProfileBody | null {
    if (profile.profileId !== ProfileId.TAG_INTERNET_IOP) {
      return null;
    }

    const cdr = new CDRInputStream(profile.profileData);

    // Version
    const major = cdr.readOctet();
    const minor = cdr.readOctet();
    const iiop_version = { major, minor };

    // Host
    const host = cdr.readString();

    // Port
    const port = cdr.readUShort();

    // Object key
    const keyLength = cdr.readULong();
    const object_key = cdr.readOctetArray(keyLength);

    // Components (GIOP 1.1+)
    const components: TaggedComponent[] = [];
    if (minor >= 1 && cdr.getPosition() < profile.profileData.length) {
      const componentCount = cdr.readULong();
      for (let i = 0; i < componentCount; i++) {
        const componentId = cdr.readULong();
        const length = cdr.readULong();
        const componentData = cdr.readOctetArray(length);
        components.push({ componentId, componentData });
      }
    }

    return {
      iiop_version,
      host,
      port,
      object_key,
      components,
    };
  }

  /**
   * Extract IIOP endpoint from IOR
   */
  static getIIOPEndpoint(ior: IOR): { host: string; port: number } | null {
    for (const profile of ior.profiles) {
      const iiop = this.parseIIOPProfile(profile);
      if (iiop) {
        return { host: iiop.host, port: iiop.port };
      }
    }
    return null;
  }

  /**
   * Create a simple IOR with single IIOP profile
   */
  static createSimpleIOR(
    typeId: string,
    host: string,
    port: number,
    objectKey: Uint8Array,
  ): IOR {
    const profile = this.createIIOPProfile({
      iiop_version: { major: 1, minor: 2 },
      host,
      port,
      object_key: objectKey,
      components: [],
    });

    return {
      typeId,
      profiles: [profile],
    };
  }

  /**
   * Add CodeSets component to IIOP profile
   */
  static createCodeSetsComponent(
    charCodeSet: number = 0x00010001, // ISO 8859-1
    wcharCodeSet: number = 0x00010109, // UTF-16
  ): TaggedComponent {
    const cdr = new CDROutputStream();

    // Native char code set
    cdr.writeULong(charCodeSet);
    // Conversion char code sets count
    cdr.writeULong(0);

    // Native wchar code set
    cdr.writeULong(wcharCodeSet);
    // Conversion wchar code sets count
    cdr.writeULong(0);

    return {
      componentId: ComponentId.TAG_CODE_SETS,
      componentData: cdr.getBuffer(),
    };
  }

  /**
   * Add ORB Type component
   */
  static createORBTypeComponent(orbType: string): TaggedComponent {
    const cdr = new CDROutputStream();
    cdr.writeString(orbType);

    return {
      componentId: ComponentId.TAG_ORB_TYPE,
      componentData: cdr.getBuffer(),
    };
  }
}
