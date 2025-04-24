/**
 * Simple event system for device communication
 */

type EventCallback = (data: any) => void;

export class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map();

  /**
   * Register an event listener
   * @param event Event name
   * @param callback Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }

    this.events.get(event)!.add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Remove an event listener
   * @param event Event name
   * @param callback Function to remove
   */
  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.events.delete(event);
      }
    }
  }

  /**
   * Emit an event with data
   * @param event Event name
   * @param data Data to pass to listeners
   */
  emit(event: string, data?: any): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      }
    }
  }

  /**
   * Remove all event listeners
   * @param event Optional event name. If not provided, all events are cleared.
   */
  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}
