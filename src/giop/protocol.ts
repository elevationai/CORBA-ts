/**
 * CORBA Protocol Handler Interface
 * Extensible protocol support for corbaloc URLs
 */

import { TaggedProfile } from "./types.ts";
import { CorbalocAddress } from "./corbaloc.ts";

/**
 * Protocol handler interface
 * Implement this to add support for custom protocols
 */
export interface ProtocolHandler {
  /**
   * Protocol identifier (e.g., "iiop", "ssliop", "rir")
   */
  readonly protocol: string;

  /**
   * Default port for this protocol
   */
  readonly defaultPort?: number;

  /**
   * Validate an address for this protocol
   * @throws Error if address is invalid
   */
  validateAddress(address: CorbalocAddress): void;

  /**
   * Create a tagged profile from a corbaloc address
   */
  createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile;

  /**
   * Parse a profile back to an address (for reverse operations)
   */
  parseProfile?(profile: TaggedProfile): CorbalocAddress | null;

  /**
   * Check if this handler can process a given profile
   */
  canHandleProfile?(profile: TaggedProfile): boolean;
}

/**
 * Protocol registry for managing protocol handlers
 */
export class ProtocolRegistry {
  private static handlers = new Map<string, ProtocolHandler>();

  /**
   * Register a protocol handler
   */
  static register(handler: ProtocolHandler): void {
    const key = handler.protocol.toLowerCase();
    if (this.handlers.has(key)) {
      throw new Error(`Protocol handler for '${handler.protocol}' already registered`);
    }
    this.handlers.set(key, handler);
  }

  /**
   * Unregister a protocol handler
   */
  static unregister(protocol: string): boolean {
    return this.handlers.delete(protocol.toLowerCase());
  }

  /**
   * Get a protocol handler
   */
  static get(protocol: string): ProtocolHandler | undefined {
    return this.handlers.get(protocol.toLowerCase());
  }

  /**
   * Check if a protocol is supported
   */
  static isSupported(protocol: string): boolean {
    return this.handlers.has(protocol.toLowerCase());
  }

  /**
   * Get all registered protocols
   */
  static getProtocols(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers (useful for testing)
   */
  static clear(): void {
    this.handlers.clear();
  }

  /**
   * Find handler that can process a profile
   */
  static findHandlerForProfile(profile: TaggedProfile): ProtocolHandler | undefined {
    for (const handler of this.handlers.values()) {
      if (handler.canHandleProfile && handler.canHandleProfile(profile)) {
        return handler;
      }
    }
    return undefined;
  }
}

/**
 * Base class for protocol handlers with common functionality
 */
export abstract class BaseProtocolHandler implements ProtocolHandler {
  constructor(
    public readonly protocol: string,
    public readonly defaultPort?: number,
  ) {}

  abstract validateAddress(address: CorbalocAddress): void;
  abstract createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile;

  parseProfile?(profile: TaggedProfile): CorbalocAddress | null;
  canHandleProfile?(profile: TaggedProfile): boolean;
}