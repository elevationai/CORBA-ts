/**
 * Naming Service implementation tests
 */

import { assertEquals, assertExists } from "@std/assert";
import { BindingType, NamingContextImpl } from "../../src/naming.ts";
import { CORBA } from "../../src/types.ts";

// Mock object reference
const createMockRef = (id: string): CORBA.ObjectRef => ({
  _ior: {
    typeId: `IDL:Test/${id}:1.0`,
    profiles: [{
      profileId: 0,
      profileData: new Uint8Array([1, 2, 3, 4]),
    }],
  },
  _is_a: () => Promise.resolve(true),
  _hash: (max: number) => 42 % max,
  _is_equivalent: () => false,
  _non_existent: () => Promise.resolve(false),
});

Deno.test("Naming: Bind and resolve simple names", async () => {
  const context = new NamingContextImpl();
  const name = [{ id: "test", kind: "object" }];
  const objRef = createMockRef("TestObject");

  await context.bind(name, objRef);
  const resolved = await context.resolve(name);

  assertEquals(resolved, objRef);
});

Deno.test("Naming: Contains checks compound names recursively", async () => {
  const rootContext = new NamingContextImpl();
  const subContext = new NamingContextImpl();

  // Bind sub-context
  const contextName = [{ id: "sub", kind: "context" }];
  await rootContext.bind_context(contextName, subContext);

  // Bind object in sub-context
  const objectName = [{ id: "object", kind: "service" }];
  const objRef = createMockRef("Service");
  await subContext.bind(objectName, objRef);

  // Check compound name
  const compoundName = [
    { id: "sub", kind: "context" },
    { id: "object", kind: "service" },
  ];

  // Root context should report it contains the compound name
  assertEquals(rootContext.contains(compoundName), true);

  // Should not contain non-existent compound name
  const nonExistent = [
    { id: "sub", kind: "context" },
    { id: "missing", kind: "service" },
  ];
  assertEquals(rootContext.contains(nonExistent), false);
});

Deno.test("Naming: Unbind removes bindings", async () => {
  const context = new NamingContextImpl();
  const name = [{ id: "temp", kind: "object" }];
  const objRef = createMockRef("TempObject");

  await context.bind(name, objRef);
  assertEquals(context.contains(name), true);

  await context.unbind(name);
  assertEquals(context.contains(name), false);
});

Deno.test("Naming: Rebind replaces existing binding", async () => {
  const context = new NamingContextImpl();
  const name = [{ id: "service", kind: "object" }];
  const objRef1 = createMockRef("Service1");
  const objRef2 = createMockRef("Service2");

  await context.bind(name, objRef1);
  await context.rebind(name, objRef2);

  const resolved = await context.resolve(name);
  assertEquals(resolved, objRef2);
});

Deno.test("Naming: Bind throws AlreadyBound for duplicate", async () => {
  const context = new NamingContextImpl();
  const name = [{ id: "duplicate", kind: "object" }];
  const objRef = createMockRef("DuplicateObject");

  await context.bind(name, objRef);

  try {
    await context.bind(name, objRef);
    throw new Error("Should have thrown AlreadyBound");
  }
  catch (error) {
    assertEquals((error as Error).constructor.name, "AlreadyBound");
  }
});

Deno.test("Naming: Resolve throws NotFound for missing name", async () => {
  const context = new NamingContextImpl();
  const name = [{ id: "missing", kind: "object" }];

  try {
    await context.resolve(name);
    throw new Error("Should have thrown NotFound");
  }
  catch (error) {
    assertEquals((error as Error).constructor.name, "NotFound");
  }
});

Deno.test("Naming: List returns all bindings", async () => {
  const context = new NamingContextImpl();

  // Add multiple bindings
  await context.bind([{ id: "obj1", kind: "object" }], createMockRef("Object1"));
  await context.bind([{ id: "obj2", kind: "object" }], createMockRef("Object2"));
  await context.bind_context([{ id: "ctx1", kind: "context" }], new NamingContextImpl());

  const { bl } = await context.list(10);

  assertEquals(bl.length, 3);

  // Check binding types
  const objectBindings = bl.filter((b) => b.binding_type === BindingType.nobject);
  const contextBindings = bl.filter((b) => b.binding_type === BindingType.ncontext);

  assertEquals(objectBindings.length, 2);
  assertEquals(contextBindings.length, 1);
});

Deno.test("Naming: Compound name resolution", async () => {
  const rootContext = new NamingContextImpl();
  const level1Context = new NamingContextImpl();
  const level2Context = new NamingContextImpl();

  // Build hierarchy
  await rootContext.bind_context([{ id: "level1", kind: "context" }], level1Context);
  await level1Context.bind_context([{ id: "level2", kind: "context" }], level2Context);

  // Bind object at deepest level
  const objRef = createMockRef("DeepObject");
  await level2Context.bind([{ id: "object", kind: "service" }], objRef);

  // Resolve through full path
  const fullPath = [
    { id: "level1", kind: "context" },
    { id: "level2", kind: "context" },
    { id: "object", kind: "service" },
  ];

  const resolved = await rootContext.resolve(fullPath);
  assertEquals(resolved, objRef);
});

Deno.test("Naming: New context creation", async () => {
  const rootContext = new NamingContextImpl();

  const newContext = await rootContext.new_context();
  assertExists(newContext);

  // Should be able to bind to new context
  const name = [{ id: "test", kind: "object" }];
  const objRef = createMockRef("TestInNew");
  await newContext.bind(name, objRef);

  const resolved = await newContext.resolve(name);
  assertEquals(resolved, objRef);
});

Deno.test("Naming: Bind new context", async () => {
  const rootContext = new NamingContextImpl();
  const contextName = [{ id: "newctx", kind: "context" }];

  const newContext = await rootContext.bind_new_context(contextName);
  assertExists(newContext);

  // Should be resolvable from root
  const resolved = await rootContext.resolve(contextName);
  assertEquals(resolved, newContext);
});
