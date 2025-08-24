/**
 * Hello World CORBA Server Example
 */

import { init, ORB_instance, getRootPOA } from "../../mod.ts";
import { Servant } from "../../src/poa.ts";

// Define a Hello interface
interface Hello {
  sayHello(name: string): Promise<string>;
}

// Implement a servant class for the Hello interface
class HelloServant extends Servant implements Hello {
  override _repository_id(): string {
    return "IDL:Hello:1.0";
  }

  async sayHello(name: string): Promise<string> {
    console.log(`Saying hello to ${name}`);
    return `Hello, ${name}!`;
  }
}

// Server main function
async function main() {
  console.log("Initializing CORBA runtime...");

  // Initialize CORBA runtime
  await init();

  console.log("Getting ORB...");

  // Get the ORB
  const orb = ORB_instance();

  console.log("Getting POA...");

  // Get the Root POA
  const rootPOA = getRootPOA();
  const poaManager = rootPOA.the_POAManager();

  console.log("Creating servant...");

  // Create a servant
  const helloServant = new HelloServant();

  console.log("Activating servant...");

  // Activate the servant
  const objectId = await rootPOA.activate_object(helloServant);

  // Get the object reference
  const helloRef = await rootPOA.id_to_reference(objectId);

  // Convert to string representation (IOR)
  const ior = await orb.object_to_string(helloRef);

  console.log("Server ready!");
  console.log("IOR:", ior);

  // Write IOR to a file for clients to use
  await Deno.writeTextFile("hello.ior", ior);
  console.log("IOR written to hello.ior");

  // Activate the POA Manager
  await poaManager.activate();

  console.log("Running ORB...");

  // Run the ORB (this will block until shutdown is called)
  await orb.run();
}

// Run the server
main().catch(console.error);
