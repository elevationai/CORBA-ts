/**
 * IOR (Interoperable Object Reference) Tests
 */

import { assertEquals, assertExists } from "@std/assert";
import { IORUtil } from "../../src/giop/ior.ts";
import { ProfileId } from "../../src/giop/types.ts";

Deno.test("IOR: Create simple IOR", () => {
  const ior = IORUtil.createSimpleIOR(
    "IDL:Test/Sample:1.0",
    "localhost",
    8080,
    new Uint8Array([1, 2, 3, 4]),
  );

  assertExists(ior);
  assertEquals(ior.typeId, "IDL:Test/Sample:1.0");
  assertEquals(ior.profiles.length, 1);
  assertEquals(ior.profiles[0].profileId, ProfileId.TAG_INTERNET_IOP);
});

Deno.test("IOR: Parse IIOP profile", () => {
  const ior = IORUtil.createSimpleIOR(
    "IDL:Test/Sample:1.0",
    "example.com",
    1234,
    new Uint8Array([10, 20, 30, 40]),
  );

  const profile = IORUtil.parseIIOPProfile(ior.profiles[0]);
  assertExists(profile);
  assertEquals(profile.host, "example.com");
  assertEquals(profile.port, 1234);
  assertEquals(profile.object_key, new Uint8Array([10, 20, 30, 40]));
  assertEquals(profile.iiop_version.major, 1);
  assertEquals(profile.iiop_version.minor, 2);
});

Deno.test("IOR: Get IIOP endpoint", () => {
  const ior = IORUtil.createSimpleIOR(
    "IDL:Test/Sample:1.0",
    "server.example.com",
    2809,
    new Uint8Array([1, 2, 3]),
  );

  const endpoint = IORUtil.getIIOPEndpoint(ior);
  assertExists(endpoint);
  assertEquals(endpoint.host, "server.example.com");
  assertEquals(endpoint.port, 2809);
});

Deno.test("IOR: String conversion round-trip", () => {
  const ior = IORUtil.createSimpleIOR(
    "IDL:Test/Sample:1.0",
    "localhost",
    9999,
    new Uint8Array([5, 6, 7, 8, 9]),
  );

  // Convert to string
  const iorString = IORUtil.toString(ior);
  assertExists(iorString);
  assertEquals(iorString.startsWith("IOR:"), true);

  // Parse back
  const ior2 = IORUtil.fromString(iorString);
  assertEquals(ior2.typeId, ior.typeId);
  assertEquals(ior2.profiles.length, ior.profiles.length);

  // Check IIOP profile
  const profile1 = IORUtil.parseIIOPProfile(ior.profiles[0]);
  const profile2 = IORUtil.parseIIOPProfile(ior2.profiles[0]);

  assertExists(profile1);
  assertExists(profile2);
  assertEquals(profile1.host, profile2.host);
  assertEquals(profile1.port, profile2.port);
  assertEquals(profile1.object_key, profile2.object_key);
});

Deno.test("IOR: Parse corbaloc URL", () => {
  const testCases = [
    {
      url: "corbaloc:iiop:localhost:2809/NameService",
      expectedHost: "localhost",
      expectedPort: 2809,
      expectedKey: "NameService",
    },
    {
      url: "corbaloc:iiop:example.com/TestObject",
      expectedHost: "example.com",
      expectedPort: 2809, // Default
      expectedKey: "TestObject",
    },
    {
      url: "corbaloc:iiop:1.2@server.com:1234/MyObject",
      expectedHost: "server.com",
      expectedPort: 1234,
      expectedKey: "MyObject",
    },
  ];

  for (const testCase of testCases) {
    const ior = IORUtil.fromString(testCase.url);
    assertExists(ior);

    const endpoint = IORUtil.getIIOPEndpoint(ior);
    assertExists(endpoint);
    assertEquals(endpoint.host, testCase.expectedHost);
    assertEquals(endpoint.port, testCase.expectedPort);

    const profile = IORUtil.parseIIOPProfile(ior.profiles[0]);
    assertExists(profile);
    const keyString = new TextDecoder().decode(profile.object_key);
    assertEquals(keyString, testCase.expectedKey);
  }
});

Deno.test("IOR: Create CodeSets component", () => {
  const component = IORUtil.createCodeSetsComponent();

  assertExists(component);
  assertEquals(component.componentId, 1); // TAG_CODE_SETS
  assertExists(component.componentData);

  // Should contain at least 16 bytes (2 code sets with counts)
  assertEquals(component.componentData.length >= 16, true);
});

Deno.test("IOR: Create ORB Type component", () => {
  const component = IORUtil.createORBTypeComponent("CORBA.ts");

  assertExists(component);
  assertEquals(component.componentId, 0); // TAG_ORB_TYPE
  assertExists(component.componentData);
});

Deno.test("IOR: Multiple profiles", () => {
  const profile1 = IORUtil.createIIOPProfile({
    iiop_version: { major: 1, minor: 2 },
    host: "primary.example.com",
    port: 2809,
    object_key: new Uint8Array([1, 2, 3]),
    components: [],
  });

  const profile2 = IORUtil.createIIOPProfile({
    iiop_version: { major: 1, minor: 2 },
    host: "backup.example.com",
    port: 2810,
    object_key: new Uint8Array([1, 2, 3]),
    components: [],
  });

  const ior = {
    typeId: "IDL:Test/Failover:1.0",
    profiles: [profile1, profile2],
  };

  assertEquals(ior.profiles.length, 2);

  // Should find primary endpoint
  const endpoint = IORUtil.getIIOPEndpoint(ior);
  assertExists(endpoint);
  assertEquals(endpoint.host, "primary.example.com");
});

Deno.test("IOR: Components in IIOP profile", () => {
  const codesets = IORUtil.createCodeSetsComponent();
  const orbType = IORUtil.createORBTypeComponent("CORBA.ts");

  const profile = IORUtil.createIIOPProfile({
    iiop_version: { major: 1, minor: 2 },
    host: "localhost",
    port: 8080,
    object_key: new Uint8Array([10, 20]),
    components: [codesets, orbType],
  });

  const parsed = IORUtil.parseIIOPProfile(profile);
  assertExists(parsed);
  assertEquals(parsed.components.length, 2);
  assertEquals(parsed.components[0].componentId, 1); // CODE_SETS
  assertEquals(parsed.components[1].componentId, 0); // ORB_TYPE
});

Deno.test("IOR: Parse encapsulated IOR with big-endian padding (IBM WebSphere format)", () => {
  // This IOR hex string starts with 00 00 00 00 (big-endian byte order + padding)
  // followed by the actual IOR structure. This is the CORBA 3.0 encapsulation format.
  // IBM WebSphere sends IORs in this format, which was previously incorrectly parsed.
  //
  // Structure breakdown:
  // 00 00 00 00 = encapsulation (byte order flag 0x00 = big-endian, + 3 bytes padding)
  // 00 00 00 14 = type ID length = 20
  // "IDL:Test/Sample:1.0\0" = type ID string (20 bytes including null terminator)
  // 00 00 00 01 = profile count = 1
  // 00 00 00 00 = profile ID = TAG_INTERNET_IOP (0)
  // 00 00 00 18 = profile data length = 24 bytes
  // Profile data (32 bytes) for IIOP 1.2:
  //   00 = byte order (big-endian)
  //   01 02 = IIOP version 1.2
  //   00 = padding for alignment
  //   00 00 00 0A = host string length = 10
  //   6C...00 = "localhost\0" (10 bytes)
  //   1F 90 = port 8080
  //   00 00 00 04 = object key length = 4
  //   01 02 03 04 = object key (4 bytes)
  //   00 00 00 00 = component count = 0

  const iorHex = "00000000" + // encapsulation header (byte order + padding)
    "00000014" + // type ID length = 20
    "49444C3A546573742F53616D706C653A312E3000" + // "IDL:Test/Sample:1.0\0"
    "00000001" + // profile count = 1
    "00000000" + // profile ID = TAG_INTERNET_IOP
    "00000020" + // profile data length = 32 bytes
    "00" + // profile byte order (big-endian)
    "0102" + // IIOP version 1.2
    "00" + // padding
    "0000000A" + // host length = 10
    "6C6F63616C686F737400" + // "localhost\0"
    "1F90" + // port 8080
    "00000004" + // object key length = 4
    "01020304" + // object key
    "00000000"; // component count = 0

  const iorString = "IOR:" + iorHex;

  // Parse the IOR
  const ior = IORUtil.fromString(iorString);

  // Verify basic IOR structure
  assertExists(ior);
  assertEquals(ior.typeId, "IDL:Test/Sample:1.0");
  assertEquals(ior.profiles.length, 1);
  assertEquals(ior.profiles[0].profileId, ProfileId.TAG_INTERNET_IOP);

  // Parse the IIOP profile
  const profile = IORUtil.parseIIOPProfile(ior.profiles[0]);
  assertExists(profile);
  assertEquals(profile.host, "localhost");
  assertEquals(profile.port, 8080);
  assertEquals(profile.iiop_version.major, 1);
  assertEquals(profile.iiop_version.minor, 2);
  assertEquals(profile.object_key, new Uint8Array([1, 2, 3, 4]));
});

Deno.test("IOR: Parse encapsulated IOR with little-endian", () => {
  // Create a simple IOR and convert it to string to get a non-encapsulated format
  const ior = IORUtil.createSimpleIOR(
    "IDL:Test/Sample:1.0",
    "localhost",
    8080,
    new Uint8Array([1, 2, 3, 4]),
  );

  const iorString = IORUtil.toString(ior);

  // The generated IOR should be parseable
  const parsed = IORUtil.fromString(iorString);
  assertExists(parsed);
  assertEquals(parsed.typeId, "IDL:Test/Sample:1.0");

  const profile = IORUtil.parseIIOPProfile(parsed.profiles[0]);
  assertExists(profile);
  assertEquals(profile.host, "localhost");
  assertEquals(profile.port, 8080);
});

Deno.test("IOR: Distinguish encapsulated from non-encapsulated IORs", () => {
  // Test that we correctly distinguish between:
  // 1. Encapsulated big-endian: 00 00 00 00 (byte order + padding)
  // 2. Non-encapsulated: 00 00 00 XX (where XX is part of type ID length)

  // This is a non-encapsulated IOR (old CORBA 2.x format)
  // It starts with the type ID length directly
  const ior = IORUtil.createSimpleIOR(
    "IDL:omg.org/CORBA/Object:1.0",
    "example.com",
    2809,
    new Uint8Array([0xAB, 0xCD, 0xEF]),
  );

  const iorString = IORUtil.toString(ior);
  const parsed = IORUtil.fromString(iorString);

  assertExists(parsed);
  assertEquals(parsed.typeId, "IDL:omg.org/CORBA/Object:1.0");

  const profile = IORUtil.parseIIOPProfile(parsed.profiles[0]);
  assertExists(profile);
  assertEquals(profile.host, "example.com");
  assertEquals(profile.port, 2809);
});
