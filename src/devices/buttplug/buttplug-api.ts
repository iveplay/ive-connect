/**
 * Buttplug API wrapper
 *
 * Handles communication with the Buttplug library
 */
import {
  ButtplugClient,
  ButtplugClientDevice,
  ButtplugDeviceError,
  ButtplugError,
} from "buttplug";
import { ButtplugBrowserWebsocketClientConnector } from "buttplug";
import { EventEmitter } from "../../core/events";
import {
  ButtplugConnectionState,
  ButtplugConnectionType,
  ButtplugDeviceInfo,
  DevicePreference,
} from "./types";

const DEBUG_WEBSOCKET = false;

export class ButtplugApi extends EventEmitter {
  private client: ButtplugClient | null = null;
  private devices: Map<number, ButtplugDeviceInfo> = new Map();
  private devicePreferences: Map<number, DevicePreference> = new Map();
  public isScanning: boolean = false;
  private connectionState: ButtplugConnectionState =
    ButtplugConnectionState.DISCONNECTED;
  private connectedUrl?: string;
  private clientName: string;

  constructor(clientName: string = "IVE-Connect") {
    super();
    this.clientName = clientName;
  }

  /**
   * Get the current connection state
   */
  getConnectionState(): ButtplugConnectionState {
    return this.connectionState;
  }

  /**
   * Get the current connected server URL if any
   */
  getConnectedUrl(): string | undefined {
    return this.connectedUrl;
  }

  /**
   * Get the list of connected devices
   */
  getDevices(): ButtplugDeviceInfo[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get the scanning state
   */
  getIsScanning(): boolean {
    return this.isScanning;
  }

  /**
   * Set a device preference
   */
  setDevicePreference(deviceIndex: number, preference: DevicePreference): void {
    this.devicePreferences.set(deviceIndex, preference);
    this.emit("devicePreferenceChanged", { deviceIndex, preference });
  }

  /**
   * Get device preferences
   */
  getDevicePreferences(): Map<number, DevicePreference> {
    return this.devicePreferences;
  }

  /**
   * Connect to a Buttplug server
   */
  async connect(
    type: ButtplugConnectionType,
    serverUrl?: string
  ): Promise<boolean> {
    if (this.connectionState !== ButtplugConnectionState.DISCONNECTED) {
      // Clean up any existing connection
      await this.disconnect();
    }

    try {
      this.connectionState = ButtplugConnectionState.CONNECTING;
      this.emit("connectionStateChanged", this.connectionState);

      // Create a new client
      this.client = new ButtplugClient(this.clientName);
      this.setupClientListeners();

      let connector;
      if (type === ButtplugConnectionType.WEBSOCKET) {
        if (!serverUrl) {
          throw new Error("Server URL is required for WebSocket connection");
        }
        connector = new ButtplugBrowserWebsocketClientConnector(serverUrl);
        this.connectedUrl = serverUrl;
      } else {
        // For local connection, we'll need to import the WASM client connector dynamically
        // as it's only available in a browser environment
        const { ButtplugWasmClientConnector } = await import(
          "buttplug-wasm/dist/buttplug-wasm.mjs"
        );
        connector = new ButtplugWasmClientConnector();
        this.connectedUrl = "In-Browser Server";
      }

      await this.client.connect(connector);
      this.connectionState = ButtplugConnectionState.CONNECTED;
      this.emit("connectionStateChanged", this.connectionState);
      return true;
    } catch (error) {
      console.error("Error connecting to Buttplug server:", error);
      this.connectionState = ButtplugConnectionState.DISCONNECTED;
      this.emit("connectionStateChanged", this.connectionState);
      this.emit(
        "error",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<boolean> {
    if (!this.client) {
      return true;
    }

    try {
      if (this.client.connected) {
        await this.client.disconnect();
      }
    } catch (error) {
      console.error("Error disconnecting from Buttplug server:", error);
    }

    this.cleanup();
    return true;
  }

  /**
   * Start scanning for devices
   */
  async startScanning(): Promise<boolean> {
    if (!this.client || !this.client.connected) {
      this.emit("error", "Cannot start scanning: Not connected to a server");
      return false;
    }

    try {
      this.isScanning = true;
      this.emit("scanningChanged", this.isScanning);
      await this.client.startScanning();
      return true;
    } catch (error) {
      console.error("Error starting device scan:", error);
      this.isScanning = false;
      this.emit("scanningChanged", this.isScanning);
      this.emit(
        "error",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Stop scanning for devices
   */
  async stopScanning(): Promise<boolean> {
    if (!this.client || !this.client.connected) {
      return false;
    }

    try {
      await this.client.stopScanning();
      // The scanningFinished event listener will handle setting the state
      return true;
    } catch (error) {
      console.error("Error stopping device scan:", error);
      this.isScanning = false;
      this.emit("scanningChanged", this.isScanning);
      this.emit(
        "error",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Send a vibrate command to a device
   */
  async vibrateDevice(index: number, speed: number): Promise<boolean> {
    if (DEBUG_WEBSOCKET)
      console.log(`[BUTTPLUG-WS] Vibrate device ${index}: speed=${speed}`);

    const device = this.getClientDevice(index);
    if (!device) {
      this.emit("error", `No device with index ${index}`);
      return false;
    }

    if (!device.vibrateAttributes || device.vibrateAttributes.length === 0) {
      this.emit("error", `Device ${index} does not support vibrate commands`);
      return false;
    }

    try {
      await device.vibrate(speed);
      return true;
    } catch (error) {
      this.handleDeviceCommandError(error, "vibrate");
      return false;
    }
  }

  /**
   * Send a linear command to a device
   */
  async linearDevice(
    index: number,
    position: number,
    duration: number
  ): Promise<boolean> {
    if (DEBUG_WEBSOCKET)
      console.log(
        `[BUTTPLUG-WS] Linear device ${index}: position=${position}, duration=${duration}`
      );

    const device = this.getClientDevice(index);
    if (!device) {
      this.emit("error", `No device with index ${index}`);
      return false;
    }

    if (!device.messageAttributes.LinearCmd) {
      this.emit("error", `Device ${index} does not support linear commands`);
      return false;
    }

    try {
      await device.linear(position, duration);
      return true;
    } catch (error) {
      this.handleDeviceCommandError(error, "linear");
      return false;
    }
  }

  /**
   * Send a rotate command to a device
   */
  async rotateDevice(
    index: number,
    speed: number,
    clockwise: boolean
  ): Promise<boolean> {
    if (DEBUG_WEBSOCKET)
      console.log(
        `[BUTTPLUG-WS] Rotate device ${index}: speed=${speed}, clockwise=${clockwise}`
      );

    const device = this.getClientDevice(index);
    if (!device) {
      this.emit("error", `No device with index ${index}`);
      return false;
    }

    if (!device.messageAttributes.RotateCmd) {
      this.emit("error", `Device ${index} does not support rotate commands`);
      return false;
    }

    try {
      await device.rotate(speed, clockwise);
      return true;
    } catch (error) {
      this.handleDeviceCommandError(error, "rotate");
      return false;
    }
  }

  async oscillateDevice(
    index: number,
    speed: number,
    frequency: number
  ): Promise<boolean> {
    if (DEBUG_WEBSOCKET)
      console.log(
        `[BUTTPLUG-WS] Oscillate device ${index}: speed=${speed}, frequency=${frequency}`
      );

    const device = this.getClientDevice(index);
    if (!device) {
      this.emit("error", `No device with index ${index}`);
      return false;
    }

    if (
      !device.oscillateAttributes ||
      device.oscillateAttributes.length === 0
    ) {
      this.emit("error", `Device ${index} does not support oscillate commands`);
      return false;
    }

    try {
      await device.oscillate(speed);
      return true;
    } catch (error) {
      this.handleDeviceCommandError(error, "oscillate");
      return false;
    }
  }

  /**
   * Stop a specific device
   */
  async stopDevice(index: number): Promise<boolean> {
    const device = this.getClientDevice(index);
    if (!device) {
      this.emit("error", `No device with index ${index}`);
      return false;
    }

    try {
      const deviceInfo = this.devices.get(index);

      // Send a gentle command before stopping to prevent device jerking
      if (deviceInfo) {
        try {
          if (deviceInfo.canVibrate) {
            await device.vibrate(0.01);
          } else if (deviceInfo.canRotate) {
            await device.rotate(0.01, true);
          } else if (deviceInfo.canLinear) {
            await device.linear(0.01, 500);
          }
        } catch (e) {
          console.error(`Error sending gentle command before stop:`, e);
        }
      }

      // Use setTimeout to ensure the gentle command has time to take effect
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            await device.stop();
            resolve();
          } catch (e) {
            console.error(`Stop command error:`, e);
            resolve();
          }
        }, 100);
      });

      return true;
    } catch (error) {
      this.handleDeviceCommandError(error, "stop");
      return false;
    }
  }

  /**
   * Stop all devices
   */
  async stopAllDevices(): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    try {
      // First send gentle commands to all devices
      for (const device of this.client.devices) {
        const deviceInfo = this.devices.get(device.index);
        if (!deviceInfo) continue;

        try {
          if (deviceInfo.canVibrate) {
            await device.vibrate(0.01);
          } else if (deviceInfo.canRotate) {
            await device.rotate(0.01, true);
          } else if (deviceInfo.canLinear) {
            await device.linear(0.01, 500);
          }
        } catch (e) {
          console.error(`Error sending gentle command before stopAll:`, e);
        }
      }

      // Then stop all devices after a short delay
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            const stopPromises = this.client!.devices.map(async (device) => {
              try {
                await device.stop();
              } catch (e) {
                console.error(`StopAll command error:`, e);
              }
            });
            await Promise.all(stopPromises);
            resolve();
          } catch (e) {
            console.error(`Error in stopAllDevices:`, e);
            resolve();
          }
        }, 100);
      });

      return true;
    } catch (error) {
      console.error("Error stopping all devices:", error);
      this.emit(
        "error",
        error instanceof Error ? error.message : String(error)
      );
      return false;
    }
  }

  /**
   * Set up listeners for client events
   */
  private setupClientListeners(): void {
    if (!this.client) return;

    this.client.addListener("deviceadded", this.handleDeviceAdded);
    this.client.addListener("deviceremoved", this.handleDeviceRemoved);
    this.client.addListener("scanningfinished", this.handleScanningFinished);
    this.client.addListener("disconnect", this.handleDisconnected);
  }

  /**
   * Clean up resources when disconnecting
   */
  private cleanup(): void {
    if (this.client) {
      this.client.removeAllListeners();
      this.client = null;
    }

    this.devices.clear();
    this.isScanning = false;
    this.connectionState = ButtplugConnectionState.DISCONNECTED;
    this.connectedUrl = undefined;

    this.emit("connectionStateChanged", this.connectionState);
    this.emit("scanningChanged", this.isScanning);
  }

  /**
   * Handle a device added event
   */
  private handleDeviceAdded = (device: ButtplugClientDevice): void => {
    const deviceInfo: ButtplugDeviceInfo = {
      index: device.index,
      name: device.name,
      canVibrate: device.vibrateAttributes.length > 0,
      canLinear: device.messageAttributes.LinearCmd !== undefined,
      canRotate: device.messageAttributes.RotateCmd !== undefined,
      canOscillate:
        device.oscillateAttributes && device.oscillateAttributes.length > 0,
    };

    this.devices.set(device.index, deviceInfo);

    // Set default preferences if none exist
    if (!this.devicePreferences.has(device.index)) {
      this.devicePreferences.set(device.index, {
        enabled: true,
        useVibrate: deviceInfo.canVibrate,
        useRotate: deviceInfo.canRotate,
        useLinear: deviceInfo.canLinear,
        useOscillate: deviceInfo.canOscillate,
      });
    }

    this.emit("deviceAdded", deviceInfo);
  };

  /**
   * Handle a device removed event
   */
  private handleDeviceRemoved = (device: ButtplugClientDevice): void => {
    const deviceInfo = this.devices.get(device.index);
    if (deviceInfo) {
      this.devices.delete(device.index);
      this.emit("deviceRemoved", deviceInfo);
    }
  };

  /**
   * Handle scanning finished event
   */
  private handleScanningFinished = (): void => {
    this.isScanning = false;
    this.emit("scanningChanged", this.isScanning);
  };

  /**
   * Handle disconnection event
   */
  private handleDisconnected = (): void => {
    this.cleanup();
  };

  /**
   * Get a device from the client by index
   */
  private getClientDevice(index: number): ButtplugClientDevice | undefined {
    if (!this.client) return undefined;
    return this.client.devices.find((d) => d.index === index);
  }

  /**
   * Handle a device command error
   */
  private handleDeviceCommandError(error: unknown, command: string): void {
    if (error instanceof ButtplugDeviceError) {
      console.error(`Device error on ${command}:`, error.message);
      this.emit("error", `Device error on ${command}: ${error.message}`);
    } else if (error instanceof ButtplugError) {
      console.error(`Buttplug error on ${command}:`, error.message);
      this.emit("error", `Buttplug error on ${command}: ${error.message}`);
    } else {
      console.error(`Unknown error on ${command}:`, error);
      this.emit(
        "error",
        `Unknown error on ${command}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
