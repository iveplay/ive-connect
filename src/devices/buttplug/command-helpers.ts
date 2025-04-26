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

  // Apply inversion if needed
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
  preferences: DevicePreference
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

  return {
    executeAction: async (pos: number, prevPos: number, durationMs: number) => {
      try {
        // Convert position to device range (0.0-1.0)
        const position = convertScriptPositionToDevicePosition(
          pos,
          0, // Min
          1, // Max
          false // Not inverted
        );

        // Apply device-specific intensity scaling if configured
        const intensity =
          preferences.intensity !== undefined ? preferences.intensity : 1.0;

        // Calculate speed/strength based on the position change, not just position
        // For vibration: calculate based on movement speed/magnitude of change
        let vibrationSpeed = (Math.abs(pos - prevPos) / 100) * intensity;
        // Normalize to reasonable range (0-1)
        vibrationSpeed = Math.min(1.0, vibrationSpeed * 5);

        // For rotation: similar approach
        const rotationSpeed = vibrationSpeed;

        // For linear devices: use the position directly
        const linearPosition = position;

        console.log(`Device ${deviceInfo.name} command:`, {
          vibrationSpeed,
          rotationSpeed,
          linearPosition,
          durationMs,
        });

        // Send appropriate commands based on device capabilities and preferences
        if (deviceInfo.canLinear && preferences.useLinear) {
          await api.linearDevice(deviceInfo.index, linearPosition, durationMs);
        }

        if (deviceInfo.canVibrate && preferences.useVibrate) {
          // Only vibrate if there's significant movement
          if (vibrationSpeed > 0.05) {
            await api.vibrateDevice(deviceInfo.index, vibrationSpeed);
          }
        }

        if (deviceInfo.canRotate && preferences.useRotate) {
          // Only rotate if there's significant movement
          if (rotationSpeed > 0.05) {
            await api.rotateDevice(deviceInfo.index, rotationSpeed, true);
          }
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
  preferences: Map<number, DevicePreference>
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
      return createDeviceCommandExecutor(api, device, devicePrefs!);
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
