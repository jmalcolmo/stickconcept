import type { GameEvent, EventType, EventOf } from "./types";

type Handler<T extends EventType> = (e: EventOf<T>) => void;

/**
 * A tiny typed publish/subscribe bus. This is the decoupling layer that lets a
 * mode react to "a ball entered a goal zone" without ever touching the physics
 * code that detected it.
 */
export class EventBus {
  private handlers = new Map<EventType, Set<(e: GameEvent) => void>>();

  /** Subscribe to one event type. Returns an unsubscribe function. */
  on<T extends EventType>(type: T, fn: Handler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const wrapped = fn as (e: GameEvent) => void;
    set.add(wrapped);
    return () => set!.delete(wrapped);
  }

  emit(event: GameEvent): void {
    const set = this.handlers.get(event.type);
    if (!set) return;
    // Copy so a handler that unsubscribes mid-dispatch can't corrupt iteration.
    for (const fn of [...set]) fn(event);
  }

  /** Drop every subscription. Called when a mode unloads. */
  clear(): void {
    this.handlers.clear();
  }
}
