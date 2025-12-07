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
  OSCILLATE = "oscillate",
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
  [key: string]: unknown; // Additional device-specific information
}

/**
 * Device settings interface
 * Base interface for device-specific settings
 */
export interface DeviceSettings {
  id: string; // Device identifier
  name: string; // Human-readable name
  enabled: boolean; // Whether the device is enabled
  [key: string]: unknown; // Additional device-specific settings
}

/**
 * Funscript action
 */
export interface FunscriptAction {
  at: number; // Timestamp in milliseconds
  pos: number; // Position 0-100
}

/**
 * Funscript format
 */
export interface Funscript {
  actions: FunscriptAction[];
  inverted?: boolean;
  range?: number;
  version?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Script data interface - input for loading scripts
 */
export interface ScriptData {
  type: string; // Script type (e.g., "funscript", "csv")
  url?: string; // URL to script if remote
  content?: Funscript; // Script content if loaded directly
}

/**
 * Script options interface
 */
export interface ScriptOptions {
  invertScript?: boolean; // Whether to invert script values
}

/**
 * Result from loading a script to a single device
 */
export interface DeviceScriptLoadResult {
  success: boolean;
  error?: string;
}

/**
 * Result from loading a script via DeviceManager
 */
export interface ScriptLoadResult {
  /** The parsed and processed funscript content */
  funscript: Funscript | null;
  /** Whether the script was successfully fetched/parsed */
  success: boolean;
  /** Error message if fetching/parsing failed */
  error?: string;
  /** Per-device load results */
  devices: Record<string, DeviceScriptLoadResult>;
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
  connect(config?: unknown): Promise<boolean>;

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
   * Prepare the device to play a script
   * The funscript content is already parsed - device just needs to prepare it
   * (e.g., upload to server for Handy, store in memory for Buttplug)
   *
   * @param funscript The parsed funscript content
   * @param options Script options (e.g., inversion already applied)
   */
  prepareScript(
    funscript: Funscript,
    options?: ScriptOptions
  ): Promise<DeviceScriptLoadResult>;

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
   * @param filter Time filter for synchronization
   */
  syncTime(timeMs: number, filter?: number): Promise<boolean>;

  /**
   * Get device-specific information
   */
  getDeviceInfo(): DeviceInfo | null;

  /**
   * Add event listener
   * @param event Event name
   * @param callback Callback function
   */
  on(event: string, callback: (data: unknown) => void): void;

  /**
   * Remove event listener
   * @param event Event name
   * @param callback Callback function
   */
  off(event: string, callback: (data: unknown) => void): void;
}
