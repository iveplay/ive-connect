/**
 * IVE Control Library
 *
 * A universal haptic device control library that provides a consistent interface
 * for managing various haptic devices (Handy, Buttplug, etc.)
 */

// Core exports
export { DeviceManager } from "./core/device-manager";
export { EventEmitter } from "./core/events";
export {
  HapticDevice,
  DeviceInfo,
  DeviceSettings,
  ScriptData,
  ConnectionState,
  DeviceCapability,
} from "./core/device-interface";

// Device exports
export * from "./devices";
