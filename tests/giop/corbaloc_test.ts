/**
 * Tests for corbaloc URL parser
 */

import { assertEquals, assertThrows } from "@std/assert";
import { parseCorbaloc, validateCorbaloc, buildCorbaloc, CorbalocProtocol, CorbalocParseError } from "../../src/giop/corbaloc.ts";

Deno.test("parseCorbaloc - simple IIOP URL", () => {
  const result = parseCorbaloc("corbaloc::example.com/NameService");

  assertEquals(result.addresses.length, 1);
  assertEquals(result.addresses[0].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[0].host, "example.com");
  assertEquals(result.addresses[0].port, 2809); // Default port
  assertEquals(result.addresses[0].version, { major: 1, minor: 2 }); // Default version
  assertEquals(result.objectKey, "NameService");
});

Deno.test("parseCorbaloc - IIOP with version and port", () => {
  const result = parseCorbaloc("corbaloc:iiop:1.3@example.com:3000/MyObject");

  assertEquals(result.addresses.length, 1);
  assertEquals(result.addresses[0].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[0].host, "example.com");
  assertEquals(result.addresses[0].port, 3000);
  assertEquals(result.addresses[0].version, { major: 1, minor: 3 });
  assertEquals(result.objectKey, "MyObject");
});

Deno.test("parseCorbaloc - multiple addresses", () => {
  const result = parseCorbaloc("corbaloc::server1:2809,:server2:2810/LoadBalanced");

  assertEquals(result.addresses.length, 2);

  assertEquals(result.addresses[0].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[0].host, "server1");
  assertEquals(result.addresses[0].port, 2809);

  assertEquals(result.addresses[1].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[1].host, "server2");
  assertEquals(result.addresses[1].port, 2810);

  assertEquals(result.objectKey, "LoadBalanced");
});

Deno.test("parseCorbaloc - mixed protocols", () => {
  const result = parseCorbaloc("corbaloc:iiop:server1:2809,ssliop:server2:2810/Secure");

  assertEquals(result.addresses.length, 2);

  assertEquals(result.addresses[0].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[0].host, "server1");
  assertEquals(result.addresses[0].port, 2809);

  assertEquals(result.addresses[1].protocol, CorbalocProtocol.SSLIOP);
  assertEquals(result.addresses[1].host, "server2");
  assertEquals(result.addresses[1].port, 2810);
});

Deno.test("parseCorbaloc - IPv6 address", () => {
  const result = parseCorbaloc("corbaloc::[::1]:2809/IPv6Object");

  assertEquals(result.addresses.length, 1);
  assertEquals(result.addresses[0].protocol, CorbalocProtocol.IIOP);
  assertEquals(result.addresses[0].host, "::1");
  assertEquals(result.addresses[0].port, 2809);
  assertEquals(result.objectKey, "IPv6Object");
});

Deno.test("parseCorbaloc - IPv6 with custom port", () => {
  const result = parseCorbaloc("corbaloc::[2001:db8::1]:3000/IPv6Custom");

  assertEquals(result.addresses.length, 1);
  assertEquals(result.addresses[0].host, "2001:db8::1");
  assertEquals(result.addresses[0].port, 3000);
});

Deno.test("parseCorbaloc - multiple IPv6 addresses", () => {
  const result = parseCorbaloc("corbaloc::[::1]:2809,:[fe80::1]:2810/MultiIPv6");

  assertEquals(result.addresses.length, 2);
  assertEquals(result.addresses[0].host, "::1");
  assertEquals(result.addresses[0].port, 2809);
  assertEquals(result.addresses[1].host, "fe80::1");
  assertEquals(result.addresses[1].port, 2810);
});

Deno.test("parseCorbaloc - RIR protocol", () => {
  const result = parseCorbaloc("corbaloc:rir:/NameService");

  assertEquals(result.addresses.length, 1);
  assertEquals(result.addresses[0].protocol, CorbalocProtocol.RIR);
  assertEquals(result.addresses[0].host, undefined);
  assertEquals(result.addresses[0].port, undefined);
  assertEquals(result.objectKey, "NameService");
});

Deno.test("parseCorbaloc - escaped object key", () => {
  const result = parseCorbaloc("corbaloc::example.com/Name%2FService%3Atest");

  assertEquals(result.objectKey, "Name%2FService%3Atest");
  // The raw object key should be decoded
  const expectedKey = new TextEncoder().encode("Name/Service:test");
  assertEquals(result.rawObjectKey, expectedKey);
});

Deno.test("parseCorbaloc - no object key", () => {
  const result = parseCorbaloc("corbaloc::example.com");

  assertEquals(result.objectKey, "");
  assertEquals(result.rawObjectKey, new Uint8Array(0));
});

Deno.test("parseCorbaloc - error on invalid URL", () => {
  assertThrows(
    () => parseCorbaloc("http://example.com"),
    CorbalocParseError,
    "must start with 'corbaloc:'"
  );
});

Deno.test("parseCorbaloc - error on invalid port", () => {
  assertThrows(
    () => parseCorbaloc("corbaloc::example.com:99999"),
    CorbalocParseError,
    "Invalid port"
  );
});

Deno.test("parseCorbaloc - error on unclosed IPv6 bracket", () => {
  assertThrows(
    () => parseCorbaloc("corbaloc::[::1/test"),
    CorbalocParseError,
    "Unclosed IPv6"
  );
});

Deno.test("validateCorbaloc - valid URLs", () => {
  const validUrls = [
    "corbaloc::example.com/NameService",
    "corbaloc:iiop:1.2@example.com:2809/test",
    "corbaloc::[::1]/IPv6",
    "corbaloc:rir:/NameService",
    "corbaloc::server1,server2/MultiServer",
  ];

  for (const url of validUrls) {
    const result = validateCorbaloc(url);
    assertEquals(result.valid, true, `URL should be valid: ${url}`);
    assertEquals(result.error, undefined);
  }
});

Deno.test("validateCorbaloc - invalid URLs", () => {
  const invalidUrls = [
    "http://example.com",
    "corbaloc:",
    "corbaloc::example.com:abc",
  ];

  for (const url of invalidUrls) {
    const result = validateCorbaloc(url);
    assertEquals(result.valid, false, `URL should be invalid: ${url}`);
    assertEquals(typeof result.error, "string");
  }
});

Deno.test("buildCorbaloc - simple IIOP", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.IIOP,
      version: { major: 1, minor: 2 },
      host: "example.com",
      port: 2809,
    }],
    objectKey: "NameService",
    rawObjectKey: new TextEncoder().encode("NameService"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc::example.com/NameService");
});

Deno.test("buildCorbaloc - with non-default version and port", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.IIOP,
      version: { major: 1, minor: 3 },
      host: "example.com",
      port: 3000,
    }],
    objectKey: "MyObject",
    rawObjectKey: new TextEncoder().encode("MyObject"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc::1.3@example.com:3000/MyObject");
});

Deno.test("buildCorbaloc - multiple addresses", () => {
  const url = {
    addresses: [
      {
        protocol: CorbalocProtocol.IIOP,
        version: { major: 1, minor: 2 },
        host: "server1",
        port: 2809,
      },
      {
        protocol: CorbalocProtocol.IIOP,
        version: { major: 1, minor: 2 },
        host: "server2",
        port: 2810,
      },
    ],
    objectKey: "LoadBalanced",
    rawObjectKey: new TextEncoder().encode("LoadBalanced"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc::server1,:server2:2810/LoadBalanced");
});

Deno.test("buildCorbaloc - IPv6 address", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.IIOP,
      version: { major: 1, minor: 2 },
      host: "::1",
      port: 2809,
    }],
    objectKey: "IPv6Object",
    rawObjectKey: new TextEncoder().encode("IPv6Object"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc::[::1]/IPv6Object");
});

Deno.test("buildCorbaloc - SSLIOP protocol", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.SSLIOP,
      version: { major: 1, minor: 2 },
      host: "secure.example.com",
      port: 2810,
    }],
    objectKey: "SecureObject",
    rawObjectKey: new TextEncoder().encode("SecureObject"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc:ssliop:secure.example.com/SecureObject");
});

Deno.test("buildCorbaloc - RIR protocol", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.RIR,
    }],
    objectKey: "NameService",
    rawObjectKey: new TextEncoder().encode("NameService"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc:rir:/NameService");
});

Deno.test("buildCorbaloc - escapes special characters in object key", () => {
  const url = {
    addresses: [{
      protocol: CorbalocProtocol.IIOP,
      version: { major: 1, minor: 2 },
      host: "example.com",
      port: 2809,
    }],
    objectKey: "Name/Service:test@data",
    rawObjectKey: new TextEncoder().encode("Name/Service:test@data"),
  };

  const result = buildCorbaloc(url);
  assertEquals(result, "corbaloc::example.com/Name%2FService%3Atest%40data");
});