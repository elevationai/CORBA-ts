/**
 * Naming Service Client Example
 */

import { init, ORB_instance } from "../../mod.ts";
import { NamingContextExt } from "../../src/naming.ts";

// Define the Hello interface
interface Hello {
  sayHello(name: string): Promise<string>;
}

// Client main function
async function main() {
  console.log("Initializing CORBA runtime...");

  // Initialize CORBA runtime
  await init();

  console.log("Getting ORB...");

  // Get the ORB
  const orb = ORB_instance();

  console.log("Getting Naming Service...");

  // Get the Naming Service
  const namingRef = await orb.resolve_initial_references("NameService");
  const namingContext = namingRef as unknown as NamingContextExt;

  console.log("Resolving 'Hello.Object' from Naming Service...");

  // Resolve the Hello object from the Naming Service
  const obj = await namingContext.resolve_str("Hello.Object");

  // Cast to Hello interface
  console.log("Casting to Hello interface...");
  const hello = obj as unknown as Hello;

  // Invoke the sayHello method
  console.log("Invoking sayHello method...");
  try {
    const result = await hello.sayHello("CORBA World");
    console.log("Result:", result);
  }
  catch (e) {
    console.error("Error:", e);
  }

  // Shutdown the ORB
  console.log("Shutting down ORB...");
  await orb.shutdown(true);
}

// Run the client
main().catch(console.error);
