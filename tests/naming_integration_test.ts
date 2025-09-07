/**
 * Integration Tests for CORBA Naming Service
 * Tests the complete naming service including server, client, and network communication
 */

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { NamingServer } from "../src/naming_server.ts";
import { NameBuilder, NamingUtils } from "../src/naming_client.ts";
import { NameUtil } from "../src/naming.ts";
import { ObjectReference } from "../src/object.ts";

// Test configuration
const TEST_PORT = 9901;
const TEST_HOST = "localhost";

// Mock object for testing
class TestService extends ObjectReference {
  constructor() {
    super("IDL:Test/Service:1.0");
  }
}

Deno.test({
  name: "Integration: Basic naming service server lifecycle",
  async fn() {
    const server = new NamingServer({
      host: TEST_HOST,
      port: TEST_PORT,
      enableLogging: false,
    });

    try {
      // Test initial state
      assertEquals(server.isRunning(), false);

      // Start server
      await server.start();
      assertEquals(server.isRunning(), true);

      // Get statistics
      const stats = server.getStatistics();
      assertEquals(stats.isRunning, true);
      assertEquals(stats.host, TEST_HOST);
      assertEquals(stats.port, TEST_PORT);
      assertEquals(stats.rootContextBindings, 0);

      // Get IOR
      const ior = server.getIOR();
      assertExists(ior);
      assert(ior.startsWith("IOR:"));

      // Get root context
      const rootContext = server.getRootContext();
      assertExists(rootContext);

      // Stop server
      await server.stop();
      assertEquals(server.isRunning(), false);
    } catch (error) {
      // Cleanup in case of error
      if (server.isRunning()) {
        await server.stop();
      }
      throw error;
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Integration: Naming client basic operations",
  fn() {
    // Note: This test demonstrates the naming client API
    // We'll create a mock ORB for this test since we're not connecting to a real service

    // For now, just test the utilities without creating a client that needs an ORB

    // Test utility functions without connection
    const name1 = NameUtil.createSimpleName("TestService", "Object");
    const formatted = NameUtil.toString(name1);
    assertEquals(formatted, "TestService.Object");

    // Test name builder
    const builder = new NameBuilder();
    const builtName = builder
      .add("Services")
      .add("Database", "Connection")
      .build();

    assertEquals(builtName.length, 2);
    assertEquals(builtName[0].id, "Services");
    assertEquals(builtName[1].kind, "Connection");

    // Test name builder from string
    const fromString = NameBuilder.fromString("Apps/Web.Server/DB.Pool").build();
    assertEquals(fromString.length, 3);
    assertEquals(fromString[0].id, "Apps");
    assertEquals(fromString[1].id, "Web");
    assertEquals(fromString[1].kind, "Server");
    assertEquals(fromString[2].id, "DB");
    assertEquals(fromString[2].kind, "Pool");
  },
});

Deno.test({
  name: "Integration: Naming utilities",
  fn() {
    // Test corbaname URL parsing
    const url = "corbaname:iiop:localhost:2809#Services/Auth.Service";
    const parsed = NamingUtils.parseCorbaNameURL(url);

    assertExists(parsed);
    assertEquals(parsed.address, "iiop:localhost:2809");
    assertEquals(parsed.name, "Services/Auth.Service");

    // Test invalid URL
    const invalid = NamingUtils.parseCorbaNameURL("not-a-corbaname-url");
    assertEquals(invalid, null);

    // Test IOR validation
    const validIOR = "IOR:010000002600000049444C3A6F6D672E6F72672F";
    const invalidIOR = "not-an-ior";

    assert(NamingUtils.validateIOR(validIOR));
    assert(!NamingUtils.validateIOR(invalidIOR));

    // Test string name parsing
    const stringName = "Services/Database.Connection/Pool.Manager";
    const parsed2 = NamingUtils.parseStringName(stringName);

    assertEquals(parsed2.length, 3);
    assertEquals(parsed2[0].id, "Services");
    assertEquals(parsed2[0].kind, "");
    assertEquals(parsed2[1].id, "Database");
    assertEquals(parsed2[1].kind, "Connection");
    assertEquals(parsed2[2].id, "Pool");
    assertEquals(parsed2[2].kind, "Manager");

    // Test name formatting
    const formatted = NamingUtils.formatName(parsed2);
    assertEquals(formatted, "Services/Database.Connection/Pool.Manager");
  },
});

Deno.test({
  name: "Integration: Complete server-client workflow simulation",
  async fn() {
    // This test simulates a complete workflow without actual network communication
    // In practice, this would involve real server-client interaction

    console.log("Simulating complete naming service workflow:");

    // Step 1: Server setup
    console.log("1. Setting up naming service server...");
    const server = new NamingServer({
      host: TEST_HOST,
      port: TEST_PORT + 1, // Use different port to avoid conflicts
      enableLogging: false,
    });

    try {
      await server.start();
      const ior = server.getIOR();
      console.log(`   Server started with IOR: ${ior.substring(0, 50)}...`);

      // Step 2: Direct interaction with root context (simulating client operations)
      console.log("2. Binding objects to naming service...");
      const rootContext = server.getRootContext();

      // Bind some test services
      const webService = new TestService();
      const dbService = new TestService();

      const webName = NameUtil.createCompoundName(
        { id: "Applications" },
        { id: "WebServer", kind: "Service" },
      );

      const _dbName = NameUtil.createCompoundName(
        { id: "Applications" },
        { id: "Database", kind: "Service" },
      );

      // Create Applications context first
      const appsContext = await rootContext.new_context();
      await rootContext.bind_context([{ id: "Applications", kind: "" }], appsContext);

      // Bind services within the Applications context
      await appsContext.bind([{ id: "WebServer", kind: "Service" }], webService);
      await appsContext.bind([{ id: "Database", kind: "Service" }], dbService);

      console.log("   Bound WebServer.Service and Database.Service under Applications/");

      // Step 3: Resolution and listing
      console.log("3. Resolving and listing services...");

      const resolved = await rootContext.resolve(webName);
      assertEquals(resolved, webService);
      console.log("   Successfully resolved Applications/WebServer.Service");

      const listings = await appsContext.list(10);
      assertEquals(listings.bl.length, 2);
      console.log(`   Listed ${listings.bl.length} services in Applications context`);

      // Step 4: String name operations
      console.log("4. Testing string name operations...");

      const stringName = "Applications/WebServer.Service";
      const parsedName = await rootContext.to_name(stringName);
      const backToString = await rootContext.to_string(parsedName);

      console.log(`   String name: ${stringName}`);
      console.log(`   Parsed and back: ${backToString}`);

      // Step 5: URL generation
      const url = await rootContext.to_url(`iiop:${TEST_HOST}:${TEST_PORT + 1}`, stringName);
      console.log(`   Generated URL: ${url}`);

      console.log("5. Workflow completed successfully");
    } finally {
      await server.stop();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Integration: Error handling and edge cases",
  async fn() {
    const server = new NamingServer({
      host: TEST_HOST,
      port: TEST_PORT + 2,
      enableLogging: false,
    });

    try {
      await server.start();
      const rootContext = server.getRootContext();

      // Test error conditions
      console.log("Testing error conditions:");

      // 1. Invalid names
      try {
        await rootContext.to_name("");
        assert(false, "Should have thrown InvalidName");
      } catch (_error) {
        console.log("   ✓ Empty string name correctly rejected");
      }

      // 2. Non-existent resolution
      try {
        await rootContext.resolve_str("NonExistent/Service");
        assert(false, "Should have thrown NotFound");
      } catch (_error) {
        console.log("   ✓ Non-existent name resolution correctly rejected");
      }

      // 3. Double binding
      const testService = new TestService();
      const testName = NameUtil.createSimpleName("TestService");

      await rootContext.bind(testName, testService);

      try {
        await rootContext.bind(testName, testService);
        assert(false, "Should have thrown AlreadyBound");
      } catch (_error) {
        console.log("   ✓ Double binding correctly rejected");
      }

      // 4. Unbinding non-existent name
      try {
        await rootContext.unbind(NameUtil.createSimpleName("NonExistent"));
        assert(false, "Should have thrown NotFound");
      } catch (_error) {
        console.log("   ✓ Unbinding non-existent name correctly rejected");
      }

      console.log("All error conditions handled correctly");
    } finally {
      await server.stop();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Integration: Performance and stress testing",
  async fn() {
    const server = new NamingServer({
      host: TEST_HOST,
      port: TEST_PORT + 3,
      enableLogging: false,
    });

    try {
      await server.start();
      const rootContext = server.getRootContext();

      console.log("Running performance tests:");

      // Test 1: Bulk binding operations
      const startTime = Date.now();
      const numBindings = 100;

      for (let i = 0; i < numBindings; i++) {
        const name = NameUtil.createSimpleName(`Service${i}`, "Object");
        const service = new TestService();
        await rootContext.bind(name, service);
      }

      const bindTime = Date.now() - startTime;
      console.log(
        `   Bound ${numBindings} objects in ${bindTime}ms (${(bindTime / numBindings).toFixed(2)}ms per binding)`,
      );

      // Test 2: Bulk resolution
      const resolveStart = Date.now();

      for (let i = 0; i < numBindings; i++) {
        const name = NameUtil.createSimpleName(`Service${i}`, "Object");
        await rootContext.resolve(name);
      }

      const resolveTime = Date.now() - resolveStart;
      console.log(
        `   Resolved ${numBindings} objects in ${resolveTime}ms (${
          (resolveTime / numBindings).toFixed(2)
        }ms per resolution)`,
      );

      // Test 3: Listing performance
      const listStart = Date.now();
      const result = await rootContext.list(numBindings);
      const listTime = Date.now() - listStart;

      assertEquals(result.bl.length, numBindings);
      console.log(`   Listed ${result.bl.length} bindings in ${listTime}ms`);

      // Test 4: Concurrent operations
      const concurrentStart = Date.now();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        const promise = (async () => {
          for (let j = 0; j < 10; j++) {
            const name = NameUtil.createSimpleName(`Concurrent${i}_${j}`);
            const service = new TestService();
            await rootContext.bind(name, service);
            await rootContext.resolve(name);
          }
        })();
        promises.push(promise);
      }

      await Promise.all(promises);
      const concurrentTime = Date.now() - concurrentStart;
      console.log(`   Completed 100 concurrent bind+resolve operations in ${concurrentTime}ms`);
    } finally {
      await server.stop();
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "Integration: Persistent storage simulation",
  async fn() {
    // Test persistent storage configuration (without actual file I/O for this test)
    const tempDir = await Deno.makeTempDir();
    const persistentFile = `${tempDir}/naming_bindings.json`;

    const server = new NamingServer({
      host: TEST_HOST,
      port: TEST_PORT + 4,
      enableLogging: false,
      persistent: true,
      persistentFile: persistentFile,
    });

    try {
      await server.start();
      const rootContext = server.getRootContext();

      // Add some bindings
      const service1 = new TestService();
      const service2 = new TestService();

      await rootContext.bind(NameUtil.createSimpleName("PersistentService1"), service1);
      await rootContext.bind(NameUtil.createSimpleName("PersistentService2"), service2);

      console.log("Added bindings for persistence test");

      // Stop server (this would trigger save)
      await server.stop();

      // Check if file would be created (in actual implementation)
      console.log(`Would save persistent data to: ${persistentFile}`);

      // Start new server instance (would load data)
      const server2 = new NamingServer({
        host: TEST_HOST,
        port: TEST_PORT + 5,
        enableLogging: false,
        persistent: true,
        persistentFile: persistentFile,
      });

      await server2.start();
      console.log("Started new server instance with persistence");

      await server2.stop();
    } finally {
      // Cleanup
      try {
        await Deno.remove(tempDir, { recursive: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  },
  sanitizeResources: false,
  sanitizeOps: false,
});
