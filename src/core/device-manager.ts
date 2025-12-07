/**
 * Device Manager
 *
 * Central manager for all haptic devices.
 * Handles unified script loading and distribution to devices.
 */
import { EventEmitter } from "./events";
import {
  HapticDevice,
  ScriptData,
  ScriptOptions,
  ScriptLoadResult,
  Funscript,
} from "./device-interface";
import { loadScript } from "./script-loader";

/**
 * Device Manager class
 * Handles registration and control of multiple haptic devices
 */
export class DeviceManager extends EventEmitter {
  private devices: Map<string, HapticDevice> = new Map();
  private currentFunscript: Funscript | null = null;
  private currentScriptOptions: ScriptOptions | null = null;

  /**
   * Register a device with the manager
   * @param device Device to register
   */
  registerDevice(device: HapticDevice): void {
    if (this.devices.has(device.id)) {
      return;
    }

    this.devices.set(device.id, device);
    this.setupDeviceEventForwarding(device);
    this.emit("deviceAdded", device);

    // If we have a script loaded, prepare it on the new device
    if (this.currentFunscript) {
      device
        .prepareScript(
          this.currentFunscript,
          this.currentScriptOptions ?? undefined
        )
        .catch((error) => {
          console.error(
            `Error preparing script on newly registered device ${device.id}:`,
            error
          );
        });
    }
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
   * Get the currently loaded funscript
   */
  getCurrentFunscript(): Funscript | null {
    return this.currentFunscript;
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
   * Load a script - fetches, parses, and prepares on all connected devices
   *
   * This is the main entry point for loading scripts. It:
   * 1. Fetches and parses the script (once, centrally)
   * 2. Applies any transformations (inversion, sorting)
   * 3. Distributes to all connected devices
   * 4. Returns the funscript along with per-device results
   *
   * @param scriptData Script data to load (URL or content)
   * @param options Options for script loading (e.g., invertScript)
   * @returns ScriptLoadResult with funscript and per-device status
   */
  async loadScript(
    scriptData: ScriptData,
    options?: ScriptOptions
  ): Promise<ScriptLoadResult> {
    // Step 1: Fetch and parse the script centrally
    const loadResult = await loadScript(scriptData, options);

    if (!loadResult.success || !loadResult.funscript) {
      return {
        success: false,
        funscript: null,
        error: loadResult.error,
        devices: {},
      };
    }

    // Store the loaded script
    this.currentFunscript = loadResult.funscript;
    this.currentScriptOptions = options ?? null;

    // Step 2: Prepare on all connected devices
    const deviceResults: Record<string, { success: boolean; error?: string }> =
      {};

    for (const [id, device] of this.devices.entries()) {
      // Only prepare on connected devices (or buttplug which manages its own connection)
      if (device.isConnected || device.id === "buttplug") {
        try {
          const result = await device.prepareScript(
            loadResult.funscript,
            options
          );
          deviceResults[id] = result;
        } catch (error) {
          console.error(`Error preparing script on device ${id}:`, error);
          deviceResults[id] = {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      } else {
        deviceResults[id] = {
          success: false,
          error: "Device not connected",
        };
      }
    }

    // Emit event
    this.emit("scriptLoaded", {
      funscript: loadResult.funscript,
      devices: deviceResults,
    });

    return {
      success: true,
      funscript: loadResult.funscript,
      devices: deviceResults,
    };
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
   * Clear the currently loaded script
   */
  clearScript(): void {
    this.currentFunscript = null;
    this.currentScriptOptions = null;
  }

  /**
   * Set up event forwarding from a device to the manager
   * @param device Device to forward events from
   */
  private setupDeviceEventForwarding(device: HapticDevice): void {
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
        this.emit(`device:${eventName}`, { deviceId: device.id, data });
      });
    }
  }
}
