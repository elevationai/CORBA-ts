/**
 * CORBA Naming Service Server/Daemon
 * Provides a standalone naming service that can be run as a daemon process
 */

import { CORBA } from "./types.ts";
import { ORBImpl } from "./orb.ts";
import { GIOPTransport } from "./giop/transport.ts";
import { GIOPReply, GIOPRequest } from "./giop/messages.ts";
import { ReplyStatusType } from "./giop/types.ts";
import { ConnectionEndpoint } from "./giop/connection.ts";
import { IORUtil } from "./giop/ior.ts";
import { NameUtil, NamingContextExt, NamingContextExtImpl } from "./naming.ts";

/**
 * Configuration for the naming service server
 */
export interface NamingServerConfig {
  /** Host to bind the server to */
  host: string;
  /** Port to bind the server to */
  port: number;
  /** Enable persistent storage */
  persistent?: boolean;
  /** File path for persistent storage */
  persistentFile?: string;
  /** Enable logging */
  enableLogging?: boolean;
  /** Maximum number of concurrent connections */
  maxConnections?: number;
}

/**
 * Default configuration for the naming service server
 */
export const DEFAULT_CONFIG: NamingServerConfig = {
  host: "localhost",
  port: 2809, // Standard CORBA naming service port
  persistent: false,
  enableLogging: true,
  maxConnections: 100,
};

/**
 * CORBA Naming Service Server
 */
export class NamingServer {
  private _config: NamingServerConfig;
  private _orb: ORBImpl;
  private _transport: GIOPTransport;
  private _rootContext: NamingContextExt;
  private _running = false;
  private _server: {
    start(): Promise<void>;
    stop(): Promise<void>;
    registerHandler(op: string, handler: (req: GIOPRequest) => Promise<GIOPReply>): void;
  } | null = null;

  constructor(config: Partial<NamingServerConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._orb = new ORBImpl("naming-server");
    this._transport = new GIOPTransport();
    this._rootContext = new NamingContextExtImpl();
  }

  /**
   * Start the naming service server
   */
  async start(): Promise<void> {
    if (this._running) {
      throw new CORBA.BAD_PARAM("Server is already running");
    }

    try {
      // Initialize the ORB
      await this._orb.init();

      // Load persistent data if configured
      if (this._config.persistent && this._config.persistentFile) {
        await this._loadPersistentData();
      }

      // Register the root naming context with the ORB
      await this._orb.register_initial_reference("NameService", this._rootContext);

      // Start the GIOP server
      const endpoint: ConnectionEndpoint = {
        host: this._config.host,
        port: this._config.port,
      };

      this._server = await this._transport.startServer(endpoint);
      this._setupRequestHandlers();
      await this._server.start();

      this._running = true;

      if (this._config.enableLogging) {
        console.log(`Naming Service started on ${this._config.host}:${this._config.port}`);
        console.log(`Root context IOR: ${this._getIORString()}`);
      }
    } catch (error) {
      this._running = false;
      throw new CORBA.INTERNAL(`Failed to start naming server: ${error}`);
    }
  }

  /**
   * Stop the naming service server
   */
  async stop(): Promise<void> {
    if (!this._running) {
      return;
    }

    try {
      // Save persistent data if configured
      if (this._config.persistent && this._config.persistentFile) {
        await this._savePersistentData();
      }

      // Stop the GIOP server
      if (this._server) {
        await this._server.stop();
      }

      // Shutdown the ORB
      await this._orb.shutdown(true);

      this._running = false;

      if (this._config.enableLogging) {
        console.log("Naming Service stopped");
      }
    } catch (error) {
      if (this._config.enableLogging) {
        console.error(`Error stopping naming server: ${error}`);
      }
    }
  }

  /**
   * Get the IOR string for the root naming context
   */
  getIOR(): string {
    return this._getIORString();
  }

  /**
   * Get the root naming context
   */
  getRootContext(): NamingContextExt {
    return this._rootContext;
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this._running;
  }

  /**
   * Get server statistics
   */
  getStatistics(): {
    isRunning: boolean;
    host: string;
    port: number;
    rootContextBindings: number;
    uptime: number;
  } {
    return {
      isRunning: this._running,
      host: this._config.host,
      port: this._config.port,
      rootContextBindings: (this._rootContext as unknown as { size(): number }).size(), // Access internal size method
      uptime: this._running ? Date.now() : 0, // Simplified uptime
    };
  }

  /**
   * Setup GIOP request handlers for naming service operations
   */
  private _setupRequestHandlers(): void {
    if (!this._server) return;

    // Handle bind operation
    this._server.registerHandler("bind", async (request: GIOPRequest) => {
      try {
        // Deserialize request parameters (simplified)
        const params = JSON.parse(new TextDecoder().decode(request.body));
        const name = params.name;
        const objRef = params.objRef;

        await this._rootContext.bind(name, objRef);

        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
        reply.body = new TextEncoder().encode("OK");
        return reply;
      } catch (error) {
        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.USER_EXCEPTION;
        reply.body = new TextEncoder().encode(JSON.stringify({ error: String(error) }));
        return reply;
      }
    });

    // Handle resolve operation
    this._server.registerHandler("resolve", async (request: GIOPRequest) => {
      try {
        const params = JSON.parse(new TextDecoder().decode(request.body));
        const name = params.name;

        const objRef = await this._rootContext.resolve(name);

        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
        reply.body = new TextEncoder().encode(JSON.stringify({ objRef }));
        return reply;
      } catch (error) {
        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.USER_EXCEPTION;
        reply.body = new TextEncoder().encode(JSON.stringify({ error: String(error) }));
        return reply;
      }
    });

    // Handle list operation
    this._server.registerHandler("list", async (request: GIOPRequest) => {
      try {
        const params = JSON.parse(new TextDecoder().decode(request.body));
        const howMany = params.howMany || 10;

        const result = await this._rootContext.list(howMany);

        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.NO_EXCEPTION;
        reply.body = new TextEncoder().encode(JSON.stringify(result));
        return reply;
      } catch (error) {
        const reply = new GIOPReply(request.version);
        reply.replyStatus = ReplyStatusType.USER_EXCEPTION;
        reply.body = new TextEncoder().encode(JSON.stringify({ error: String(error) }));
        return reply;
      }
    });
  }

  /**
   * Get the IOR string for the root context
   */
  private _getIORString(): string {
    const ior = IORUtil.createSimpleIOR(
      "IDL:omg.org/CosNaming/NamingContextExt:1.0",
      this._config.host,
      this._config.port,
      new TextEncoder().encode("NameService"),
    );

    return IORUtil.toString(ior);
  }

  /**
   * Load persistent naming data from file
   */
  private async _loadPersistentData(): Promise<void> {
    if (!this._config.persistentFile) return;

    try {
      const data = await Deno.readTextFile(this._config.persistentFile);
      const bindings = JSON.parse(data);

      // Restore bindings to the root context
      // This is a simplified implementation
      for (const binding of bindings) {
        try {
          const name = NameUtil.createSimpleName(binding.name.id, binding.name.kind);
          // Would need to deserialize the object reference properly
          await this._rootContext.bind(name, binding.objRef);
        } catch (error) {
          if (this._config.enableLogging) {
            console.warn(`Failed to restore binding: ${error}`);
          }
        }
      }

      if (this._config.enableLogging) {
        console.log(`Loaded ${bindings.length} persistent bindings`);
      }
    } catch (error) {
      if (this._config.enableLogging) {
        console.warn(`Failed to load persistent data: ${error}`);
      }
    }
  }

  /**
   * Save persistent naming data to file
   */
  private async _savePersistentData(): Promise<void> {
    if (!this._config.persistentFile) return;

    try {
      const result = await this._rootContext.list(1000); // Get all bindings
      const bindings = result.bl;

      const data = JSON.stringify(bindings, null, 2);
      await Deno.writeTextFile(this._config.persistentFile, data);

      if (this._config.enableLogging) {
        console.log(`Saved ${bindings.length} persistent bindings`);
      }
    } catch (error) {
      if (this._config.enableLogging) {
        console.error(`Failed to save persistent data: ${error}`);
      }
    }
  }
}

/**
 * Command-line interface for the naming service server
 */
export class NamingServerCLI {
  /**
   * Run the naming service server from command line
   */
  static async run(args: string[] = Deno.args): Promise<void> {
    const config = this._parseArgs(args);
    const server = new NamingServer(config);

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("Shutting down naming service...");
      await server.stop();
      Deno.exit(0);
    };

    // Setup signal handlers
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGINT", shutdown);
      Deno.addSignalListener("SIGTERM", shutdown);
    }

    try {
      await server.start();

      // Keep the server running
      while (server.isRunning()) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`Failed to start naming service: ${error}`);
      Deno.exit(1);
    }
  }

  /**
   * Parse command line arguments
   */
  private static _parseArgs(args: string[]): Partial<NamingServerConfig> {
    const config: Partial<NamingServerConfig> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case "--host":
        case "-h":
          config.host = args[++i];
          break;
        case "--port":
        case "-p":
          config.port = parseInt(args[++i]);
          break;
        case "--persistent":
          config.persistent = true;
          break;
        case "--persistent-file":
          config.persistentFile = args[++i];
          break;
        case "--no-logging":
          config.enableLogging = false;
          break;
        case "--max-connections":
          config.maxConnections = parseInt(args[++i]);
          break;
        case "--help":
          this._printHelp();
          Deno.exit(0);
          break;
      }
    }

    return config;
  }

  /**
   * Print help information
   */
  private static _printHelp(): void {
    console.log(`CORBA Naming Service Server

Usage: deno run --allow-net --allow-read --allow-write naming_server.ts [options]

Options:
  --host, -h <host>           Host to bind to (default: localhost)
  --port, -p <port>           Port to bind to (default: 2809)
  --persistent                Enable persistent storage
  --persistent-file <file>    File for persistent storage
  --no-logging               Disable logging
  --max-connections <num>     Maximum concurrent connections
  --help                     Show this help message
`);
  }
}
