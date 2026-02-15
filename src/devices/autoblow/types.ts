/**
 * Autoblow-specific types
 */
import { DeviceSettings } from '../../core/device-interface'

/**
 * Autoblow device types
 */
export type AutoblowDeviceType = 'autoblow-ultra' | 'vacuglide'

/**
 * Funscript format expected by Autoblow SDK
 */
export interface AutoblowFunscript {
  metadata?: { id?: number; version?: number }
  actions: Array<{ at: number; pos: number }>
}

/**
 * Autoblow-specific device settings
 */
export interface AutoblowSettings extends DeviceSettings {
  deviceToken: string
  offset: number
}
