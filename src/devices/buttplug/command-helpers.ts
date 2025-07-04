/**
 * Command Helpers for Buttplug Devices
 *
 * Utility functions for converting script commands to Buttplug device commands
 */
import { ButtplugApi } from "./buttplug-api";
import { ButtplugDeviceInfo, DevicePreference } from "./types";

/**
 * Convert script position (0-100) to device position (0.0-1.0)
 */
export function convertScriptPositionToDevicePosition(
  scriptPos: number,
  min: number = 0.0,
  max: number = 1.0,
  invert: boolean = false
): number {
  // Normalize scriptPos to 0.0-1.0 range
  let normalized = Math.min(1, Math.max(0, scriptPos / 100));

  // Apply script inversion first if enabled
  if (invert) {
    normalized = 1.0 - normalized;
  }

  // Scale to min-max range
  return min + normalized * (max - min);
}

/**
 * Create a command executor for a specific device
 */
export function createDeviceCommandExecutor(
  api: ButtplugApi,
  deviceInfo: ButtplugDeviceInfo,
  preferences: DevicePreference,
  invertScript: boolean = false
): {
  executeAction: (
    pos: number,
    prevPos: number,
    durationMs: number
  ) => Promise<void>;
} {
  // If device is disabled, return a no-op executor
  if (!preferences.enabled) {
    return {
      executeAction: async () => {
        /* No-op */
      },
    };
  }

  // Track last position to detect unchanged positions
  let lastPos = -1;

  return {
    executeAction: async (pos: number, prevPos: number, durationMs: number) => {
      try {
        // Convert position to device range (0.0-1.0)
        const position = convertScriptPositionToDevicePosition(
          pos,
          0, // Min
          1, // Max
          invertScript
        );

        // Apply device-specific intensity scaling if configured
        const intensity =
          preferences.intensity !== undefined ? preferences.intensity : 1.0;

        // For vibration and rotation: based on position directly (Martin style)
        // If position hasn't changed from last position, set to 0
        let speed = Math.min(1.0, Math.max(0, pos / 100)) * intensity;

        // If position hasn't changed, set speed to 0
        if (Math.abs(pos - lastPos) < 0.00001 && lastPos >= 0) {
          speed = 0;
        }

        // Save position for next time
        lastPos = pos;

        console.log(`Device ${deviceInfo.name} command:`, {
          speed,
          position,
          durationMs,
        });

        // Send appropriate commands based on device capabilities and preferences
        if (deviceInfo.canLinear && preferences.useLinear) {
          await api.linearDevice(deviceInfo.index, position, durationMs);
        }

        if (deviceInfo.canVibrate && preferences.useVibrate) {
          await api.vibrateDevice(
            deviceInfo.index,
            invertScript ? 1 - speed : speed
          );
        }

        if (deviceInfo.canRotate && preferences.useRotate) {
          await api.rotateDevice(
            deviceInfo.index,
            speed,
            invertScript ? false : true
          );
        }
      } catch (error) {
        console.error(
          `Error executing command for device ${deviceInfo.name}:`,
          error
        );
      }
    },
  };
}

/**
 * Create a command executor for multiple devices
 */
export function createMultiDeviceCommandExecutor(
  api: ButtplugApi,
  devices: ButtplugDeviceInfo[],
  preferences: Map<number, DevicePreference>,
  invertScript: boolean = false
): {
  executeAction: (
    pos: number,
    prevPos: number,
    durationMs: number
  ) => Promise<void>;
} {
  // Create executors for all enabled devices
  const deviceExecutors = devices
    .filter((device) => {
      const devicePrefs = preferences.get(device.index);
      return devicePrefs && devicePrefs.enabled;
    })
    .map((device) => {
      const devicePrefs = preferences.get(device.index);
      return createDeviceCommandExecutor(
        api,
        device,
        devicePrefs!,
        invertScript
      );
    });

  // Create a combined executor that will send commands to all devices
  return {
    executeAction: async (pos: number, prevPos: number, durationMs: number) => {
      // Execute on all devices in parallel
      await Promise.all(
        deviceExecutors.map((executor) =>
          executor.executeAction(pos, prevPos, durationMs)
        )
      );
    },
  };
}
