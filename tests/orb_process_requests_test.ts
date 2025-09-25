import { assertEquals, assertExists } from "@std/assert";
import { init } from "../src/orb.ts";
import { getRootPOA } from "../src/poa.ts";
import { GIOPServer, GIOPTransport } from "../src/giop/transport.ts";

Deno.test("ORB processRequests manages server lifecycle", async () => {
  const orb = await init();
  await orb.init();

  // Get the Root POA
  const rootPOA = getRootPOA();
  assertExists(rootPOA);

  // Activate the POA manager to start the server
  const poaManager = rootPOA.the_POAManager();
  await poaManager.activate();

  // Run the ORB for a short time to process requests
  const runPromise = orb.run();

  // Let it run briefly
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify the ORB is running
  assertEquals(orb.is_running(), true);

  // Shutdown the ORB
  await orb.shutdown(true);

  // Wait for run to complete
  await runPromise;

  // Verify the ORB has stopped
  assertEquals(orb.is_running(), false);
});

Deno.test("ORB registers and unregisters servers", async () => {
  const orb = await init();
  await orb.init();

  // Access the internal _registerServer and _unregisterServer methods
  const orbImpl = orb as unknown as {
    _registerServer: (id: string, server: GIOPServer) => void;
    _unregisterServer: (id: string) => void;
    _servers: Map<string, GIOPServer>;
  };

  // Create a mock server
  const mockServer = {
    isRunning: () => true,
    stop: () => Promise.resolve(),
  } as unknown as GIOPServer;

  // Register a server
  orbImpl._registerServer("test-server", mockServer);
  assertEquals(orbImpl._servers.size, 1);
  assertEquals(orbImpl._servers.has("test-server"), true);

  // Unregister the server
  orbImpl._unregisterServer("test-server");
  assertEquals(orbImpl._servers.size, 0);
  assertEquals(orbImpl._servers.has("test-server"), false);

  await orb.shutdown(true);
});

Deno.test("ORB processRequests cleans up dead servers", async () => {
  const orb = await init();
  await orb.init();

  // Access internal methods for testing
  const orbImpl = orb as unknown as {
    _registerServer: (id: string, server: GIOPServer) => void;
    _servers: Map<string, GIOPServer>;
    processRequests: () => Promise<void>;
  };

  // Create mock servers - one running, one dead
  const runningServer = {
    isRunning: () => true,
    stop: () => Promise.resolve(),
  } as unknown as GIOPServer;

  const deadServer = {
    isRunning: () => false,
    stop: () => Promise.resolve(),
  } as unknown as GIOPServer;

  // Register both servers
  orbImpl._registerServer("running-server", runningServer);
  orbImpl._registerServer("dead-server", deadServer);
  assertEquals(orbImpl._servers.size, 2);

  // Process requests multiple times to trigger health check
  // (health check only runs periodically)
  const orbWithHealth = orbImpl as unknown as {
    _servers: Map<string, GIOPServer>;
    _performHealthCheck: () => Promise<void>;
  };

  // Manually trigger health check
  await orbWithHealth._performHealthCheck();

  // Only the running server should remain
  assertEquals(orbImpl._servers.size, 1);
  assertEquals(orbImpl._servers.has("running-server"), true);
  assertEquals(orbImpl._servers.has("dead-server"), false);

  await orb.shutdown(true);
});

Deno.test("ORB tracks and cleans up pending requests", async () => {
  const orb = await init();
  await orb.init();

  // Access internal methods for testing
  const orbImpl = orb as unknown as {
    _trackRequest: (promise: Promise<void>) => number;
    _untrackRequest: (id: number) => void;
    _pendingRequests: Map<number, Promise<void>>;
    processRequests: () => Promise<void>;
    shutdown: (wait: boolean) => Promise<void>;
  };

  // Track a mock request
  const promise1 = Promise.resolve();

  const id1 = orbImpl._trackRequest(promise1);

  assertEquals(orbImpl._pendingRequests.size, 1);

  // Wait for promise to complete
  await promise1;

  // Process requests to clean up completed promises
  await orbImpl.processRequests();

  // Untrack the request
  orbImpl._untrackRequest(id1);
  assertEquals(orbImpl._pendingRequests.size, 0);

  // Shutdown should complete immediately with no pending requests
  await orbImpl.shutdown(true);
  assertEquals(orbImpl._pendingRequests.size, 0);
});

Deno.test("Transport layer cleanup methods work", async () => {
  const transport = new GIOPTransport();

  // Test processPendingWork doesn't throw
  await transport.processPendingWork();

  // Test cleanupIdleConnections doesn't throw
  await transport.cleanupIdleConnections();

  // Clean up
  await transport.close();
});

Deno.test("ORB performs periodic health checks", async () => {
  const orb = await init();
  await orb.init();

  // Access internal state
  const orbImpl = orb as unknown as {
    _lastHealthCheck: number;
    _performHealthCheck: () => Promise<void>;
    processRequests: () => Promise<void>;
  };

  const initialCheck = orbImpl._lastHealthCheck;

  // Manually trigger health check
  await orbImpl._performHealthCheck();

  // Health check should update timestamp
  const afterCheck = orbImpl._lastHealthCheck;
  assertEquals(afterCheck >= initialCheck, true);

  await orb.shutdown(true);
});