/**
 * Core interfaces for haptic devices
 */

/**
 * The connection state of a device
 */
export enum ConnectionState {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
}

/**
 * Common device capabilities
 */
export enum DeviceCapability {
  VIBRATE = "vibrate",
  ROTATE = "rotate",
  LINEAR = "linear",
  STROKE = "stroke", // Specific to linear stroking devices like Handy
}

/**
 * Generic device information
 */
export interface DeviceInfo {
  id: string; // Unique device identifier
  name: string; // Human-readable device name
  type: string; // Device type identifier (e.g., "handy", "buttplug")
  firmware?: string; // Firmware version if available
  hardware?: string; // Hardware version if available
  [key: string]: any; // Additional device-specific information
}

/**
 * Device settings interface
 * Base interface for device-specific settings
 */
export interface DeviceSettings {
  id: string; // Device identifier
  name: string; // Human-readable name
  enabled: boolean; // Whether the device is enabled
  [key: string]: any; // Additional device-specific settings
}

/**
 * Script data interface
 */
export interface ScriptData {
  type: string; // Script type (e.g., "funscript")
  url?: string; // URL to script if remote
  content?: any; // Script content if loaded directly
}

/**
 * Common interface for all haptic devices
 */
export interface HapticDevice {
  /**
   * Device information
   */
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly capabilities: DeviceCapability[];

  /**
   * Connection state
   */
  readonly isConnected: boolean;
  readonly isPlaying: boolean;

  /**
   * Connect to the device
   * @param config Optional configuration
   */
  connect(config?: any): Promise<boolean>;

  /**
   * Disconnect from the device
   */
  disconnect(): Promise<boolean>;

  /**
   * Get current device configuration
   */
  getConfig(): DeviceSettings;

  /**
   * Update device configuration
   * @param config Partial configuration to update
   */
  updateConfig(config: Partial<DeviceSettings>): Promise<boolean>;

  /**
   * Load a script for playback
   * @param scriptData Script data to load
   */
  loadScript(
    scriptData: ScriptData
  ): Promise<{ success: boolean; scriptContent?: ScriptData }>;

  /**
   * Play the loaded script at the specified time
   * @param timeMs Current time in milliseconds
   * @param playbackRate Playback rate (1.0 = normal speed)
   * @param loop Whether to loop the script
   */
  play(timeMs: number, playbackRate?: number, loop?: boolean): Promise<boolean>;

  /**
   * Stop playback
   */
  stop(): Promise<boolean>;

  /**
   * Synchronize device time with provided time
   * @param timeMs Current time in milliseconds
   */
  syncTime(timeMs: number): Promise<boolean>;

  /**
   * Get device-specific information
   */
  getDeviceInfo(): DeviceInfo | null;

  /**
   * Add event listener
   * @param event Event name
   * @param callback Callback function
   */
  on(event: string, callback: (data: any) => void): void;

  /**
   * Remove event listener
   * @param event Event name
   * @param callback Callback function
   */
  off(event: string, callback: (data: any) => void): void;
}
