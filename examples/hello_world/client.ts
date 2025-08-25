/**
 * Hello World CORBA Client Example
 */

import { init, ORB_instance } from "../../mod.ts";

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

  // Read the IOR from a file
  const ior = await Deno.readTextFile("hello.ior");
  console.log("Read IOR:", ior);

  // Convert IOR string to object reference
  console.log("Converting IOR to object reference...");
  const obj = await orb.string_to_object(ior);

  // Cast to Hello interface
  console.log("Casting to Hello interface...");
  const hello = obj as unknown as Hello;

  // Invoke the sayHello method
  console.log("Invoking sayHello method...");
  try {
    const result = await hello.sayHello("CORBA World");
    console.log("Result:", result);
  } catch (e) {
    console.error("Error:", e);
  }

  // Shutdown the ORB
  console.log("Shutting down ORB...");
  await orb.shutdown(true);
}

// Run the client
main().catch(console.error);
