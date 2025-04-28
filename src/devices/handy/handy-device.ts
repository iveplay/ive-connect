/**
 * Handy Device Implementation
 */
import {
  ConnectionState,
  DeviceCapability,
  DeviceInfo,
  HapticDevice,
  ScriptData,
} from "../../core/device-interface";
import { EventEmitter } from "../../core/events";
import { HandyApi, createHandyApi } from "./handy-api";
import { HandyDeviceInfo, HandySettings, HspState } from "./types";

/**
 * Default Handy configuration
 */
const DEFAULT_CONFIG: HandySettings = {
  id: "handy",
  name: "Handy",
  connectionKey: "",
  enabled: true,
  offset: 0,
  stroke: {
    min: 0,
    max: 1,
  },
};

/**
 * Handy configuration options
 */
export interface HandyConfig {
  connectionKey?: string;
  baseV3Url?: string;
  baseV2Url?: string;
  applicationId?: string;
}

/**
 * Handy device implementation
 */
export class HandyDevice extends EventEmitter implements HapticDevice {
  private _api: HandyApi;
  private _config: HandySettings;
  private _connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private _deviceInfo: HandyDeviceInfo | null = null;
  private _isPlaying: boolean = false;
  private _eventSource: EventSource | null = null;

  readonly id: string = "handy";
  readonly name: string = "Handy";
  readonly type: string = "handy";
  readonly capabilities: DeviceCapability[] = [
    DeviceCapability.LINEAR,
    DeviceCapability.STROKE,
  ];

  /**
   * Create a new Handy device instance
   * @param config Optional configuration
   */
  constructor(config?: HandyConfig) {
    super();

    this._config = { ...DEFAULT_CONFIG };

    // Set up configuration
    if (config?.connectionKey) {
      this._config.connectionKey = config.connectionKey;
    }

    // Create the API client
    this._api = createHandyApi(
      config?.baseV3Url || "https://www.handyfeeling.com/api/handy-rest/v3",
      config?.baseV2Url || "https://www.handyfeeling.com/api/hosting/v2",
      config?.applicationId || "12345",
      this._config.connectionKey
    );
  }

  /**
   * Get device connection state
   */
  get isConnected(): boolean {
    return this._connectionState === ConnectionState.CONNECTED;
  }

  /**
   * Get device playback state
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Connect to the device
   * @param config Optional configuration override
   */
  async connect(config?: Partial<HandySettings>): Promise<boolean> {
    try {
      // Update config if provided
      if (config) {
        this.updateConfig(config);
      }

      // Validate connection key
      if (
        !this._config.connectionKey ||
        this._config.connectionKey.length < 5
      ) {
        this.emit("error", "Connection key must be at least 5 characters");
        return false;
      }

      // Update connection state
      this._connectionState = ConnectionState.CONNECTING;
      this.emit("connectionStateChanged", this._connectionState);

      // Synchronize time
      await this._api.syncTime();

      // Create event source for server-sent events
      this._eventSource = this._api.createEventSource();

      // Set up event handlers
      this._setupEventHandlers();

      // Get initial device info
      const isConnected = await this._api.isConnected();
      if (isConnected) {
        this._deviceInfo = await this._api.getDeviceInfo();
        this._connectionState = ConnectionState.CONNECTED;
        this.emit("connectionStateChanged", this._connectionState);
        this.emit("connected", this._deviceInfo);

        // Get device settings after connection
        await this._loadDeviceSettings();

        return true;
      } else {
        this._connectionState = ConnectionState.DISCONNECTED;
        this.emit("connectionStateChanged", this._connectionState);
        this.emit("error", "Failed to connect to device");
        return false;
      }
    } catch (error) {
      console.error("Handy: Error connecting to device:", error);
      this._connectionState = ConnectionState.DISCONNECTED;
      this.emit("connectionStateChanged", this._connectionState);
      this.emit(
        "error",
        `Connection error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Disconnect from the device
   */
  async disconnect(): Promise<boolean> {
    try {
      // Stop playback if active
      if (this._isPlaying) {
        await this.stop();
      }

      // Close event source
      if (this._eventSource) {
        this._eventSource.close();
        this._eventSource = null;
      }

      // Update state immediately
      this._connectionState = ConnectionState.DISCONNECTED;
      this._deviceInfo = null;
      this._isPlaying = false;

      // Emit events
      this.emit("connectionStateChanged", this._connectionState);
      this.emit("disconnected");

      // Return true regardless of what happens with the API
      return true;
    } catch (error) {
      console.error("Handy: Error disconnecting device:", error);

      // Set disconnected state even in case of error
      this._connectionState = ConnectionState.DISCONNECTED;
      this._deviceInfo = null;
      this._isPlaying = false;

      // Emit events
      this.emit("connectionStateChanged", this._connectionState);
      this.emit("disconnected");

      return true; // Return true anyway for better UX
    }
  }

  /**
   * Get current device configuration
   */
  getConfig(): HandySettings {
    return { ...this._config };
  }

  /**
   * Update device configuration
   * @param config Partial configuration to update
   */
  async updateConfig(config: Partial<HandySettings>): Promise<boolean> {
    // Update local config
    if (config.connectionKey !== undefined) {
      this._config.connectionKey = config.connectionKey;
      this._api.setConnectionKey(config.connectionKey);
    }

    // Update offset if connected
    if (config.offset !== undefined && this.isConnected) {
      this._config.offset = config.offset;
      await this._api.setOffset(config.offset);
    } else if (config.offset !== undefined) {
      this._config.offset = config.offset;
    }

    // Update stroke settings if connected
    if (config.stroke !== undefined && this.isConnected) {
      this._config.stroke = { ...this._config.stroke, ...config.stroke };
      await this._api.setStrokeSettings(this._config.stroke);
    } else if (config.stroke !== undefined) {
      this._config.stroke = { ...this._config.stroke, ...config.stroke };
    }

    // Update other fields if present
    if (config.name !== undefined) {
      this._config.name = config.name;
    }

    if (config.enabled !== undefined) {
      this._config.enabled = config.enabled;
    }

    // Emit configuration changed event
    this.emit("configChanged", this._config);

    return true;
  }

  /**
   * Load a script for playback
   * @param scriptData Script data to load
   */
  async loadScript(scriptData: ScriptData): Promise<boolean> {
    if (!this.isConnected) {
      this.emit("error", "Cannot load script: Device not connected");
      return false;
    }

    try {
      let scriptUrl: string;

      // Handle script data based on type
      if (scriptData.url) {
        // If URL is provided, use it directly
        scriptUrl = scriptData.url;
      } else if (scriptData.content) {
        // If content is provided, upload it
        const blob = new Blob([JSON.stringify(scriptData.content)], {
          type: "application/json",
        });

        const uploadedUrl = await this._api.uploadScript(blob);
        if (!uploadedUrl) {
          this.emit("error", "Failed to upload script");
          return false;
        }

        scriptUrl = uploadedUrl;
      } else {
        this.emit(
          "error",
          "Invalid script data: Either URL or content must be provided"
        );
        return false;
      }

      // Set up the script with the device
      const success = await this._api.setupScript(scriptUrl);

      if (success) {
        this.emit("scriptLoaded", { url: scriptUrl });
        return true;
      } else {
        this.emit("error", "Failed to set up script with device");
        return false;
      }
    } catch (error) {
      console.error("Handy: Error loading script:", error);
      this.emit(
        "error",
        `Script loading error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Play the loaded script at the specified time
   * @param timeMs Current time in milliseconds
   * @param playbackRate Playback rate (1.0 = normal speed)
   * @param loop Whether to loop the script
   */
  async play(
    timeMs: number,
    playbackRate: number = 1.0,
    loop: boolean = false
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.emit("error", "Cannot play: Device not connected");
      return false;
    }

    try {
      const hspState = await this._api.play(timeMs, playbackRate, loop);

      if (hspState) {
        this._isPlaying =
          hspState.play_state === 1 || hspState.play_state === "1";

        // Sync immediately to ensure accurate timing
        await this._api.syncVideoTime(timeMs);

        this.emit("playbackStateChanged", {
          isPlaying: this._isPlaying,
          timeMs,
          playbackRate,
          loop,
        });

        return true;
      } else {
        this.emit("error", "Failed to start playback");
        return false;
      }
    } catch (error) {
      console.error("Handy: Error playing script:", error);
      this.emit(
        "error",
        `Playback error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Stop playback
   */
  async stop(): Promise<boolean> {
    if (!this.isConnected) {
      this.emit("error", "Cannot stop: Device not connected");
      return false;
    }

    try {
      const hspState = await this._api.stop();

      if (hspState) {
        this._isPlaying =
          hspState.play_state === 1 || hspState.play_state === "1";

        this.emit("playbackStateChanged", {
          isPlaying: this._isPlaying,
        });

        return true;
      } else {
        this.emit("error", "Failed to stop playback");
        return false;
      }
    } catch (error) {
      console.error("Handy: Error stopping script:", error);
      this.emit(
        "error",
        `Stop playback error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /**
   * Synchronize device time with provided time
   * @param timeMs Current time in milliseconds
   */
  async syncTime(timeMs: number): Promise<boolean> {
    if (!this.isConnected || !this._isPlaying) {
      return false;
    }

    try {
      return await this._api.syncVideoTime(timeMs);
    } catch (error) {
      console.error("Handy: Error syncing time:", error);
      return false;
    }
  }

  /**
   * Get device-specific information
   */
  getDeviceInfo(): DeviceInfo | null {
    if (!this._deviceInfo) return null;

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      firmware: this._deviceInfo.fw_version,
      hardware: this._deviceInfo.hw_model_name,
      sessionId: this._deviceInfo.session_id,
      ...this._deviceInfo,
    };
  }

  /**
   * Set up event handlers for the device
   */
  private _setupEventHandlers(): void {
    if (!this._eventSource) return;

    this._eventSource.onerror = (error) => {
      console.error("EventSource error:", error);
      this.emit("error", "Connection to device lost");
    };

    this._eventSource.addEventListener("device_status", (event) => {
      const data = JSON.parse(event.data);
      this._deviceInfo = data.data.info;
      const connected = data.data.connected;

      if (connected && this._connectionState !== ConnectionState.CONNECTED) {
        this._connectionState = ConnectionState.CONNECTED;
        this.emit("connectionStateChanged", this._connectionState);
        this.emit("connected", this._deviceInfo);
      } else if (
        !connected &&
        this._connectionState === ConnectionState.CONNECTED
      ) {
        this._connectionState = ConnectionState.DISCONNECTED;
        this.emit("connectionStateChanged", this._connectionState);
        this.emit("disconnected");
      }
    });

    this._eventSource.addEventListener("device_connected", (event) => {
      const data = JSON.parse(event.data);
      this._deviceInfo = data.data.info;
      this._connectionState = ConnectionState.CONNECTED;
      this.emit("connectionStateChanged", this._connectionState);
      this.emit("connected", this._deviceInfo);
    });

    this._eventSource.addEventListener("device_disconnected", (event) => {
      this._connectionState = ConnectionState.DISCONNECTED;
      this.emit("connectionStateChanged", this._connectionState);
      this.emit("disconnected");
    });

    this._eventSource.addEventListener("mode_changed", (event) => {
      this._isPlaying = false;
      this.emit("playbackStateChanged", { isPlaying: false });
    });

    this._eventSource.addEventListener("hsp_state_changed", (event) => {
      const data = JSON.parse(event.data);
      // Set isPlaying based on play_state
      this._isPlaying =
        data.data.data?.play_state === 1 || data.data.data?.play_state === "1";
      this.emit("playbackStateChanged", { isPlaying: this._isPlaying });
    });
  }

  /**
   * Load device settings after connection
   */
  private async _loadDeviceSettings(): Promise<void> {
    if (!this.isConnected) return;

    try {
      // Get device offset
      const offset = await this._api.getOffset();
      if (offset !== undefined) {
        this._config.offset = offset;
      }

      // Get stroke settings
      const strokeSettings = await this._api.getStrokeSettings();
      if (strokeSettings) {
        this._config.stroke = {
          min: strokeSettings.min,
          max: strokeSettings.max,
        };
      }

      // Emit config updated event
      this.emit("configChanged", this._config);
    } catch (error) {
      console.error("Handy: Error loading device settings:", error);
    }
  }
}
