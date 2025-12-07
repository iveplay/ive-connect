/**
 * IVE Connect Library
 *
 * A universal haptic device control library that provides a consistent interface
 * for managing various haptic devices (Handy, Buttplug, Autoblow, etc.)
 */

// Core exports
export { DeviceManager } from "./core/device-manager";

export { EventEmitter } from "./core/events";

export {
  // Enums
  ConnectionState,
  DeviceCapability,
  // Types
  type DeviceInfo,
  type DeviceSettings,
  type DeviceScriptLoadResult,
  type Funscript,
  type FunscriptAction,
  type HapticDevice,
  type ScriptData,
  type ScriptLoadResult,
  type ScriptOptions,
} from "./core/device-interface";

export {
  loadScript,
  parseCSVToFunscript,
  invertFunscript,
  isValidFunscript,
  type LoadScriptResult,
} from "./core/script-loader";

// Device exports
export * from "./devices";
