# ive-connect

A universal haptic device control library that provides a consistent interface for managing various haptic devices (Handy, Buttplug, etc.).

## Features

- Unified device control interface
- Support for multiple device types
- Event-based state management
- TypeScript support

## Installation

```bash
npm install ive-connect
```

## Quick Start

```typescript
import { DeviceManager, HandyDevice } from "ive-connect";

// Create a device manager
const manager = new DeviceManager();

// Create and register a Handy device
const handyDevice = new HandyDevice({
  connectionKey: "your-connection-key",
});
manager.registerDevice(handyDevice);

// Connect to the device
await handyDevice.connect();

// Load a script
await handyDevice.loadScript({
  type: "funscript",
  url: "https://example.com/script.funscript",
});

// Start playback
await handyDevice.play(0, 1.0, false);

// Later, stop playback
await handyDevice.stop();

// Disconnect when done
await handyDevice.disconnect();
```

## Supported Devices

### Handy

```typescript
import { HandyDevice } from "ive-connect";

const handy = new HandyDevice({
  connectionKey: "your-connection-key",
  // Optional custom configuration
  baseV3Url: "https://www.handyfeeling.com/api/v3",
  baseV2Url: "https://www.handyfeeling.com/api/v2",
  applicationId: "YourAppName",
});

// Connect to the device
await handy.connect();

// Update configuration
await handy.updateConfig({
  offset: -200, // Timing offset in milliseconds
  stroke: {
    min: 0.1, // Min stroke position (0.0 to 1.0)
    max: 0.9, // Max stroke position (0.0 to 1.0)
  },
});

// Listen for events
handy.on("connected", (deviceInfo) => {
  console.log("Connected to Handy:", deviceInfo);
});

handy.on("playbackStateChanged", (state) => {
  console.log("Playback state changed:", state.isPlaying);
});
```

### Using the Device Manager

```typescript
import { DeviceManager, HandyDevice } from "ive-connect";

// Create a device manager
const manager = new DeviceManager();

// Register devices
const handy = new HandyDevice({
  connectionKey: "your-connection-key",
});
manager.registerDevice(handy);

// Connect all devices
await manager.connectAll();

// Load a script to all connected devices
await manager.loadScriptAll({
  type: "funscript",
  url: "https://example.com/script.funscript",
});

// Start playback on all devices
await manager.playAll(0, 1.0, false);

// Sync time on all devices every second
setInterval(() => {
  manager.syncTimeAll(videoElement.currentTime * 1000);
}, 1000);

// Listen for events from any device
manager.on("device:connected", ({ deviceId, data }) => {
  console.log(`Device ${deviceId} connected:`, data);
});

// Listen for events from a specific device
manager.on(`device:${handy.id}:error`, (error) => {
  console.error(`Error from ${handy.id}:`, error);
});
```

## API Reference

### Core Classes

#### `DeviceManager`

Central manager for all haptic devices.

- `registerDevice(device: HapticDevice): void` - Register a device
- `unregisterDevice(deviceId: string): void` - Unregister a device
- `getDevices(): HapticDevice[]` - Get all registered devices
- `getDevice(deviceId: string): HapticDevice | undefined` - Get a specific device
- `connectAll(): Promise<Record<string, boolean>>` - Connect all devices
- `disconnectAll(): Promise<Record<string, boolean>>` - Disconnect all devices
- `loadScriptAll(scriptData: ScriptData): Promise<Record<string, boolean>>` - Load script to all devices
- `playAll(timeMs: number, playbackRate?: number, loop?: boolean): Promise<Record<string, boolean>>` - Start playback on all devices
- `stopAll(): Promise<Record<string, boolean>>` - Stop playback on all devices
- `syncTimeAll(timeMs: number): Promise<Record<string, boolean>>` - Sync time on all playing devices

#### `HandyDevice`

Implementation of the Handy device.

- `connect(config?: Partial<HandySettings>): Promise<boolean>` - Connect to the device
- `disconnect(): Promise<boolean>` - Disconnect from the device
- `getConfig(): HandySettings` - Get current configuration
- `updateConfig(config: Partial<HandySettings>): Promise<boolean>` - Update configuration
- `loadScript(scriptData: ScriptData): Promise<boolean>` - Load a script
- `play(timeMs: number, playbackRate?: number, loop?: boolean): Promise<boolean>` - Start playback
- `stop(): Promise<boolean>` - Stop playback
- `syncTime(timeMs: number): Promise<boolean>` - Sync time
- `getDeviceInfo(): DeviceInfo | null` - Get device information

### Events

Devices and the DeviceManager emit various events that you can listen to:

#### Device Events

- `error` - Error occurred
- `connected` - Device connected
- `disconnected` - Device disconnected
- `connectionStateChanged` - Connection state changed
- `playbackStateChanged` - Playback state changed
- `scriptLoaded` - Script loaded successfully
- `configChanged` - Configuration changed

#### DeviceManager Events

- `deviceAdded` - Device was added to the manager
- `deviceRemoved` - Device was removed from the manager
- `device:{deviceId}:{eventName}` - Event from a specific device
- `device:{eventName}` - Event from any device

## Interfaces

### `HapticDevice`

Common interface for all haptic devices.

```typescript
interface HapticDevice {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly capabilities: DeviceCapability[];
  readonly isConnected: boolean;
  readonly isPlaying: boolean;

  connect(config?: any): Promise<boolean>;
  disconnect(): Promise<boolean>;
  getConfig(): DeviceSettings;
  updateConfig(config: Partial<DeviceSettings>): Promise<boolean>;
  loadScript(scriptData: ScriptData): Promise<boolean>;
  play(timeMs: number, playbackRate?: number, loop?: boolean): Promise<boolean>;
  stop(): Promise<boolean>;
  syncTime(timeMs: number): Promise<boolean>;
  getDeviceInfo(): DeviceInfo | null;
  on(event: string, callback: (data: any) => void): void;
  off(event: string, callback: (data: any) => void): void;
}
```

### `ScriptData`

Data for scripts to be loaded.

```typescript
interface ScriptData {
  type: string; // Script type (e.g., "funscript")
  url?: string; // URL to script if remote
  content?: any; // Script content if loaded directly
}
```

### `DeviceSettings`

Base interface for device settings.

```typescript
interface DeviceSettings {
  id: string; // Device identifier
  name: string; // Human-readable name
  enabled: boolean; // Whether the device is enabled
  [key: string]: any; // Additional device-specific settings
}
```

### `HandySettings`

Handy-specific settings.

```typescript
interface HandySettings extends DeviceSettings {
  connectionKey: string; // Device connection key
  offset: number; // Timing offset in milliseconds
  stroke: {
    min: number; // Min stroke position (0.0 to 1.0)
    max: number; // Max stroke position (0.0 to 1.0)
  };
}
```
