/**
 * Buttplug-specific types
 */
import { DeviceSettings } from "../../core/device-interface";

/**
 * Buttplug connection types
 */
export enum ButtplugConnectionType {
  WEBSOCKET = "websocket",
  LOCAL = "local",
}

/**
 * Enum to represent current connection state
 */
export enum ButtplugConnectionState {
  DISCONNECTED = "DISCONNECTED",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
}

/**
 * Buttplug device settings
 */
export interface ButtplugSettings extends DeviceSettings {
  connectionType: ButtplugConnectionType;
  serverUrl?: string; // For WebSocket connections
  clientName: string; // Client name for Buttplug server
  allowedFeatures: {
    // Features to enable
    vibrate: boolean;
    rotate: boolean;
    linear: boolean;
  };
  devicePreferences: Record<
    number,
    {
      enabled: boolean;
      useVibrate: boolean;
      useRotate: boolean;
      useLinear: boolean;
      intensity?: number; // Custom intensity scaling (0.0 to 1.0)
    }
  >;
}

/**
 * Buttplug device info
 */
export interface ButtplugDeviceInfo {
  index: number; // Internal device index
  name: string; // Device name
  canVibrate: boolean; // Supports vibration
  canRotate: boolean; // Supports rotation
  canLinear: boolean; // Supports linear movement
}

/**
 * Device preference for storing configuration
 */
export interface DevicePreference {
  enabled: boolean;
  useVibrate: boolean;
  useRotate: boolean;
  useLinear: boolean;
  intensity?: number;
}
