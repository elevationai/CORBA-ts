/**
 * Integration Tests for Network Communication
 * Tests actual TCP communication between GIOP client and server
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { GIOPTransport } from "../../src/giop/transport.ts";
import { GIOPReply, GIOPRequest } from "../../src/giop/messages.ts";
import { ConnectionEndpoint } from "../../src/giop/connection.ts";
import { IORUtil } from "../../src/giop/ior.ts";
import { ReplyStatusType } from "../../src/giop/types.ts";
import { ProxyFactory } from "../../src/proxy.ts";
import { ORBImpl } from "../../src/orb.ts";

// Test server endpoint
const TEST_ENDPOINT: ConnectionEndpoint = {
  host: "127.0.0.1",
  port: 0, // Let system assign port
};

Deno.test("Network: Basic client-server communication", async () => {
  const transport = new GIOPTransport();

  try {
    // Start server
    const server = await transport.startServer(TEST_ENDPOINT);

    // Create a simple echo handler
    server.registerHandler("echo", (request: GIOPRequest) => {
      const reply = new GIOPReply(request.version);
      reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
      reply.body = request.body; // Echo the request body
      return Promise.resolve(reply);
    });

    await server.start();

    // Get the actual port assigned by the system
    const actualAddr = server.getAddress();
    assertExists(actualAddr, "Server should have an address");
    const testEndpoint = { host: "127.0.0.1", port: actualAddr.port };

    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create test IOR with actual server address
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/Echo:1.0",
      testEndpoint.host,
      testEndpoint.port,
      new Uint8Array([1, 2, 3, 4]),
    );

    // Send request
    const testMessage = new TextEncoder().encode("Hello, CORBA!");
    const reply = await transport.sendRequest(ior, "echo", testMessage);

    // Verify reply
    assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
    assertEquals(reply.body, testMessage);

    await server.stop();
  } finally {
    await transport.close();
  }
});

Deno.test("Network: Multiple concurrent requests", async () => {
  const transport = new GIOPTransport();

  try {
    // Start server
    const server = await transport.startServer(TEST_ENDPOINT);

    // Create a counter handler
    let counter = 0;
    server.registerHandler("increment", (request: GIOPRequest) => {
      counter++;
      const reply = new GIOPReply(request.version);
      reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
      reply.body = new TextEncoder().encode(counter.toString());
      return Promise.resolve(reply);
    });

    await server.start();
    
    // Get actual server address
    const actualAddr = server.getAddress();
    assertExists(actualAddr, "Server should have an address");
    const testEndpoint = { host: "127.0.0.1", port: actualAddr.port };
    
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create test IOR
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/Counter:1.0",
      testEndpoint.host,
      testEndpoint.port,
      new Uint8Array([1, 2, 3, 4]),
    );

    // Send multiple concurrent requests
    const numRequests = 5;
    const promises = [];

    for (let i = 0; i < numRequests; i++) {
      const promise = transport.sendRequest(ior, "increment", new Uint8Array());
      promises.push(promise);
    }

    const replies = await Promise.all(promises);

    // Verify all requests completed
    assertEquals(replies.length, numRequests);
    replies.forEach((reply) => {
      assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
      assertExists(reply.body);
    });

    // Counter should equal number of requests
    assertEquals(counter, numRequests);

    await server.stop();
  } finally {
    await transport.close();
  }
});

Deno.test("Network: Oneway requests", async () => {
  const transport = new GIOPTransport();

  try {
    // Start server
    const server = await transport.startServer(TEST_ENDPOINT);

    // Create a notification handler (no reply)
    const notifications: string[] = [];
    server.registerHandler("notify", (request: GIOPRequest) => {
      const message = new TextDecoder().decode(request.body);
      notifications.push(message);

      // Return empty reply for oneway (though client won't wait for it)
      const reply = new GIOPReply(request.version);
      reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
      return Promise.resolve(reply);
    });

    await server.start();
    
    // Get actual server address
    const actualAddr = server.getAddress();
    assertExists(actualAddr, "Server should have an address");
    const testEndpoint = { host: "127.0.0.1", port: actualAddr.port };
    
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create test IOR
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/Notifier:1.0",
      testEndpoint.host,
      testEndpoint.port,
      new Uint8Array([1, 2, 3, 4]),
    );

    // Send oneway requests
    await transport.sendOnewayRequest(ior, "notify", new TextEncoder().encode("message1"));
    await transport.sendOnewayRequest(ior, "notify", new TextEncoder().encode("message2"));
    await transport.sendOnewayRequest(ior, "notify", new TextEncoder().encode("message3"));

    // Give time for messages to be processed
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify notifications were received
    assertEquals(notifications.length, 3);
    assertEquals(notifications[0], "message1");
    assertEquals(notifications[1], "message2");
    assertEquals(notifications[2], "message3");

    await server.stop();
  } finally {
    await transport.close();
  }
});

Deno.test("Network: ORB integration with proxies", async () => {
  const testPort = 8904;
  const testEndpoint = { host: "127.0.0.1", port: testPort };

  // Create ORB
  const orb = new ORBImpl("test-orb");
  await orb.init();

  // Create proxy factory
  const proxyFactory = new ProxyFactory(orb);

  try {
    // This test demonstrates how the pieces fit together
    // In practice, we'd have a running server to connect to

    // Create test IOR
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/Calculator:1.0",
      testEndpoint.host,
      testEndpoint.port,
      new Uint8Array([1, 2, 3, 4]),
    );

    // Create object reference
    const iorString = IORUtil.toString(ior);
    const objRef = await orb.string_to_object(iorString);

    // Create proxy
    interface Calculator {
      add(a: number, b: number): Promise<number>;
      subtract(a: number, b: number): Promise<number>;
      _is_a(repositoryId: string): Promise<boolean>;
    }

    const calculator = proxyFactory.createProxy<Calculator>(
      objRef,
      ["add", "subtract"],
    );

    // Verify proxy structure
    assertExists(calculator);
    assertEquals(typeof calculator._is_a, "function");

    // Test _is_a method
    const supportsInterface = await calculator._is_a("IDL:Test/Calculator:1.0");
    assertEquals(supportsInterface, true);
  } finally {
    await orb.shutdown(false);
  }
});

Deno.test("Network: Connection pooling and reuse", async () => {
  const transport = new GIOPTransport();

  try {
    // Start server
    const server = await transport.startServer(TEST_ENDPOINT);

    server.registerHandler("ping", (request: GIOPRequest) => {
      const reply = new GIOPReply(request.version);
      reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
      reply.body = new TextEncoder().encode("pong");
      return Promise.resolve(reply);
    });

    await server.start();
    
    // Get actual server address
    const actualAddr = server.getAddress();
    assertExists(actualAddr, "Server should have an address");
    const testEndpoint = { host: "127.0.0.1", port: actualAddr.port };
    
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create test IOR
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/Ping:1.0",
      testEndpoint.host,
      testEndpoint.port,
      new Uint8Array([1, 2, 3, 4]),
    );

    // Send multiple requests to same endpoint
    // Should reuse connection
    const numRequests = 3;
    for (let i = 0; i < numRequests; i++) {
      const reply = await transport.sendRequest(ior, "ping", new Uint8Array());
      assertEquals(reply.replyStatus, ReplyStatusType.NO_EXCEPTION);
      const response = new TextDecoder().decode(reply.body);
      assertEquals(response, "pong");
    }

    await server.stop();
  } finally {
    await transport.close();
  }
});

Deno.test("Network: Error handling and timeouts", async () => {
  const transport = new GIOPTransport({ requestTimeout: 1000 }); // Short timeout

  try {
    // Create IOR for non-existent server
    const ior = IORUtil.createSimpleIOR(
      "IDL:Test/NonExistent:1.0",
      "127.0.0.1",
      9999, // Unlikely to be used
      new Uint8Array([1, 2, 3, 4]),
    );

    // This should fail with connection error
    let errorThrown = false;
    try {
      await transport.sendRequest(ior, "test", new Uint8Array());
    } catch (error) {
      errorThrown = true;
      assertExists(error);
    }

    assertEquals(errorThrown, true, "Expected connection error");
  } finally {
    await transport.close();
  }
});
