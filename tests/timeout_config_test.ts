/**
 * Test timeout configuration
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { ORBInitOptions } from "../src/orb.ts";
import type { TransportConfig } from "../src/giop/transport.ts";
import type { ConnectionConfig } from "../src/giop/connection.ts";

Deno.test("ORBInitOptions - timeout configuration", async (t) => {
  await t.step("should accept transport and connection config", () => {
    const transportConfig: TransportConfig = {
      requestTimeout: 45000,
      maxRetries: 3,
      retryDelay: 1000,
    };

    const connectionConfig: ConnectionConfig = {
      connectTimeout: 20000,
      readTimeout: 90000,
      keepAlive: true,
      noDelay: true,
    };

    const options: ORBInitOptions = {
      orb_id: "test",
      transport: transportConfig,
      connection: connectionConfig,
    };

    assertEquals(options.transport?.requestTimeout, 45000);
    assertEquals(options.connection?.connectTimeout, 20000);
    assertEquals(options.connection?.readTimeout, 90000);
  });

  await t.step("should handle optional timeout values", () => {
    const options: ORBInitOptions = {
      orb_id: "test",
      // transport and connection are optional
    };

    assertEquals(options.transport, undefined);
    assertEquals(options.connection, undefined);
  });

  await t.step("should accept partial transport config", () => {
    const options: ORBInitOptions = {
      transport: {
        requestTimeout: 60000,
        // maxRetries and retryDelay will use defaults
      },
    };

    assertEquals(options.transport?.requestTimeout, 60000);
    assertEquals(options.transport?.maxRetries, undefined); // Will use default in implementation
  });

  await t.step("should accept partial connection config", () => {
    const options: ORBInitOptions = {
      connection: {
        connectTimeout: 15000,
        readTimeout: 120000,
        // keepAlive and noDelay will use defaults
      },
    };

    assertEquals(options.connection?.connectTimeout, 15000);
    assertEquals(options.connection?.readTimeout, 120000);
    assertEquals(options.connection?.keepAlive, undefined); // Will use default in implementation
  });
});

Deno.test("TransportConfig - timeout values", async (t) => {
  await t.step("should define requestTimeout field", () => {
    const config: TransportConfig = {
      requestTimeout: 30000,
    };

    assertEquals(config.requestTimeout, 30000);
  });

  await t.step("should allow all timeout fields to be optional", () => {
    const config: TransportConfig = {};

    assertEquals(config.requestTimeout, undefined);
    assertEquals(config.maxRetries, undefined);
    assertEquals(config.retryDelay, undefined);
  });
});

Deno.test("ConnectionConfig - timeout values", async (t) => {
  await t.step("should define connectTimeout and readTimeout fields", () => {
    const config: ConnectionConfig = {
      connectTimeout: 30000,
      readTimeout: 60000,
    };

    assertEquals(config.connectTimeout, 30000);
    assertEquals(config.readTimeout, 60000);
  });

  await t.step("should allow all fields to be optional", () => {
    const config: ConnectionConfig = {};

    assertEquals(config.connectTimeout, undefined);
    assertEquals(config.readTimeout, undefined);
    assertEquals(config.keepAlive, undefined);
    assertEquals(config.noDelay, undefined);
  });
});
