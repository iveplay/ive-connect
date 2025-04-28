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
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

This project uses [buttplug.io](https://buttplug.io) (BSD 3-Clause License) for device communication.
