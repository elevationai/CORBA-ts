/**
 * Unit Tests for CORBA Naming Service
 */

import { assert, assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.220.0/assert/mod.ts";
import {
  BindingType,
  CosNaming,
  create_naming_context,
  create_naming_context_ext,
  NameUtil,
  NamingContextExtImpl,
  NamingContextImpl,
} from "../src/naming.ts";
import { CORBA } from "../src/types.ts";
import { ObjectReference } from "../src/object.ts";

// Mock object reference for testing
class MockObjectRef extends ObjectReference {
  constructor(id: string) {
    super(id);
  }
}

Deno.test("Naming: NameUtil basic operations", () => {
  // Test simple name creation
  const simpleName = NameUtil.createSimpleName("TestService", "Object");
  assertEquals(simpleName.length, 1);
  assertEquals(simpleName[0].id, "TestService");
  assertEquals(simpleName[0].kind, "Object");

  // Test compound name creation
  const compoundName = NameUtil.createCompoundName(
    { id: "Services" },
    { id: "Database", kind: "Connection" },
    { id: "Pool", kind: "Manager" },
  );
  assertEquals(compoundName.length, 3);
  assertEquals(compoundName[0].kind, "");
  assertEquals(compoundName[1].kind, "Connection");

  // Test name equality
  const name1 = NameUtil.createSimpleName("Test", "Service");
  const name2 = NameUtil.createSimpleName("Test", "Service");
  const name3 = NameUtil.createSimpleName("Test", "Object");

  assert(NameUtil.areEqual(name1, name2));
  assert(!NameUtil.areEqual(name1, name3));

  // Test name validation
  assert(NameUtil.isValid(name1));
  assert(!NameUtil.isValid([]));

  // Test parent name extraction
  const parent = NameUtil.getParentName(compoundName);
  assertEquals(parent.length, 2);
  assertEquals(parent[0].id, "Services");
  assertEquals(parent[1].id, "Database");

  // Test last component extraction
  const last = NameUtil.getLastComponent(compoundName);
  assertExists(last);
  assertEquals(last.id, "Pool");
  assertEquals(last.kind, "Manager");
});

Deno.test("Naming: Basic binding operations", async () => {
  const context = new NamingContextImpl();
  const mockObj = new MockObjectRef("IDL:Test/Service:1.0");

  // Test simple bind
  const name = NameUtil.createSimpleName("TestService", "Object");
  await context.bind(name, mockObj);

  // Test resolve
  const resolved = await context.resolve(name);
  assertEquals(resolved, mockObj);

  // Test bind with existing name should throw AlreadyBound
  await assertRejects(
    () => context.bind(name, mockObj),
    CosNaming.AlreadyBound,
  );

  // Test rebind should succeed
  const mockObj2 = new MockObjectRef("IDL:Test/Service2:1.0");
  await context.rebind(name, mockObj2);

  const resolved2 = await context.resolve(name);
  assertEquals(resolved2, mockObj2);

  // Test unbind
  await context.unbind(name);

  await assertRejects(
    () => context.resolve(name),
    CosNaming.NotFound,
  );
});

Deno.test("Naming: Context operations", async () => {
  const rootContext = new NamingContextImpl();

  // Test new_context
  const newContext = await rootContext.new_context();
  assertExists(newContext);

  // Test bind_context
  const contextName = NameUtil.createSimpleName("SubContext", "Directory");
  await rootContext.bind_context(contextName, newContext);

  // Test resolving context
  const resolved = await rootContext.resolve(contextName);
  assertEquals(resolved, newContext);

  // Test bind_new_context
  const anotherContextName = NameUtil.createSimpleName("AnotherContext");
  const boundContext = await rootContext.bind_new_context(anotherContextName);
  assertExists(boundContext);

  // Verify it was bound
  const resolvedBound = await rootContext.resolve(anotherContextName);
  assertEquals(resolvedBound, boundContext);
});

Deno.test("Naming: List operations", async () => {
  const context = new NamingContextImpl();

  // Add some bindings
  const obj1 = new MockObjectRef("IDL:Test/Service1:1.0");
  const obj2 = new MockObjectRef("IDL:Test/Service2:1.0");
  const subContext = new NamingContextImpl();

  await context.bind(NameUtil.createSimpleName("Service1"), obj1);
  await context.bind(NameUtil.createSimpleName("Service2"), obj2);
  await context.bind_context(NameUtil.createSimpleName("SubContext"), subContext);

  // Test list with sufficient limit
  const result1 = await context.list(10);
  assertEquals(result1.bl.length, 3);
  assertExists(result1.bi);

  // Verify binding types
  const bindings = result1.bl;
  const serviceBinding = bindings.find((b) => b.binding_name[0].id === "Service1");
  const contextBinding = bindings.find((b) => b.binding_name[0].id === "SubContext");

  assertExists(serviceBinding);
  assertExists(contextBinding);
  assertEquals(serviceBinding.binding_type, BindingType.nobject);
  assertEquals(contextBinding.binding_type, BindingType.ncontext);

  // Test list with limited count
  const result2 = await context.list(1);
  assertEquals(result2.bl.length, 1);

  // Test iterator
  const iterator = result2.bi;
  const nextResult = await iterator.next_one();
  assertEquals(nextResult.success, true);
  assertExists(nextResult.b);
});

Deno.test("Naming: Hierarchical naming", async () => {
  const rootContext = new NamingContextImpl();
  const mockService = new MockObjectRef("IDL:Test/DeepService:1.0");

  // Create a deep path: Services/Database/Connection
  const deepName = NameUtil.createCompoundName(
    { id: "Services" },
    { id: "Database" },
    { id: "Connection", kind: "Pool" },
  );

  // Create intermediate contexts manually
  const servicesContext = new NamingContextImpl();
  const databaseContext = new NamingContextImpl();

  await rootContext.bind_context([deepName[0]], servicesContext);
  await servicesContext.bind_context([deepName[1]], databaseContext);
  await databaseContext.bind([deepName[2]], mockService);

  // Test resolving through hierarchy
  const resolved = await rootContext.resolve(deepName);
  assertEquals(resolved, mockService);

  // Test unbinding from hierarchy
  await rootContext.unbind(deepName);

  await assertRejects(
    () => databaseContext.resolve([deepName[2]]),
    CosNaming.NotFound,
  );
});

Deno.test("Naming: Exception handling", async () => {
  const context = new NamingContextImpl();

  // Test InvalidName for empty names
  await assertRejects(
    () => context.bind([], new MockObjectRef("test")),
    CosNaming.InvalidName,
  );

  await assertRejects(
    () => context.resolve([]),
    CosNaming.InvalidName,
  );

  // Test NotFound for non-existent names
  const nonExistentName = NameUtil.createSimpleName("NonExistent");
  await assertRejects(
    () => context.resolve(nonExistentName),
    CosNaming.NotFound,
  );

  // Test NotEmpty when trying to destroy non-empty context
  await context.bind(NameUtil.createSimpleName("SomeName"), new MockObjectRef("test"));
  await assertRejects(
    () => context.destroy(),
    CosNaming.NotEmpty,
  );

  // Test destroy after clearing
  await context.unbind(NameUtil.createSimpleName("SomeName"));
  await context.destroy(); // Should not throw
});

Deno.test("Naming: NamingContextExt string operations", async () => {
  const context = new NamingContextExtImpl();

  // Test to_name
  const stringName = "Services/Database.Connection";
  const name = await context.to_name(stringName);
  assertEquals(name.length, 2);
  assertEquals(name[0].id, "Services");
  assertEquals(name[0].kind, "");
  assertEquals(name[1].id, "Database");
  assertEquals(name[1].kind, "Connection");

  // Test to_string
  const backToString = await context.to_string(name);
  assertEquals(backToString, "Services./Database.Connection");

  // Test to_url
  const url = await context.to_url("iiop:localhost:2809", stringName);
  assertEquals(url, "corbaname:iiop:localhost:2809#Services%2FDatabase.Connection");

  // Test resolve_str - need to bind to correct path structure
  const mockService = new MockObjectRef("IDL:Test/Service:1.0");

  // Create Services context first for hierarchical name
  const servicesContext = new NamingContextExtImpl();
  const servicesName = [{ id: "Services", kind: "" }];
  await context.bind_context(servicesName, servicesContext);

  // Bind to the Database.Connection within Services
  const dbName = [{ id: "Database", kind: "Connection" }];
  await servicesContext.bind(dbName, mockService);

  const resolvedByString = await context.resolve_str(stringName);
  assertEquals(resolvedByString, mockService);

  // Test error cases
  await assertRejects(
    () => context.to_name(""),
    CosNaming.InvalidName,
  );

  await assertRejects(
    () => context.to_string([]),
    CosNaming.InvalidName,
  );

  await assertRejects(
    () => context.to_url("", "test"),
    CORBA.BAD_PARAM,
  );
});

Deno.test("Naming: Factory functions", () => {
  // Test create_naming_context
  const context1 = create_naming_context();
  assertExists(context1);
  assert(context1 instanceof NamingContextImpl);

  // Test create_naming_context_ext
  const context2 = create_naming_context_ext();
  assertExists(context2);
  assert(context2 instanceof NamingContextExtImpl);
});

Deno.test("Naming: Utility methods", () => {
  const context = new NamingContextImpl() as unknown as {
    size(): number;
    isEmpty(): boolean;
    exists(n: unknown): boolean;
  }; // Cast to access private methods

  // Test exists method
  const name = NameUtil.createSimpleName("TestService");
  assertEquals(context.exists(name), false);

  // Test size and isEmpty
  assertEquals(context.size(), 0);
  assertEquals(context.isEmpty(), true);
});

Deno.test("Naming: Edge cases and error conditions", async () => {
  const context = new NamingContextImpl();
  let expectedBindings = 0;

  // Test binding with special characters in names
  const specialName = NameUtil.createSimpleName("Test.With/Special", "Chars.");
  const mockObj = new MockObjectRef("test");

  await context.bind(specialName, mockObj);
  expectedBindings++;
  const resolved = await context.resolve(specialName);
  assertEquals(resolved, mockObj);

  // Test very long names
  const longName = NameUtil.createCompoundName(
    ...Array(50).fill(0).map((_, i) => ({ id: `Component${i}` })),
  );

  // This should work but might be limited by implementation
  // For now, just test that it doesn't crash
  try {
    await context.bind(longName, mockObj);
    expectedBindings++; // Only increment if successful
  } catch (error) {
    // Expected - hierarchical resolution would fail without intermediate contexts
    assert(error instanceof CosNaming.NotFound || error instanceof CORBA.BAD_PARAM);
  }

  // Test concurrent operations
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const name = NameUtil.createSimpleName(`Concurrent${i}`);
    promises.push(context.bind(name, new MockObjectRef(`test${i}`)));
  }

  await Promise.all(promises);
  expectedBindings += 10; // 10 concurrent bindings
  assertEquals(context.size(), expectedBindings);
});
