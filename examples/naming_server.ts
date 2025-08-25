#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

/**
 * Example: Running the CORBA Naming Service Server
 */

import { NamingServer, NamingServerCLI } from "../src/naming_server.ts";

// Check if this script is being run directly
if (import.meta.main) {
  // Run the CLI
  await NamingServerCLI.run();
} else {
  // Export for programmatic usage
  console.log("Example: Programmatic usage of NamingServer");

  const server = new NamingServer({
    host: "localhost",
    port: 2809,
    enableLogging: true,
    persistent: false,
  });

  try {
    console.log("Starting naming service...");
    await server.start();

    console.log("Naming service is running");
    console.log(`Root context IOR: ${server.getIOR()}`);

    // Keep running for 30 seconds in this example
    setTimeout(async () => {
      console.log("Stopping naming service...");
      await server.stop();
      console.log("Example completed");
    }, 30000);
  } catch (error) {
    console.error("Failed to start naming service:", error);
  }
}
