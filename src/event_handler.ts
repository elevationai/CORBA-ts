/**
 * CORBA Event Handler - Simplified event listener registration
 */

import { getRootPOA, Servant } from "./poa.ts";
import type { POA } from "./poa.ts";
import type { CORBA } from "./types.ts";

/**
 * Generic event type that can be extended
 */
export interface Event {
  eventCode?: number;
  timestamp?: Date | string;
  data?: unknown;
  source?: string;
  [key: string]: unknown;
}

/**
 * Event callback function type
 */
export type EventCallback<T extends Event = Event> = (event: T) => void | Promise<void>;

/**
 * Event listener interface that servants must implement
 */
export interface EventListener extends CORBA.ObjectRef {
  callback(e: Event): Promise<void>;
}

/**
 * Internal servant implementation for event handling
 */
class EventListenerServant extends Servant {
  private readonly repositoryId: string;
  private readonly callbackFn: EventCallback;

  constructor(repositoryId: string, callback: EventCallback) {
    super();
    this.repositoryId = repositoryId;
    this.callbackFn = callback;
  }

  override _repository_id(): string {
    return this.repositoryId;
  }

  async callback(e: Event): Promise<void> {
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
export class EventHandler<T extends Event = Event> {
  /**
   * Create and activate an event handler, returning just the CORBA reference
   */
  static create: <T extends Event = Event>(
    appRef: string,
    callback: EventCallback<T>,
    repositoryId?: string,
  ) => Promise<EventListener>;
  private servant: EventListenerServant;
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
    this.servant = new EventListenerServant(repositoryId, this.callback as EventCallback);
  }

  /**
   * Activate the event handler and get its CORBA reference
   * This method is idempotent - calling it multiple times returns the same reference
   */
  async activate(): Promise<EventListener> {
    if (!this.activated) {
      // Activate the servant with the POA
      this.objectId = await this.poa.activate_object(this.servant);
      this.reference = await this.poa.servant_to_reference(this.servant) as unknown as EventListener;
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
export function createEventHandler<T extends Event = Event>(
  appRef: string,
  callback: EventCallback<T>,
  repositoryId?: string,
): Promise<EventListener> {
  const handler = new EventHandler(appRef, callback, repositoryId);
  return handler.activate();
}

/**
 * Static factory method on EventHandler class for cleaner API
 * Creates and activates an event handler, returning just the CORBA reference
 */
EventHandler.create = function <T extends Event = Event>(
  appRef: string,
  callback: EventCallback<T>,
  repositoryId?: string,
): Promise<EventListener> {
  const handler = new EventHandler(appRef, callback, repositoryId);
  return handler.activate();
};
