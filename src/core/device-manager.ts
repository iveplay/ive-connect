/**
 * Device Manager
 *
 * Central manager for all haptic devices
 */
import { EventEmitter } from "./events";
import { HapticDevice, ScriptData } from "./device-interface";

/**
 * Device Manager class
 * Handles registration and control of multiple haptic devices
 */
export class DeviceManager extends EventEmitter {
  private devices: Map<string, HapticDevice> = new Map();
  private scriptData: ScriptData | null = null;

  /**
   * Register a device with the manager
   * @param device Device to register
   */
  registerDevice(device: HapticDevice): void {
    // Don't register the same device twice
    if (this.devices.has(device.id)) {
      return;
    }

    this.devices.set(device.id, device);

    // Forward events from this device
    this.setupDeviceEventForwarding(device);

    // Emit device added event
    this.emit("deviceAdded", device);
  }

  /**
   * Unregister a device from the manager
   * @param deviceId Device ID to unregister
   */
  unregisterDevice(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      this.devices.delete(deviceId);
      this.emit("deviceRemoved", device);
    }
  }

  /**
   * Get all registered devices
   */
  getDevices(): HapticDevice[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get a specific device by ID
   * @param deviceId Device ID to retrieve
   */
  getDevice(deviceId: string): HapticDevice | undefined {
    return this.devices.get(deviceId);
  }

  /**
   * Connect to all registered devices
   * @returns Object with success status for each device
   */
  async connectAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, device] of this.devices.entries()) {
      try {
        results[id] = await device.connect();
      } catch (error) {
        console.error(`Error connecting device ${id}:`, error);
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Disconnect from all registered devices
   * @returns Object with success status for each device
   */
  async disconnectAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, device] of this.devices.entries()) {
      try {
        results[id] = await device.disconnect();
      } catch (error) {
        console.error(`Error disconnecting device ${id}:`, error);
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Load a script to all connected devices
   * @param scriptData Script data to load
   * @returns Object with success status for each device
   */
  async loadScriptAll(
    scriptData: ScriptData
  ): Promise<Record<string, boolean | ScriptData>> {
    const results: Record<
      string,
      { success: boolean; scriptContent?: ScriptData }
    > = {};
    this.scriptData = scriptData;

    for (const [id, device] of this.devices.entries()) {
      if (device.isConnected || device.id === "buttplug") {
        try {
          results[id] = await device.loadScript(scriptData);
        } catch (error) {
          console.error(`Error loading script to device ${id}:`, error);
          results[id] = { success: false };
        }
      } else {
        results[id] = { success: false };
      }
    }

    const transformedResults: Record<string, boolean | ScriptData> = {};

    for (const [id, result] of Object.entries(results)) {
      if (result.scriptContent) {
        transformedResults["script"] = result.scriptContent;
      }
      transformedResults[id] = result.success;
    }

    return transformedResults;
  }

  /**
   * Start playback on all connected devices
   * @param timeMs Current time in milliseconds
   * @param playbackRate Playback rate (1.0 = normal speed)
   * @param loop Whether to loop the script
   * @returns Object with success status for each device
   */
  async playAll(
    timeMs: number,
    playbackRate: number = 1.0,
    loop: boolean = false
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, device] of this.devices.entries()) {
      if (device.isConnected) {
        try {
          results[id] = await device.play(timeMs, playbackRate, loop);
        } catch (error) {
          console.error(`Error playing on device ${id}:`, error);
          results[id] = false;
        }
      } else {
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Stop playback on all connected devices
   * @returns Object with success status for each device
   */
  async stopAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, device] of this.devices.entries()) {
      if (device.isConnected) {
        try {
          results[id] = await device.stop();
        } catch (error) {
          console.error(`Error stopping device ${id}:`, error);
          results[id] = false;
        }
      } else {
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Synchronize time on all connected and playing devices
   * @param timeMs Current time in milliseconds
   * @param filter Time filter for synchronization
   * @returns Object with success status for each device
   */
  async syncTimeAll(
    timeMs: number,
    filter: number = 0.5
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const [id, device] of this.devices.entries()) {
      if (device.isConnected && device.isPlaying) {
        try {
          results[id] = await device.syncTime(timeMs, filter);
        } catch (error) {
          console.error(`Error syncing time on device ${id}:`, error);
          results[id] = false;
        }
      } else {
        results[id] = false;
      }
    }

    return results;
  }

  /**
   * Set up event forwarding from a device to the manager
   * @param device Device to forward events from
   */
  private setupDeviceEventForwarding(device: HapticDevice): void {
    // Forward common events
    const eventsToForward = [
      "error",
      "connected",
      "disconnected",
      "connectionStateChanged",
      "playbackStateChanged",
      "scriptLoaded",
      "configChanged",
    ];

    for (const eventName of eventsToForward) {
      device.on(eventName, (data) => {
        this.emit(`device:${device.id}:${eventName}`, data);
        // Also emit a general event for any device
        this.emit(`device:${eventName}`, { deviceId: device.id, data });
      });
    }
  }
}
