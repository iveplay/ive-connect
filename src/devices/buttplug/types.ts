/**
 * Buttplug-specific types
 */
import { DeviceSettings } from '../../core/device-interface'

/**
 * Buttplug connection types
 */
export enum ButtplugConnectionType {
  WEBSOCKET = 'websocket',
}

/**
 * Enum to represent current connection state
 */
export enum ButtplugConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
}

/**
 * Buttplug device settings
 */
export interface ButtplugSettings extends DeviceSettings {
  connectionType: ButtplugConnectionType
  serverUrl?: string
  clientName: string
  strokeRange?: { min: number; max: number }
  allowedFeatures: {
    vibrate: boolean
    rotate: boolean
    linear: boolean
    oscillate: boolean
  }
  devicePreferences: Record<number, DevicePreference>
}

/**
 * Buttplug device info
 */
export interface ButtplugDeviceInfo {
  index: number // Internal device index
  name: string // Device name
  canVibrate: boolean // Supports vibration
  canRotate: boolean // Supports rotation
  canLinear: boolean // Supports linear movement
  canOscillate: boolean // Supports oscillation
}

/**
 * Device preference for storing configuration
 */
export interface DevicePreference {
  enabled: boolean
  useVibrate: boolean
  useRotate: boolean
  useLinear: boolean
  useOscillate: boolean
  intensity?: number
}
