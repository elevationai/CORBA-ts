/**
 * CORBA Event Handler - Simplified event listener registration
 */

import { getRootPOA, Servant } from "./poa.ts";
import type { POA } from "./poa.ts";
import type { CORBA } from "./types.ts";

/**
 * Event callback function type - fully generic
 */
export type EventCallback<T = unknown> = (event: T) => void | Promise<void>;

/**
 * Event listener interface that servants must implement
 */
export interface EventListener extends CORBA.ObjectRef {
  callback(e: unknown): Promise<void>;
  dispose(): Promise<void>;
}

/**
 * Internal servant implementation for event handling
 */
class EventListenerServant<T = unknown> extends Servant {
  private readonly repositoryId: string;
  private readonly callbackFn: EventCallback<T>;

  constructor(repositoryId: string, callback: EventCallback<T>) {
    super();
    this.repositoryId = repositoryId;
    this.callbackFn = callback;
  }

  override _repository_id(): string {
    return this.repositoryId;
  }

  override _is_a(repositoryId: string): boolean {
    return repositoryId === this.repositoryId ||
      repositoryId === "IDL:omg.org/CORBA/Object:1.0" ||
      super._is_a(repositoryId);
  }

  async callback(e: T): Promise<void> {
    try {
      const result = this.callbackFn(e);
      if (result instanceof Promise) {
        await result;
      }
    }
    catch (error) {
      console.error("Error in event callback:", error);
      throw error;
    }
  }
}

/**
 * EventHandler - Simplified event listener registration for CORBA
 */
export class EventHandler<T = unknown> {
  /**
   * Create and activate an event handler, returning just the CORBA reference
   */
  static create: <T = unknown>(
    appRef: string,
    callback: EventCallback<T>,
    repositoryId?: string,
  ) => Promise<EventListener>;
  private servant: EventListenerServant<T>;
  private reference: EventListener | null = null;
  private objectId: Uint8Array | null = null;
  private poa: POA;
  private readonly appRef: string;
  private readonly callback: EventCallback<T>;
  private readonly repositoryId: string;
  private activated = false;

  /**
   * Create a new EventHandler
   * @param appRef - Application reference/token
   * @param callback - Function to call when events are received
   * @param repositoryId - Optional repository ID (defaults to standard event listener ID)
   */
  constructor(
    appRef: string,
    callback: EventCallback<T>,
    repositoryId: string = "IDL:cuss.iata.org/types/evtListener:1.0",
  ) {
    this.appRef = appRef;
    this.callback = callback;
    this.repositoryId = repositoryId;
    this.poa = getRootPOA();
    this.servant = new EventListenerServant(repositoryId, this.callback);
  }

  /**
   * Activate the event handler and get its CORBA reference
   * This method is idempotent - calling it multiple times returns the same reference
   */
  async activate(): Promise<EventListener> {
    if (!this.activated) {
      this.objectId = await this.poa.activate_object(this.servant);
      const ref = await this.poa.servant_to_reference(this.servant) as unknown as EventListener;
      this.reference = {
        ...ref,
        dispose: async () => {
          await this.deactivate();
        },
      };
      this.activated = true;
    }

    if (!this.reference) {
      throw new Error("Failed to activate event handler");
    }

    return this.reference;
  }

  /**
   * Get the CORBA object reference for this event handler
   * Automatically activates if not already activated
   */
  getReference(): Promise<EventListener> {
    return this.activate();
  }

  /**
   * Deactivate the event handler
   * After calling this, the handler cannot receive events
   */
  async deactivate(): Promise<void> {
    if (this.activated && this.objectId) {
      await this.poa.deactivate_object(this.objectId);
      this.activated = false;
      this.reference = null;
      this.objectId = null;
    }
  }

  /**
   * Check if the handler is currently activated
   */
  isActivated(): boolean {
    return this.activated;
  }

  /**
   * Get the application reference this handler was created with
   */
  getAppRef(): string {
    return this.appRef;
  }

  /**
   * Get the repository ID for this handler
   */
  getRepositoryId(): string {
    return this.repositoryId;
  }
}

/**
 * Helper function to create and activate an event handler in one step
 */
export function createEventHandler<T = unknown>(
  appRef: string,
  callback: EventCallback<T>,
  repositoryId?: string,
): Promise<EventListener> {
  const handler = new EventHandler(appRef, callback, repositoryId);
  return handler.activate();
}

/**
 * Static factory method on EventHandler class for cleaner API
 * Creates and activates an event handler, returning a wrapper with both CORBA reference and dispose method
 */
EventHandler.create = function <T = unknown>(
  appRef: string,
  callback: EventCallback<T>,
  repositoryId?: string,
): Promise<EventListener> {
  const handler = new EventHandler(appRef, callback, repositoryId);
  return handler.activate();
};
