/**
 * Tests for EventHandler
 */

import { assert, assertEquals, assertExists } from "@std/assert";
import { createEventHandler, type Event, type EventCallback, EventHandler } from "../src/event_handler.ts";
import { init } from "../src/orb.ts";
import { getRootPOA } from "../src/poa.ts";
import { Object } from "../src/object.ts";

// Test event type
interface TestEvent extends Event {
  testData: string;
  count: number;
}

Deno.test("EventHandler - basic creation and activation", async () => {
  await init();

  const appRef = "TEST_APP_001";

  const handler = new EventHandler(appRef, (_e: Event) => {
    // Callback implementation
  });

  assertEquals(handler.getAppRef(), appRef);
  assertEquals(handler.isActivated(), false);

  const ref = await handler.activate();
  assertExists(ref);
  assertEquals(handler.isActivated(), true);

  // Activating again should return the same reference
  const ref2 = await handler.activate();
  assertEquals(ref, ref2);

  await handler.deactivate();
  assertEquals(handler.isActivated(), false);
});

Deno.test("EventHandler - callback invocation", async () => {
  await init();

  const appRef = "TEST_APP_002";
  const events: Event[] = [];

  const handler = new EventHandler(appRef, (e: Event) => {
    events.push(e);
  });

  const ref = await handler.activate();
  assertExists(ref);

  // Simulate event callback
  const testEvent: Event = {
    eventCode: 100,
    timestamp: new Date().toISOString(),
    data: "test data",
  };

  // Get the servant directly to test callback
  const poa = getRootPOA();
  const servant = await poa.reference_to_servant(ref as unknown as Object);

  if (servant && "callback" in servant && typeof servant.callback === "function") {
    await servant.callback(testEvent);
    assertEquals(events.length, 1);
    assertEquals(events[0].eventCode, 100);
    assertEquals(events[0].data, "test data");
  }

  await handler.deactivate();
});

Deno.test("EventHandler - async callback support", async () => {
  await init();

  const appRef = "TEST_APP_003";
  let processed = false;

  const asyncCallback: EventCallback = async (_e: Event) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    processed = true;
  };

  const handler = new EventHandler(appRef, asyncCallback);
  const ref = await handler.activate();
  assertExists(ref);

  // Get the servant and invoke callback
  const poa = getRootPOA();
  const servant = await poa.reference_to_servant(ref as unknown as Object);

  if (servant && "callback" in servant && typeof servant.callback === "function") {
    await servant.callback({ eventCode: 200 });
    assert(processed, "Async callback should have been processed");
  }

  await handler.deactivate();
});

Deno.test("EventHandler - typed events", async () => {
  await init();

  const appRef = "TEST_APP_004";
  const receivedEvents: TestEvent[] = [];

  const handler = new EventHandler<TestEvent>(appRef, (e: TestEvent) => {
    receivedEvents.push(e);
  });

  const ref = await handler.activate();
  assertExists(ref);

  const testEvent: TestEvent = {
    eventCode: 300,
    timestamp: new Date().toISOString(),
    testData: "typed test",
    count: 42,
  };

  // Get the servant and invoke callback with typed event
  const poa = getRootPOA();
  const servant = await poa.reference_to_servant(ref as unknown as Object);

  if (servant && "callback" in servant && typeof servant.callback === "function") {
    await servant.callback(testEvent);
    assertEquals(receivedEvents.length, 1);
    assertEquals(receivedEvents[0].testData, "typed test");
    assertEquals(receivedEvents[0].count, 42);
  }

  await handler.deactivate();
});

Deno.test("EventHandler - custom repository ID", async () => {
  await init();

  const appRef = "TEST_APP_005";
  const customRepoId = "IDL:custom.org/MyEventListener:1.0";

  const handler = new EventHandler(
    appRef,
    (_e: Event) => {},
    customRepoId,
  );

  assertEquals(handler.getRepositoryId(), customRepoId);

  const ref = await handler.activate();
  assertExists(ref);

  await handler.deactivate();
});

Deno.test("EventHandler - getReference auto-activates", async () => {
  await init();

  const appRef = "TEST_APP_006";

  const handler = new EventHandler(appRef, (_e: Event) => {});

  assertEquals(handler.isActivated(), false);

  const ref = await handler.getReference();
  assertExists(ref);
  assertEquals(handler.isActivated(), true);

  await handler.deactivate();
});

Deno.test("createEventHandler helper function", async () => {
  await init();

  const appRef = "TEST_APP_007";
  let eventReceived = false;

  const listener = await createEventHandler(appRef, (_e: Event) => {
    eventReceived = true;
  });

  assertExists(listener);

  // Test that the listener works
  const poa = getRootPOA();
  const servant = await poa.reference_to_servant(listener as unknown as Object);

  if (servant && "callback" in servant && typeof servant.callback === "function") {
    await servant.callback({ eventCode: 400 });
    assert(eventReceived, "Event should have been received");
  }
});

Deno.test("EventHandler - error handling in callback", async () => {
  await init();

  const appRef = "TEST_APP_008";
  const errors: Error[] = [];

  // Capture console.error to verify error logging
  const originalError = console.error;
  console.error = (_msg: string, err: Error) => {
    if (err instanceof Error) {
      errors.push(err);
    }
  };

  const handler = new EventHandler(appRef, (_e: Event) => {
    throw new Error("Test error in callback");
  });

  const ref = await handler.activate();
  const poa = getRootPOA();
  const servant = await poa.reference_to_servant(ref as unknown as Object);

  if (servant && "callback" in servant && typeof servant.callback === "function") {
    try {
      await servant.callback({ eventCode: 500 });
      assert(false, "Should have thrown an error");
    }
    catch (err) {
      assert(err instanceof Error);
      assertEquals(err.message, "Test error in callback");
    }
  }

  // Restore console.error
  console.error = originalError;

  assertEquals(errors.length, 1);
  assertEquals(errors[0].message, "Test error in callback");

  await handler.deactivate();
});

Deno.test("EventHandler - multiple handlers for same app", async () => {
  await init();

  const appRef = "TEST_APP_009";
  const events1: Event[] = [];
  const events2: Event[] = [];

  const handler1 = new EventHandler(appRef, (e: Event) => {
    events1.push(e);
  });

  const handler2 = new EventHandler(appRef, (e: Event) => {
    events2.push(e);
  });

  const ref1 = await handler1.activate();
  const ref2 = await handler2.activate();

  assertExists(ref1);
  assertExists(ref2);
  assert(ref1 !== ref2, "Each handler should have a unique reference");

  await handler1.deactivate();
  await handler2.deactivate();
});
