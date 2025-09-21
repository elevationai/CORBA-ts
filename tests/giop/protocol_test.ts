/**
 * Tests for CORBA Protocol Handler System
 */

import { assertEquals, assertThrows, assertExists } from "@std/assert";
import { ProtocolRegistry, BaseProtocolHandler } from "../../src/giop/protocol.ts";
import {
  IIOPProtocolHandler,
  SSLIOPProtocolHandler,
  RIRProtocolHandler,
  initializeStandardProtocols,
  areStandardProtocolsInitialized,
} from "../../src/giop/protocols/index.ts";
import { CorbalocAddress, CorbalocProtocol } from "../../src/giop/corbaloc.ts";
import { ProfileId, TaggedProfile } from "../../src/giop/types.ts";

Deno.test("ProtocolRegistry - register and retrieve handlers", () => {
  ProtocolRegistry.clear();

  const handler = new IIOPProtocolHandler();
  ProtocolRegistry.register(handler);

  assertEquals(ProtocolRegistry.isSupported("iiop"), true);
  assertEquals(ProtocolRegistry.isSupported("IIOP"), true); // Case insensitive
  assertEquals(ProtocolRegistry.isSupported("unknown"), false);

  const retrieved = ProtocolRegistry.get("iiop");
  assertExists(retrieved);
  assertEquals(retrieved.protocol, CorbalocProtocol.IIOP);
});

Deno.test("ProtocolRegistry - prevent duplicate registration", () => {
  ProtocolRegistry.clear();

  const handler1 = new IIOPProtocolHandler();
  ProtocolRegistry.register(handler1);

  const handler2 = new IIOPProtocolHandler();
  assertThrows(
    () => ProtocolRegistry.register(handler2),
    Error,
    "already registered"
  );
});

Deno.test("ProtocolRegistry - unregister handlers", () => {
  ProtocolRegistry.clear();

  const handler = new IIOPProtocolHandler();
  ProtocolRegistry.register(handler);

  assertEquals(ProtocolRegistry.isSupported("iiop"), true);

  const removed = ProtocolRegistry.unregister("iiop");
  assertEquals(removed, true);
  assertEquals(ProtocolRegistry.isSupported("iiop"), false);

  const removedAgain = ProtocolRegistry.unregister("iiop");
  assertEquals(removedAgain, false);
});

Deno.test("ProtocolRegistry - list registered protocols", () => {
  ProtocolRegistry.clear();

  ProtocolRegistry.register(new IIOPProtocolHandler());
  ProtocolRegistry.register(new SSLIOPProtocolHandler());
  ProtocolRegistry.register(new RIRProtocolHandler());

  const protocols = ProtocolRegistry.getProtocols();
  assertEquals(protocols.length, 3);
  assertEquals(protocols.includes("iiop"), true);
  assertEquals(protocols.includes("ssliop"), true);
  assertEquals(protocols.includes("rir"), true);
});

Deno.test("IIOPProtocolHandler - validate address", () => {
  const handler = new IIOPProtocolHandler();

  // Valid address
  const validAddress: CorbalocAddress = {
    protocol: CorbalocProtocol.IIOP,
    host: "example.com",
    port: 2809,
    version: { major: 1, minor: 2 },
  };
  handler.validateAddress(validAddress); // Should not throw

  // Invalid protocol
  assertThrows(
    () => handler.validateAddress({ ...validAddress, protocol: CorbalocProtocol.RIR }),
    Error,
    "Invalid protocol"
  );

  // Missing host
  assertThrows(
    () => handler.validateAddress({ ...validAddress, host: undefined }),
    Error,
    "requires a host"
  );

  // Invalid port
  assertThrows(
    () => handler.validateAddress({ ...validAddress, port: 99999 }),
    Error,
    "Invalid port"
  );

  // Unsupported version
  assertThrows(
    () => handler.validateAddress({ ...validAddress, version: { major: 2, minor: 0 } }),
    Error,
    "Unsupported IIOP version"
  );
});

Deno.test("IIOPProtocolHandler - create and parse profile", () => {
  const handler = new IIOPProtocolHandler();

  const address: CorbalocAddress = {
    protocol: CorbalocProtocol.IIOP,
    host: "test.example.com",
    port: 3000,
    version: { major: 1, minor: 3 },
  };

  const objectKey = new TextEncoder().encode("TestObject");
  const profile = handler.createProfile(address, objectKey);

  assertExists(profile);
  assertEquals(profile.profileId, ProfileId.TAG_INTERNET_IOP);

  // Parse the profile back
  const parsed = handler.parseProfile(profile);
  assertExists(parsed);
  assertEquals(parsed.protocol, CorbalocProtocol.IIOP);
  assertEquals(parsed.host, "test.example.com");
  assertEquals(parsed.port, 3000);
  assertEquals(parsed.version?.major, 1);
  assertEquals(parsed.version?.minor, 3);
});

Deno.test("SSLIOPProtocolHandler - validate address", () => {
  const handler = new SSLIOPProtocolHandler();

  const validAddress: CorbalocAddress = {
    protocol: CorbalocProtocol.SSLIOP,
    host: "secure.example.com",
    port: 2810,
  };

  handler.validateAddress(validAddress); // Should not throw

  assertThrows(
    () => handler.validateAddress({ ...validAddress, protocol: CorbalocProtocol.IIOP }),
    Error,
    "Invalid protocol"
  );
});

Deno.test("SSLIOPProtocolHandler - creates profile with SSL component", () => {
  const handler = new SSLIOPProtocolHandler();

  const address: CorbalocAddress = {
    protocol: CorbalocProtocol.SSLIOP,
    host: "secure.example.com",
    port: 2810,
  };

  const objectKey = new TextEncoder().encode("SecureObject");
  const profile = handler.createProfile(address, objectKey);

  assertExists(profile);
  assertEquals(profile.profileId, ProfileId.TAG_INTERNET_IOP);

  // The profile should be identifiable as SSLIOP
  assertEquals(handler.canHandleProfile(profile), true);

  // Regular IIOP handler should not identify it as plain IIOP
  const iiopHandler = new IIOPProtocolHandler();
  const parsed = iiopHandler.parseProfile(profile);
  assertExists(parsed); // Can parse the IIOP part
  // But the SSLIOP handler would recognize the SSL component
});

Deno.test("RIRProtocolHandler - validate address", () => {
  const handler = new RIRProtocolHandler();

  const validAddress: CorbalocAddress = {
    protocol: CorbalocProtocol.RIR,
  };

  handler.validateAddress(validAddress); // Should not throw

  // RIR should not have host
  assertThrows(
    () => handler.validateAddress({ ...validAddress, host: "localhost" }),
    Error,
    "does not support host"
  );

  // RIR should not have port
  assertThrows(
    () => handler.validateAddress({ ...validAddress, port: 2809 }),
    Error,
    "does not support host or port"
  );

  // RIR should not have version
  assertThrows(
    () => handler.validateAddress({ ...validAddress, version: { major: 1, minor: 2 } }),
    Error,
    "does not support version"
  );
});

Deno.test("RIRProtocolHandler - initial references", () => {
  const handler = new RIRProtocolHandler();

  // Register some initial references
  const nameServiceProfile: TaggedProfile = {
    profileId: ProfileId.TAG_INTERNET_IOP,
    profileData: new Uint8Array([1, 2, 3]),
  };

  handler.registerInitialReference("NameService", nameServiceProfile);
  assertEquals(handler.hasInitialReference("NameService"), true);
  assertEquals(handler.hasInitialReference("Unknown"), false);

  const names = handler.getInitialReferenceNames();
  assertEquals(names.includes("NameService"), true);

  // Create profile for registered reference
  const address: CorbalocAddress = { protocol: CorbalocProtocol.RIR };
  const objectKey = new TextEncoder().encode("NameService");
  const profile = handler.createProfile(address, objectKey);

  // Should return the registered profile
  assertEquals(profile, nameServiceProfile);

  // Unregister
  const removed = handler.unregisterInitialReference("NameService");
  assertEquals(removed, true);
  assertEquals(handler.hasInitialReference("NameService"), false);
});

Deno.test("Standard protocols initialization", () => {
  ProtocolRegistry.clear();
  assertEquals(areStandardProtocolsInitialized(), false);

  initializeStandardProtocols();
  assertEquals(areStandardProtocolsInitialized(), true);

  assertEquals(ProtocolRegistry.isSupported("iiop"), true);
  assertEquals(ProtocolRegistry.isSupported("ssliop"), true);
  assertEquals(ProtocolRegistry.isSupported("rir"), true);
});

Deno.test("Custom protocol handler implementation", () => {
  // Create a simple custom protocol
  class TestProtocolHandler extends BaseProtocolHandler {
    constructor() {
      super("test", 12345);
    }

    validateAddress(address: CorbalocAddress): void {
      if (address.protocol !== "test") {
        throw new Error("Invalid protocol");
      }
      if (!address.host) {
        throw new Error("Test protocol requires host");
      }
    }

    createProfile(address: CorbalocAddress, objectKey: Uint8Array): TaggedProfile {
      this.validateAddress(address);
      return {
        profileId: 0x54455354, // "TEST"
        profileData: objectKey,
      };
    }
  }

  ProtocolRegistry.clear();
  const handler = new TestProtocolHandler();
  ProtocolRegistry.register(handler);

  assertEquals(ProtocolRegistry.isSupported("test"), true);

  const retrieved = ProtocolRegistry.get("test");
  assertExists(retrieved);
  assertEquals(retrieved.protocol, "test");
  assertEquals(retrieved.defaultPort, 12345);
});

Deno.test("ProtocolRegistry - find handler for profile", () => {
  ProtocolRegistry.clear();
  initializeStandardProtocols();

  // Create an IIOP profile
  const iiopHandler = new IIOPProtocolHandler();
  const address: CorbalocAddress = {
    protocol: CorbalocProtocol.IIOP,
    host: "example.com",
    port: 2809,
  };
  const profile = iiopHandler.createProfile(address, new Uint8Array(0));

  // Find handler for the profile
  const foundHandler = ProtocolRegistry.findHandlerForProfile(profile);
  assertExists(foundHandler);
  assertEquals(foundHandler.protocol, CorbalocProtocol.IIOP);

  // Unknown profile type
  const unknownProfile: TaggedProfile = {
    profileId: 0x99999999,
    profileData: new Uint8Array(0),
  };
  const notFound = ProtocolRegistry.findHandlerForProfile(unknownProfile);
  assertEquals(notFound, undefined);
});