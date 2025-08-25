/**
 * Example: Using the CORBA Naming Service Client
 */

import { NameBuilder, NamingClient, NamingUtils } from "../src/naming_client.ts";
import { NameUtil } from "../src/naming.ts";

/**
 * Example usage of the naming service client
 */
function demonstrateNamingClient() {
  console.log("=== CORBA Naming Service Client Example ===\n");

  // Create a naming client (in practice, you'd provide an actual IOR)
  const _client = new NamingClient({});

  try {
    // For this example, we'll simulate a naming service connection
    console.log("1. Connecting to naming service...");

    // In a real scenario, you would connect like this:
    // await client.connect("IOR:010000002600000049444C3A6F6D672E6F72672F...");
    // or
    // await client.connect(); // Uses environment variables or default locations

    console.log(
      "   [Note: In this example, we'll demonstrate the API without actual connection]\n",
    );

    // 2. Demonstrate name building
    console.log("2. Building names:");

    const name1 = NameUtil.createSimpleName("MyService", "Object");
    console.log(`   Simple name: ${NameUtil.toString(name1)}`);

    const name2 = NameBuilder.fromString("Services/Authentication.Service").build();
    console.log(`   Compound name: ${NameUtil.toString(name2)}`);

    const name3 = new NameBuilder()
      .add("Applications")
      .add("WebServer", "Service")
      .add("Database", "Connection")
      .build();
    console.log(`   Builder name: ${NameUtil.toString(name3)}\n`);

    // 3. Demonstrate client operations (these would work with a real naming service)
    console.log("3. Client operations (simulated):");
    console.log(`   bind("MyService.Object", objectRef) - would bind an object`);
    console.log(`   resolve("MyService.Object") - would resolve to object reference`);
    console.log(`   unbind("MyService.Object") - would remove the binding`);
    console.log(`   list(10) - would list up to 10 bindings\n`);

    // 4. Demonstrate utilities
    console.log("4. Naming utilities:");

    const corbaNameURL = "corbaname:iiop:localhost:2809#Services/Auth.Service";
    const parsed = NamingUtils.parseCorbaNameURL(corbaNameURL);
    if (parsed) {
      console.log(`   Parsed URL - Address: ${parsed.address}, Name: ${parsed.name}`);
    }

    const isValidIOR = NamingUtils.validateIOR("IOR:010000002600000049444C3A6F6D672E6F72672F");
    console.log(`   IOR validation: ${isValidIOR}\n`);

    // 5. Demonstrate error handling patterns
    console.log("5. Error handling patterns:");
    console.log(`   try { await client.resolve("NonExistent"); }`);
    console.log(`   catch (error) { if (error instanceof CosNaming.NotFound) { ... } }\n`);

    console.log("=== Example completed ===");
  } catch (error) {
    console.error("Error:", error);
  }
}

/**
 * Example of a typical naming service workflow
 */
function typicalWorkflow() {
  console.log("\n=== Typical Naming Service Workflow ===\n");

  const steps = [
    "1. Start naming service server: deno run --allow-net examples/naming_server.ts",
    "2. Application connects to naming service using IOR or endpoint",
    "3. Application binds its services to meaningful names",
    "4. Clients discover services by resolving names",
    "5. Clients create proxies for remote objects",
    "6. Normal CORBA method calls proceed through proxies",
  ];

  steps.forEach((step) => console.log(step));

  console.log("\nCode example:");
  console.log(`
// Server side (service provider)
const client = new NamingClient({});
await client.connect(namingServiceIOR);

// Bind our service to a well-known name
await client.bind("Applications/MyApp.DatabaseService", myDatabaseServiceRef);

// Client side (service consumer)  
const client = new NamingClient({});
await client.connect(namingServiceIOR);

// Resolve the service we need
const dbService = await client.resolveProxy<DatabaseService>(
  "Applications/MyApp.DatabaseService",
  ["query", "update", "transaction"]
);

// Use the service normally
const result = await dbService.query("SELECT * FROM users");
  `);
}

/**
 * Example showing hierarchical naming
 */
function hierarchicalNamingExample() {
  console.log("\n=== Hierarchical Naming Example ===\n");

  const structure = `
Naming Service Root
├── Applications/
│   ├── WebServer.Service
│   ├── Database.Service
│   └── Cache.Service
├── Infrastructure/
│   ├── LoadBalancer.Service
│   ├── Monitoring.Agent
│   └── Logging.Service
└── Users/
    ├── Authentication.Service
    └── Authorization.Service
  `;

  console.log("Typical hierarchical structure:");
  console.log(structure);

  console.log("Creating paths programmatically:");
  console.log(`
// Ensure the Applications context exists
const appContext = await client.ensurePath("Applications");

// Bind services within the Applications context
await client.bind("Applications/WebServer.Service", webServerRef);
await client.bind("Applications/Database.Service", databaseRef);

// Create nested hierarchies
await client.bind("Applications/Services/User.Management", userMgmtRef);
  `);
}

// Run the examples if this file is executed directly
if (import.meta.main) {
  demonstrateNamingClient();
  typicalWorkflow();
  hierarchicalNamingExample();
}
