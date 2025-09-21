/**
 * RIR Protocol Handler
 * Resolve Initial References protocol implementation
 */

import { BaseProtocolHandler } from "../protocol.ts";
import { CorbalocAddress, CorbalocProtocol } from "../corbaloc.ts";
import { ProfileId, TaggedProfile } from "../types.ts";

/**
 * RIR (Resolve Initial References) protocol handler
 *
 * RIR is used to resolve well-known object references within the local ORB.
 * Common initial references include:
 * - NameService: The naming service root context
 * - RootPOA: The root Portable Object Adapter
 * - POACurrent: The POA Current object
 * - InterfaceRepository: Repository of interface definitions
 * - TradingService: The trading service
 * - NotificationService: Event notification service
 * - SecurityCurrent: Security context
 */
export class RIRProtocolHandler extends BaseProtocolHandler {
  private initialReferences = new Map<string, TaggedProfile>();

  constructor() {
    super(CorbalocProtocol.RIR);
    // No default port for RIR as it's local
  }

  validateAddress(address: CorbalocAddress): void {
    if (address.protocol !== CorbalocProtocol.RIR) {
      throw new Error(`Invalid protocol for RIR handler: ${address.protocol}`);
    }

    // RIR should not have host or port
    if (address.host || address.port) {
      throw new Error("RIR protocol does not support host or port");
    }

    // Version is not applicable to RIR
    if (address.version) {
      throw new Error("RIR protocol does not support version specification");
    }
  }

  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
    this.validateAddress(address);

    // Convert object key to string for lookup
    const keyString = new TextDecoder().decode(objectKey);

    // Check if we have a registered initial reference
    const registeredProfile = this.initialReferences.get(keyString);
    if (registeredProfile) {
      return registeredProfile;
    }

    // Create a special RIR profile
    // Using TAG_MULTIPLE_COMPONENTS as a marker for RIR
    // The actual resolution happens at runtime through the ORB
    return {
      profileId: ProfileId.TAG_MULTIPLE_COMPONENTS,
      profileData: objectKey, // Store the reference name
    };
  }

  override parseProfile(profile: TaggedProfile): CorbalocAddress | null {
    // RIR profiles are special and don't reverse-parse to addresses
    // They're resolved through the ORB's initial references
    if (
      profile.profileId === ProfileId.TAG_MULTIPLE_COMPONENTS &&
      profile.profileData.length > 0
    ) {
      // Check if this looks like a RIR profile
      try {
        const keyString = new TextDecoder().decode(profile.profileData);
        // Simple heuristic: RIR keys are typically ASCII identifiers
        if (/^[A-Za-z][A-Za-z0-9_]*$/.test(keyString)) {
          return {
            protocol: CorbalocProtocol.RIR,
          };
        }
      }
      catch {
        // Not a valid text key
      }
    }
    return null;
  }

  override canHandleProfile(profile: TaggedProfile): boolean {
    // This is a simplified check - in practice, RIR profiles
    // would need ORB-specific markers
    return profile.profileId === ProfileId.TAG_MULTIPLE_COMPONENTS &&
      this.isRIRProfile(profile);
  }

  private isRIRProfile(profile: TaggedProfile): boolean {
    // Check if the profile data looks like a RIR reference name
    try {
      const keyString = new TextDecoder().decode(profile.profileData);
      return /^[A-Za-z][A-Za-z0-9_]*$/.test(keyString);
    }
    catch {
      return false;
    }
  }

  /**
   * Register an initial reference
   * This would typically be called by the ORB during initialization
   */
  registerInitialReference(name: string, profile: TaggedProfile): void {
    this.initialReferences.set(name, profile);
  }

  /**
   * Unregister an initial reference
   */
  unregisterInitialReference(name: string): boolean {
    return this.initialReferences.delete(name);
  }

  /**
   * Get all registered initial reference names
   */
  getInitialReferenceNames(): string[] {
    return Array.from(this.initialReferences.keys());
  }

  /**
   * Check if an initial reference is registered
   */
  hasInitialReference(name: string): boolean {
    return this.initialReferences.has(name);
  }
}
