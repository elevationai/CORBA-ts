/**
 * CORBA Object Proxies
 * Dynamic proxy objects that intercept method calls and translate them to CORBA invocations
 */

import { CORBA } from "./types.ts";
import { ORB } from "./orb.ts";
import { IOR } from "./giop/types.ts";
import { CDROutputStream } from "./core/cdr/encoder.ts";
import { encodeWithTypeCode } from "./core/cdr/typecode-encoder.ts";
import { inferTypeCode } from "./typecode.ts";

/**
 * Proxy configuration options
 */
export interface ProxyConfig {
  timeout?: number;
  retries?: number;
  oneway_operations?: string[];
}

/**
 * Method invocation metadata
 */
export interface MethodInfo {
  operation: string;
  isOneway: boolean;
  parameterTypes?: string[];
  returnType?: string;
}

/**
 * CORBA object proxy that implements dynamic method interception
 */
export class CORBAProxy {
  private _orb: ORB;
  private _objRef: CORBA.ObjectRef;
  private _config: ProxyConfig;
  private _methods: Map<string, MethodInfo> = new Map();

  constructor(orb: ORB, objRef: CORBA.ObjectRef, config: ProxyConfig = {}) {
    this._orb = orb;
    this._objRef = objRef;
    this._config = {
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      oneway_operations: config.oneway_operations ?? [],
    };
  }

  /**
   * Register method metadata
   */
  registerMethod(methodName: string, info: MethodInfo): void {
    this._methods.set(methodName, info);
  }

  /**
   * Create a proxy object with the specified interface
   */
  createProxy<T extends object = Record<string, unknown>>(interfaceMethods: string[]): T {
    // Register methods
    for (const method of interfaceMethods) {
      if (!this._methods.has(method)) {
        this.registerMethod(method, {
          operation: method,
          isOneway: this._config.oneway_operations?.includes(method) ?? false,
        });
      }
    }

    // Create proxy using JavaScript Proxy
    return new Proxy({} as T, {
      get: (_target, prop) => {
        const methodName = prop.toString();

        // Handle special CORBA methods
        if (methodName.startsWith("_")) {
          return this._handleSpecialMethod(methodName);
        }

        // Handle regular methods
        if (this._methods.has(methodName)) {
          return (...args: unknown[]) => this._invokeMethod(methodName, args);
        }

        // Return undefined for unknown properties
        return undefined;
      },

      has: (_target, prop) => {
        const methodName = prop.toString();
        return this._methods.has(methodName) || methodName.startsWith("_");
      },

      ownKeys: (_target) => {
        return Array.from(this._methods.keys());
      },

      getOwnPropertyDescriptor: (_target, prop) => {
        const methodName = prop.toString();
        if (this._methods.has(methodName) || methodName.startsWith("_")) {
          return {
            enumerable: true,
            configurable: true,
            value: this._methods.has(methodName)
              ? (...args: unknown[]) => this._invokeMethod(methodName, args)
              : this._handleSpecialMethod(methodName),
          };
        }
        return undefined;
      },
    });
  }

  /**
   * Handle special CORBA methods like _is_a, _hash, etc.
   */
  private _handleSpecialMethod(methodName: string): unknown {
    switch (methodName) {
      case "_is_a":
        return async (repositoryId: string): Promise<boolean> => {
          return await this._objRef._is_a?.(repositoryId) ?? false;
        };

      case "_hash":
        return (maximum: number): number => {
          return this._objRef._hash?.(maximum) ?? 0;
        };

      case "_is_equivalent":
        return (other: CORBA.ObjectRef): boolean => {
          return this._objRef._is_equivalent?.(other) ?? false;
        };

      case "_non_existent":
        return async (): Promise<boolean> => {
          return await this._objRef._non_existent?.() ?? false;
        };

      case "_get_interface_def":
        return (): Promise<CORBA.ObjectRef> => {
          // Would return Interface Repository definition
          return Promise.reject(new CORBA.NO_IMPLEMENT("_get_interface_def not implemented"));
        };

      case "_repository_id":
        return (): string => {
          const ior = (this._objRef as { _ior: IOR })._ior;
          return ior?.typeId || "";
        };

      default:
        return undefined;
    }
  }

  /**
   * Invoke a method on the remote object
   */
  private async _invokeMethod(methodName: string, args: unknown[]): Promise<unknown> {
    const methodInfo = this._methods.get(methodName);
    if (!methodInfo) {
      throw new CORBA.BAD_OPERATION(`Unknown method: ${methodName}`);
    }

    try {
      if (methodInfo.isOneway) {
        // Oneway call - no return value expected
        await this._invokeOneway(methodInfo.operation, args);
        return undefined;
      } else {
        // Regular call - wait for return value
        return await this._orb.invoke(this._objRef, methodInfo.operation, args);
      }
    } catch (error) {
      // Add method context to error
      if (error instanceof Error) {
        error.message = `Error invoking ${methodName}: ${error.message}`;
      }
      throw error;
    }
  }

  /**
   * Invoke a oneway method (no reply expected)
   */
  private async _invokeOneway(operation: string, args: unknown[]): Promise<void> {
    const ior = (this._objRef as { _ior: IOR })._ior;
    if (!ior) {
      throw new CORBA.BAD_PARAM("Object reference does not contain IOR");
    }

    // Properly encode arguments using TypeCode-aware CDR encoding
    const cdr = new CDROutputStream();

    for (const arg of args) {
      const tc = inferTypeCode(arg);
      encodeWithTypeCode(cdr, arg, tc);
    }

    const encodedArgs = cdr.getBuffer();

    // Get transport from ORB - use proper interface
    // deno-lint-ignore no-explicit-any
    const orbInternal = this._orb as any;

    if (orbInternal._transport && typeof orbInternal._transport.sendOnewayRequest === "function") {
      // Use dedicated oneway method if available
      await orbInternal._transport.sendOnewayRequest(ior, operation, encodedArgs);
    } else {
      // Fallback: use regular invoke but don't wait for response
      // This works because oneway operations don't expect a reply
      try {
        await this._orb.invokeWithEncodedArgs(this._objRef, operation, encodedArgs);
      } catch (error) {
        // For oneway, we can ignore certain errors like connection closed after send
        if (!(error instanceof CORBA.COMM_FAILURE)) {
          throw error;
        }
      }
    }
  }
}

/**
 * Factory for creating CORBA object proxies
 */
export class ProxyFactory {
  private _orb: ORB;

  constructor(orb: ORB) {
    this._orb = orb;
  }

  /**
   * Create a proxy for a CORBA object reference
   */
  createProxy<T extends object = Record<string, unknown>>(
    objRef: CORBA.ObjectRef,
    interfaceMethods: string[],
    config: ProxyConfig = {},
  ): T {
    const proxy = new CORBAProxy(this._orb, objRef, config);
    return proxy.createProxy<T>(interfaceMethods);
  }

  /**
   * Create a proxy from an IOR string
   */
  async createProxyFromString<T extends object = Record<string, unknown>>(
    iorString: string,
    interfaceMethods: string[],
    config: ProxyConfig = {},
  ): Promise<T> {
    const objRef = await this._orb.string_to_object(iorString);
    return this.createProxy<T>(objRef, interfaceMethods, config);
  }
}

/**
 * Interface-specific proxy creators
 */
export class InterfaceProxyFactory<T extends object> {
  private _proxyFactory: ProxyFactory;
  private _interfaceMethods: string[];
  private _defaultConfig: ProxyConfig;

  constructor(
    proxyFactory: ProxyFactory,
    interfaceMethods: string[],
    defaultConfig: ProxyConfig = {},
  ) {
    this._proxyFactory = proxyFactory;
    this._interfaceMethods = interfaceMethods;
    this._defaultConfig = defaultConfig;
  }

  /**
   * Create a strongly-typed proxy
   */
  create(objRef: CORBA.ObjectRef, config?: ProxyConfig): T {
    const mergedConfig = { ...this._defaultConfig, ...config };
    return this._proxyFactory.createProxy<T>(objRef, this._interfaceMethods, mergedConfig);
  }

  /**
   * Create a proxy from IOR string
   */
  createFromString(iorString: string, config?: ProxyConfig): Promise<T> {
    const mergedConfig = { ...this._defaultConfig, ...config };
    return this._proxyFactory.createProxyFromString<T>(
      iorString,
      this._interfaceMethods,
      mergedConfig,
    );
  }
}

/**
 * Utility functions for working with proxies
 */
export class ProxyUtil {
  /**
   * Check if an object is a CORBA proxy
   */
  static isProxy(obj: unknown): boolean {
    // Check if object has CORBA-specific methods
    const proxy = obj as { _is_a?: unknown; _hash?: unknown };
    return !!(proxy && typeof proxy._is_a === "function" && typeof proxy._hash === "function");
  }

  /**
   * Extract the object reference from a proxy
   */
  static getObjectReference(_proxy: unknown): CORBA.ObjectRef | null {
    // This would need to be implemented based on how proxies store their object refs
    // For now, return null as we'd need to modify the proxy creation to store this
    return null;
  }

  /**
   * Get the repository ID from a proxy
   */
  static getRepositoryId(proxy: unknown): string {
    const p = proxy as { _repository_id?: () => string };
    if (p && typeof p._repository_id === "function") {
      return p._repository_id();
    }
    return "";
  }

  /**
   * Test if a proxy supports a specific interface
   */
  static async supportsInterface(proxy: unknown, repositoryId: string): Promise<boolean> {
    const p = proxy as { _is_a?: (repositoryId: string) => Promise<boolean> };
    if (p && typeof p._is_a === "function") {
      return await p._is_a(repositoryId);
    }
    return false;
  }
}
