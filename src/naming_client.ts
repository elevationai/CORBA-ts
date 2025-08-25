/**
 * CORBA Naming Service Client Utilities
 * High-level client utilities for working with the CORBA Naming Service
 */

import { CORBA } from "./types.ts";
import { ORB, ORB_instance } from "./orb.ts";
import { CosNaming, Name, NameComponent, NamingContext, NamingContextExt } from "./naming.ts";
import { ProxyFactory } from "./proxy.ts";

/**
 * Configuration for the naming client
 */
export interface NamingClientConfig {
  /** ORB instance to use */
  orb?: ORB;
  /** IOR of the naming service */
  namingServiceIOR?: string;
  /** Host and port of naming service (alternative to IOR) */
  namingServiceEndpoint?: { host: string; port: number };
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Number of retries for failed operations */
  retries?: number;
}

/**
 * High-level client for the CORBA Naming Service
 */
export class NamingClient {
  private _orb: ORB;
  private _rootContext: NamingContextExt | null = null;
  private _proxyFactory: ProxyFactory;
  private _config: Required<
    Omit<NamingClientConfig, "orb" | "namingServiceIOR" | "namingServiceEndpoint">
  >;

  constructor(config: NamingClientConfig) {
    this._orb = config.orb || ORB_instance();
    this._proxyFactory = new ProxyFactory(this._orb);
    this._config = {
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
    };
  }

  /**
   * Connect to the naming service
   */
  async connect(ior?: string): Promise<void> {
    const namingIOR = ior || await this._resolveNamingServiceIOR();

    if (!namingIOR) {
      throw new CORBA.BAD_PARAM("No naming service IOR provided or found");
    }

    try {
      const objRef = await this._orb.string_to_object(namingIOR);

      // Create a proxy for the NamingContextExt interface
      this._rootContext = this._proxyFactory.createProxy<NamingContextExt>(
        objRef,
        [
          "bind",
          "bind_context",
          "rebind",
          "rebind_context",
          "resolve",
          "unbind",
          "new_context",
          "bind_new_context",
          "destroy",
          "list",
          "to_name",
          "to_string",
          "to_url",
          "resolve_str",
        ],
      );

      // Verify connection by calling _is_a
      const isNamingContext = await this._rootContext._is_a!(
        "IDL:omg.org/CosNaming/NamingContextExt:1.0",
      );
      if (!isNamingContext) {
        throw new CORBA.BAD_PARAM("Object is not a NamingContextExt");
      }
    } catch (error) {
      throw new CORBA.COMM_FAILURE(`Failed to connect to naming service: ${error}`);
    }
  }

  /**
   * Disconnect from the naming service
   */
  disconnect(): void {
    this._rootContext = null;
  }

  /**
   * Check if connected to naming service
   */
  isConnected(): boolean {
    return this._rootContext !== null;
  }

  /**
   * Bind an object to a name
   */
  async bind(name: string | Name, object: CORBA.ObjectRef): Promise<void> {
    this._ensureConnected();

    const nameObj = typeof name === "string" ? await this._rootContext!.to_name(name) : name;

    await this._rootContext!.bind(nameObj, object);
  }

  /**
   * Bind a naming context to a name
   */
  async bindContext(name: string | Name, context: NamingContext): Promise<void> {
    this._ensureConnected();

    const nameObj = typeof name === "string" ? await this._rootContext!.to_name(name) : name;

    await this._rootContext!.bind_context(nameObj, context);
  }

  /**
   * Resolve a name to an object reference
   */
  async resolve(name: string | Name): Promise<CORBA.ObjectRef> {
    this._ensureConnected();

    if (typeof name === "string") {
      return await this._rootContext!.resolve_str(name);
    } else {
      return await this._rootContext!.resolve(name);
    }
  }

  /**
   * Resolve and create a proxy for an object
   */
  async resolveProxy<T extends object>(
    name: string | Name,
    interfaceMethods: string[],
  ): Promise<T> {
    const objRef = await this.resolve(name);
    return this._proxyFactory.createProxy<T>(objRef, interfaceMethods);
  }

  /**
   * Unbind a name
   */
  async unbind(name: string | Name): Promise<void> {
    this._ensureConnected();

    const nameObj = typeof name === "string" ? await this._rootContext!.to_name(name) : name;

    await this._rootContext!.unbind(nameObj);
  }

  /**
   * List bindings in the root context
   */
  async list(maxCount: number = 10): Promise<Array<{ name: Name; isContext: boolean }>> {
    this._ensureConnected();

    const result = await this._rootContext!.list(maxCount);
    const bindings = result.bl;

    return bindings.map((binding) => ({
      name: binding.binding_name,
      isContext: binding.binding_type === 1, // BindingType.ncontext
    }));
  }

  /**
   * Create a new naming context
   */
  async createContext(): Promise<NamingContext> {
    this._ensureConnected();
    return await this._rootContext!.new_context();
  }

  /**
   * Create and bind a new naming context
   */
  async createAndBindContext(name: string | Name): Promise<NamingContext> {
    this._ensureConnected();

    const nameObj = typeof name === "string" ? await this._rootContext!.to_name(name) : name;

    return await this._rootContext!.bind_new_context(nameObj);
  }

  /**
   * Check if a name exists
   */
  async exists(name: string | Name): Promise<boolean> {
    try {
      await this.resolve(name);
      return true;
    } catch (error) {
      if (error instanceof CosNaming.NotFound) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Walk a naming path and create missing contexts
   */
  async ensurePath(path: string | Name): Promise<NamingContext> {
    this._ensureConnected();

    const nameObj = typeof path === "string" ? await this._rootContext!.to_name(path) : path;

    let currentContext = this._rootContext!;

    for (let i = 0; i < nameObj.length - 1; i++) {
      const componentName = nameObj.slice(0, i + 1);

      try {
        const resolved = await currentContext.resolve(componentName);
        currentContext = resolved as NamingContextExt;
      } catch (error) {
        if (error instanceof CosNaming.NotFound) {
          // Create the missing context
          const newContext = await currentContext.new_context();
          await currentContext.bind_context([nameObj[i]], newContext);
          currentContext = newContext as NamingContextExt;
        } else {
          throw error;
        }
      }
    }

    return currentContext;
  }

  /**
   * Get the root naming context
   */
  getRootContext(): NamingContextExt {
    this._ensureConnected();
    return this._rootContext!;
  }

  /**
   * Convert a string name to Name object
   */
  async stringToName(stringName: string): Promise<Name> {
    this._ensureConnected();
    return await this._rootContext!.to_name(stringName);
  }

  /**
   * Convert a Name object to string
   */
  async nameToString(name: Name): Promise<string> {
    this._ensureConnected();
    return await this._rootContext!.to_string(name);
  }

  /**
   * Create a corbaname URL
   */
  async createURL(address: string, name: string | Name): Promise<string> {
    this._ensureConnected();

    const nameStr = typeof name === "string" ? name : await this._rootContext!.to_string(name);

    return await this._rootContext!.to_url(address, nameStr);
  }

  /**
   * Ensure we're connected to the naming service
   */
  private _ensureConnected(): void {
    if (!this._rootContext) {
      throw new BAD_INV_ORDER("Not connected to naming service. Call connect() first.");
    }
  }

  /**
   * Resolve the naming service IOR from various sources
   */
  private async _resolveNamingServiceIOR(): Promise<string | null> {
    // Try to get from ORB's initial references
    try {
      const nameService = await this._orb.resolve_initial_references("NameService");
      return await this._orb.object_to_string(nameService);
    } catch {
      // Ignore error and continue
    }

    // Try environment variable
    const envIOR = Deno.env.get("CORBA_NAMESERVICE_IOR");
    if (envIOR) {
      return envIOR;
    }

    // Try reading from file
    try {
      const iorFile = Deno.env.get("CORBA_NAMESERVICE_IOR_FILE") || "/tmp/nameservice.ior";
      return await Deno.readTextFile(iorFile);
    } catch {
      // Ignore error
    }

    return null;
  }
}

/**
 * Naming service utilities and helper functions
 */
export class NamingUtils {
  /**
   * Parse a corbaname URL
   */
  static parseCorbaNameURL(url: string): { address: string; name: string } | null {
    const match = url.match(/^corbaname:(.+)#(.+)$/);
    if (!match) return null;

    return {
      address: match[1],
      name: decodeURIComponent(match[2]),
    };
  }

  /**
   * Create a simple naming client from IOR string
   */
  static async createClient(ior: string, orb?: ORB): Promise<NamingClient> {
    const client = new NamingClient({ orb });
    await client.connect(ior);
    return client;
  }

  /**
   * Create a simple naming client from host/port
   */
  static createClientFromEndpoint(
    _host: string,
    _port: number,
    _orb?: ORB,
  ): Promise<NamingClient> {
    // This would need IOR construction from endpoint
    // For now, throw not implemented
    throw new CORBA.NO_IMPLEMENT("createClientFromEndpoint not yet implemented");
  }

  /**
   * Parse a stringified name into components
   */
  static parseStringName(stringName: string): Name {
    // Simple parsing - in practice would use the NamingContextExt.to_name method
    const components = stringName.split("/");
    return components.map((component) => {
      const lastDot = component.lastIndexOf(".");
      if (lastDot === -1) {
        return { id: component, kind: "" };
      }
      return {
        id: component.substring(0, lastDot),
        kind: component.substring(lastDot + 1),
      };
    });
  }

  /**
   * Format a name for display
   */
  static formatName(name: Name): string {
    return name.map((component) => {
      if (component.kind) {
        return `${component.id}.${component.kind}`;
      }
      return component.id;
    }).join("/");
  }

  /**
   * Validate a naming service IOR
   */
  static validateIOR(ior: string): boolean {
    try {
      // Basic IOR format validation
      return ior.startsWith("IOR:") && ior.length > 4;
    } catch {
      return false;
    }
  }
}

/**
 * Simple name builder helper
 */
export class NameBuilder {
  private _components: NameComponent[] = [];

  /**
   * Add a component to the name
   */
  add(id: string, kind: string = ""): NameBuilder {
    this._components.push({ id, kind });
    return this;
  }

  /**
   * Build the final name
   */
  build(): Name {
    return [...this._components];
  }

  /**
   * Clear all components
   */
  clear(): NameBuilder {
    this._components = [];
    return this;
  }

  /**
   * Get the current length
   */
  length(): number {
    return this._components.length;
  }

  /**
   * Create a name builder from a string path
   */
  static fromString(path: string): NameBuilder {
    const builder = new NameBuilder();
    const components = path.split("/").filter((c) => c.length > 0);

    for (const component of components) {
      const lastDot = component.lastIndexOf(".");
      if (lastDot === -1) {
        builder.add(component);
      } else {
        builder.add(component.substring(0, lastDot), component.substring(lastDot + 1));
      }
    }

    return builder;
  }
}

/**
 * Extended CORBA system exception for naming operations
 */
class BAD_INV_ORDER extends CORBA.SystemException {
  constructor(message: string) {
    super(message);
    this.name = "CORBA.BAD_INV_ORDER";
  }
}
