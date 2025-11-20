/**
 * IOR (Interoperable Object Reference) Implementation
 * CORBA 3.4 Specification compliant
 */

import { CDRInputStream, CDROutputStream } from "../core/cdr/index.ts";
import { ComponentId, IIOPProfileBody, IOR, ProfileId, TaggedComponent, TaggedProfile } from "./types.ts";
import { CorbalocProtocol, parseCorbaloc as parseCorbalocURL } from "./corbaloc.ts";

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
    }
    else if (iorString.startsWith("corbaloc:")) {
      return this.parseCorbaloc(iorString.substring(9));
    }
    else {
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

    // Check if this is an encapsulated IOR (CORBA 3.0+)
    // Encapsulated IORs start with byte order flag followed by 3 bytes of padding:
    // - 0x01 0x00 0x00 0x00 = little-endian
    // - 0x00 0x00 0x00 0x00 = big-endian (with padding)
    //
    // Detection logic:
    // - If bytes[0] == 0x01: Encapsulated little-endian
    // - If bytes[0] == 0x00 AND bytes[1-3] == 0x00: Encapsulated big-endian
    // - Otherwise: Non-encapsulated (starts with type ID length)
    if (bytes.length > 4) {
      if (bytes[0] === 1) {
        // Little-endian encapsulated
        const cdr = new CDRInputStream(bytes, true);
        cdr.readOctet(); // Skip byte order flag
        cdr.skip(3); // Skip 3 bytes of padding
        return this.decodeIOR(cdr);
      }
      else if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0 && bytes[3] === 0 && bytes[4] === 0) {
        // Big-endian encapsulated with padding (bytes 0-3 are 0x00 0x00 0x00 0x00)
        // The actual IOR starts at byte 4
        const cdr = new CDRInputStream(bytes, false);
        cdr.readOctet(); // Skip byte order flag
        cdr.skip(3); // Skip 3 bytes of padding
        return this.decodeIOR(cdr);
      }
    }

    // Non-encapsulated (CORBA 2.x): use network byte order (big-endian)
    const cdr = new CDRInputStream(bytes, false);
    return this.decodeIOR(cdr);
  }

  /**
   * Parse corbaloc URL with full feature support
   * Supports multiple addresses, protocols, IPv6, and proper escaping
   */
  private static parseCorbaloc(url: string): IOR {
    const parsed = parseCorbalocURL("corbaloc:" + url);
    const profiles: TaggedProfile[] = [];

    // Create profiles for each address
    for (const addr of parsed.addresses) {
      if (addr.protocol === CorbalocProtocol.RIR) {
        // RIR protocol - special handling for resolve initial references
        // This is typically used with local ORB references
        // For now, we'll create a special marker profile
        profiles.push({
          profileId: ProfileId.TAG_MULTIPLE_COMPONENTS,
          profileData: new Uint8Array([0]), // Placeholder for RIR
        });
      }
      else if (addr.protocol === CorbalocProtocol.IIOP || addr.protocol === CorbalocProtocol.SSLIOP) {
        // Create IIOP profile for this address
        if (!addr.host || !addr.port) {
          throw new Error(`Invalid address: missing host or port for ${addr.protocol}`);
        }

        const profile = this.createIIOPProfile({
          iiop_version: addr.version || { major: 1, minor: 2 },
          host: addr.host,
          port: addr.port,
          object_key: parsed.rawObjectKey,
          components: addr.protocol === CorbalocProtocol.SSLIOP
            ? [
              // Add SSL component for SSLIOP
              this.createSSLComponent(addr.port),
            ]
            : [],
        });
        profiles.push(profile);
      }
    }

    // Derive type ID - use standard CORBA Object if not specified
    const typeId = "IDL:omg.org/CORBA/Object:1.0";

    return {
      typeId,
      profiles,
    };
  }

  /**
   * Create SSL/TLS component for SSLIOP profiles
   */
  private static createSSLComponent(port: number): TaggedComponent {
    const cdr = new CDROutputStream();

    // SSL component structure (simplified)
    cdr.writeUShort(0x0001); // Supports
    cdr.writeUShort(0x0001); // Requires
    cdr.writeUShort(port); // Port

    return {
      componentId: ComponentId.TAG_SSL_SEC_TRANS,
      componentData: cdr.getBuffer(),
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

    // IIOP profiles must be encapsulated - start with byte order marker
    cdr.writeOctet(0); // 0 = big-endian (default)

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

    // IIOP profiles are encapsulated - first byte is byte order marker
    const byteOrder = profile.profileData[0];
    const isLittleEndian = byteOrder !== 0;

    // Create CDR stream with proper endianness for the encapsulated data
    const cdr = new CDRInputStream(profile.profileData, isLittleEndian);

    // Skip the byte order marker we already read
    cdr.readOctet();

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
      components: [this.createCodeSetsComponent()],
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
    charCodeSet: number = 0x05010001, // UTF-8
    wcharCodeSet: number = 0x00010109, // UTF-16
  ): TaggedComponent {
    const cdr = new CDROutputStream();

    // CodeSets component must be encapsulated (GIOP 1.2+)
    // Start with byte order marker
    cdr.writeOctet(0); // 0 = big-endian

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
