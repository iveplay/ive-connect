import {
  DeviceManager,
  HandyDevice,
  ButtplugDevice,
  ButtplugConnectionType,
  DeviceCapability,
} from "../../src";

/**
 * Main application for testing IVE Connect
 */
class IVEConnectTestApp {
  private deviceManager: DeviceManager;
  private handyDevice: HandyDevice | null = null;
  private buttplugDevice: ButtplugDevice | null = null;
  private scriptLoaded = false;

  // UI elements
  private elements = {
    // Handy elements
    handyConnectionKey: document.getElementById(
      "handyConnectionKey"
    ) as HTMLInputElement,
    handyConnect: document.getElementById("handyConnect") as HTMLButtonElement,
    handyDisconnect: document.getElementById(
      "handyDisconnect"
    ) as HTMLButtonElement,
    handyStatus: document.getElementById("handyStatus") as HTMLDivElement,

    // Buttplug elements
    buttplugServerUrl: document.getElementById(
      "buttplugServerUrl"
    ) as HTMLInputElement,
    buttplugConnect: document.getElementById(
      "buttplugConnect"
    ) as HTMLButtonElement,
    buttplugDisconnect: document.getElementById(
      "buttplugDisconnect"
    ) as HTMLButtonElement,
    buttplugScan: document.getElementById("buttplugScan") as HTMLButtonElement,
    buttplugStatus: document.getElementById("buttplugStatus") as HTMLDivElement,
    deviceList: document.getElementById("deviceList") as HTMLDivElement,

    // Playback elements
    scriptUrl: document.getElementById("scriptUrl") as HTMLInputElement,
    loadScript: document.getElementById("loadScript") as HTMLButtonElement,
    scriptFile: document.getElementById("scriptFile") as HTMLInputElement,
    uploadScript: document.getElementById("uploadScript") as HTMLButtonElement,
    videoTime: document.getElementById("videoTime") as HTMLInputElement,
    playScript: document.getElementById("playScript") as HTMLButtonElement,
    stopScript: document.getElementById("stopScript") as HTMLButtonElement,
    syncTime: document.getElementById("syncTime") as HTMLButtonElement,
    scriptStatus: document.getElementById("scriptStatus") as HTMLDivElement,
  };

  constructor() {
    this.deviceManager = new DeviceManager();
    this.initializeEventListeners();
  }

  /**
   * Initialize event listeners for UI elements
   */
  private initializeEventListeners(): void {
    // Handy event listeners
    this.elements.handyConnect.addEventListener("click", () =>
      this.connectHandy()
    );
    this.elements.handyDisconnect.addEventListener("click", () =>
      this.disconnectHandy()
    );

    // Buttplug event listeners
    this.elements.buttplugConnect.addEventListener("click", () =>
      this.connectButtplug()
    );
    this.elements.buttplugDisconnect.addEventListener("click", () =>
      this.disconnectButtplug()
    );
    this.elements.buttplugScan.addEventListener("click", () =>
      this.scanForButtplugDevices()
    );

    // Playback event listeners
    this.elements.loadScript.addEventListener("click", () => this.loadScript());
    this.elements.uploadScript.addEventListener("click", () =>
      this.uploadScript()
    );
    this.elements.playScript.addEventListener("click", () => this.playScript());
    this.elements.stopScript.addEventListener("click", () => this.stopScript());
    this.elements.syncTime.addEventListener("click", () =>
      this.syncScriptTime()
    );
  }

  /**
   * Connect to a Handy device
   */
  private async connectHandy(): Promise<void> {
    const connectionKey = this.elements.handyConnectionKey.value.trim();

    if (!connectionKey) {
      alert("Please enter a Handy connection key");
      return;
    }

    try {
      this.elements.handyStatus.textContent = "Status: Connecting...";
      this.elements.handyConnect.disabled = true;

      // Create Handy device
      this.handyDevice = new HandyDevice({
        connectionKey,
        applicationId: "qPH5gJibT7vahb3v27DdWkagy53yeOqD",
      });

      // Register event listeners
      this.handyDevice.on("connected", (deviceInfo) => {
        console.log("Handy connected:", deviceInfo);
        this.elements.handyStatus.textContent = `Status: Connected (${
          deviceInfo?.hardware || "Handy"
        })`;
        this.updateButtonStates();
      });

      this.handyDevice.on("disconnected", () => {
        console.log("Handy disconnected");
        this.elements.handyStatus.textContent = "Status: Disconnected";
        this.updateButtonStates();
      });

      this.handyDevice.on("error", (error) => {
        console.error("Handy error:", error);
        this.elements.handyStatus.textContent = `Status: Error: ${error}`;
        this.updateButtonStates();
      });

      // Register with device manager
      this.deviceManager.registerDevice(this.handyDevice);

      // Connect to the device
      const success = await this.handyDevice.connect();

      if (!success) {
        throw new Error("Failed to connect to Handy");
      }
    } catch (error) {
      console.error("Error connecting to Handy:", error);
      this.elements.handyStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.elements.handyConnect.disabled = false;
    }
  }

  /**
   * Disconnect from a Handy device
   */
  private async disconnectHandy(): Promise<void> {
    if (!this.handyDevice) return;

    try {
      this.elements.handyStatus.textContent = "Status: Disconnecting...";
      this.elements.handyDisconnect.disabled = true;

      await this.handyDevice.disconnect();
    } catch (error) {
      console.error("Error disconnecting from Handy:", error);
      this.elements.handyStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  /**
   * Connect to Buttplug.io websocket server
   */
  private async connectButtplug(): Promise<void> {
    const serverUrl = this.elements.buttplugServerUrl.value.trim();

    if (!serverUrl) {
      alert("Please enter a Buttplug WebSocket server URL");
      return;
    }

    try {
      this.elements.buttplugStatus.textContent = "Status: Connecting...";
      this.elements.buttplugConnect.disabled = true;

      // Create Buttplug device
      this.buttplugDevice = new ButtplugDevice({
        connectionType: ButtplugConnectionType.WEBSOCKET,
        serverUrl: serverUrl,
        clientName: "IVE-Connect-Example",
      });

      // Register event listeners
      this.buttplugDevice.on("connected", (deviceInfo) => {
        console.log("Buttplug connected:", deviceInfo);
        this.elements.buttplugStatus.textContent =
          "Status: Connected to server";
        this.updateButtonStates();
      });

      this.buttplugDevice.on("disconnected", () => {
        console.log("Buttplug disconnected");
        this.elements.buttplugStatus.textContent = "Status: Disconnected";
        this.updateButtonStates();
        this.clearDeviceList();
      });

      this.buttplugDevice.on("error", (error) => {
        console.error("Buttplug error:", error);
        this.elements.buttplugStatus.textContent = `Status: Error: ${error}`;
        this.updateButtonStates();
      });

      this.buttplugDevice.on("deviceAdded", (device) => {
        console.log("Buttplug device added:", device);
        this.updateDeviceList();
      });

      this.buttplugDevice.on("deviceRemoved", (device) => {
        console.log("Buttplug device removed:", device);
        this.updateDeviceList();
      });

      this.buttplugDevice.on("scanningChanged", (scanning) => {
        console.log("Buttplug scanning state changed:", scanning);
        this.elements.buttplugStatus.textContent = scanning
          ? "Status: Scanning for devices..."
          : "Status: Connected to server";
        this.elements.buttplugScan.disabled =
          scanning || !this.buttplugDevice?.isConnected;
      });

      // Register with device manager
      this.deviceManager.registerDevice(this.buttplugDevice);

      // Connect to the server
      const success = await this.buttplugDevice.connect();

      if (!success) {
        throw new Error("Failed to connect to Buttplug server");
      }
    } catch (error) {
      console.error("Error connecting to Buttplug server:", error);
      this.elements.buttplugStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.elements.buttplugConnect.disabled = false;
    }
  }

  /**
   * Disconnect from Buttplug.io server
   */
  private async disconnectButtplug(): Promise<void> {
    if (!this.buttplugDevice) return;

    try {
      this.elements.buttplugStatus.textContent = "Status: Disconnecting...";
      this.elements.buttplugDisconnect.disabled = true;

      await this.buttplugDevice.disconnect();
      this.clearDeviceList();
    } catch (error) {
      console.error("Error disconnecting from Buttplug server:", error);
      this.elements.buttplugStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    }
  }

  /**
   * Scan for Buttplug devices
   */
  private async scanForButtplugDevices(): Promise<void> {
    if (!this.buttplugDevice || !this.buttplugDevice.isConnected) return;

    try {
      this.elements.buttplugScan.disabled = true;
      this.elements.buttplugStatus.textContent = "Status: Starting scan...";

      // Create a custom method to access internal scanning functionality
      const scanMethod = (this.buttplugDevice as any)._api?.startScanning;

      if (scanMethod) {
        await scanMethod();
      } else {
        // Fallback to custom implementation if needed
        console.warn("Direct scanning method not available, using fallback");
        await this.buttplugDevice.getConfig(); // Dummy call to satisfy return type
      }
    } catch (error) {
      console.error("Error scanning for Buttplug devices:", error);
      this.elements.buttplugStatus.textContent = `Status: Scan error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.elements.buttplugScan.disabled = false;
    }
  }

  /**
   * Update the Buttplug device list UI
   */
  private updateDeviceList(): void {
    if (!this.buttplugDevice) return;

    const deviceInfo = this.buttplugDevice.getDeviceInfo();
    if (!deviceInfo || !deviceInfo.devices || deviceInfo.devices.length === 0) {
      this.elements.deviceList.innerHTML = "<p>No devices connected</p>";
      return;
    }

    this.elements.deviceList.innerHTML = "";

    deviceInfo.devices.forEach((device) => {
      const deviceElement = document.createElement("div");
      deviceElement.className = "device-item";

      const nameElement = document.createElement("div");
      nameElement.className = "device-name";
      nameElement.textContent = device.name;

      const featuresElement = document.createElement("div");
      featuresElement.className = "device-features";
      featuresElement.textContent = `Features: ${device.features.join(", ")}`;

      deviceElement.appendChild(nameElement);
      deviceElement.appendChild(featuresElement);

      this.elements.deviceList.appendChild(deviceElement);
    });

    // Update status text with device count
    this.elements.buttplugStatus.textContent = `Status: Connected (${
      deviceInfo.devices.length
    } device${deviceInfo.devices.length !== 1 ? "s" : ""})`;
  }

  /**
   * Clear the Buttplug device list UI
   */
  private clearDeviceList(): void {
    this.elements.deviceList.innerHTML = "";
  }

  /**
   * Load a script from URL for playback
   */
  private async loadScript(): Promise<void> {
    const scriptUrl = this.elements.scriptUrl.value.trim();

    if (!scriptUrl) {
      alert("Please enter a funscript URL");
      return;
    }

    try {
      this.elements.scriptStatus.textContent =
        "Status: Loading script from URL...";
      this.elements.loadScript.disabled = true;

      const scriptData = {
        type: "funscript",
        url: scriptUrl,
      };

      await this.loadScriptToDevices(scriptData);
    } catch (error) {
      console.error("Error loading script:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.scriptLoaded = false;
    } finally {
      this.elements.loadScript.disabled = false;
      this.updateButtonStates();
    }
  }

  /**
   * Upload and load a script file
   */
  private async uploadScript(): Promise<void> {
    const fileInput = this.elements.scriptFile;

    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Please select a funscript file to upload");
      return;
    }

    const file = fileInput.files[0];

    try {
      this.elements.scriptStatus.textContent =
        "Status: Reading uploaded file...";
      this.elements.uploadScript.disabled = true;

      // Read the file
      const fileContent = await this.readFileAsText(file);
      let scriptContent;

      try {
        scriptContent = JSON.parse(fileContent);
      } catch (parseError) {
        throw new Error(
          "Invalid funscript file format. File must be valid JSON."
        );
      }

      // Validate basic funscript structure
      if (!scriptContent.actions || !Array.isArray(scriptContent.actions)) {
        throw new Error("Invalid funscript format: Missing actions array");
      }

      const scriptData = {
        type: "funscript",
        content: scriptContent,
      };

      await this.loadScriptToDevices(scriptData);
    } catch (error) {
      console.error("Error uploading script:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.scriptLoaded = false;
    } finally {
      this.elements.uploadScript.disabled = false;
      this.updateButtonStates();
    }
  }

  /**
   * Helper function to read a file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  /**
   * Load script to all connected devices
   */
  private async loadScriptToDevices(scriptData: any): Promise<void> {
    if (!this.handyDevice?.isConnected && !this.buttplugDevice?.isConnected) {
      alert("Please connect at least one device first");
      return;
    }

    try {
      // Load script to all connected devices
      const results = await this.deviceManager.loadScriptAll(scriptData);
      const successCount = Object.values(results).filter(Boolean).length;

      if (successCount > 0) {
        this.scriptLoaded = true;
        this.elements.scriptStatus.textContent = `Status: Script loaded successfully (${successCount} device${
          successCount !== 1 ? "s" : ""
        })`;
      } else {
        this.scriptLoaded = false;
        this.elements.scriptStatus.textContent =
          "Status: Failed to load script on any device";
      }
    } catch (error) {
      console.error("Error loading script to devices:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
      this.scriptLoaded = false;
      throw error;
    }
  }

  /**
   * Play the loaded script
   */
  private async playScript(): Promise<void> {
    if (!this.scriptLoaded) {
      alert("Please load a script first");
      return;
    }

    try {
      const timeMs = (Number(this.elements.videoTime.value) || 0) * 1000;
      const playbackRate = 1.0; // Default playback rate
      const loop = false; // Default loop setting

      this.elements.scriptStatus.textContent = "Status: Starting playback...";
      this.elements.playScript.disabled = true;

      // Play script on all connected devices
      const results = await this.deviceManager.playAll(
        timeMs,
        playbackRate,
        loop
      );
      const successCount = Object.values(results).filter(Boolean).length;

      if (successCount > 0) {
        this.elements.scriptStatus.textContent = `Status: Playback started (${successCount} device${
          successCount !== 1 ? "s" : ""
        })`;
      } else {
        this.elements.scriptStatus.textContent =
          "Status: Failed to start playback on any device";
      }
    } catch (error) {
      console.error("Error playing script:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    } finally {
      this.updateButtonStates();
    }
  }

  /**
   * Stop script playback
   */
  private async stopScript(): Promise<void> {
    try {
      this.elements.scriptStatus.textContent = "Status: Stopping playback...";
      this.elements.stopScript.disabled = true;

      // Stop playback on all connected devices
      const results = await this.deviceManager.stopAll();
      const successCount = Object.values(results).filter(Boolean).length;

      if (successCount > 0) {
        this.elements.scriptStatus.textContent = `Status: Playback stopped (${successCount} device${
          successCount !== 1 ? "s" : ""
        })`;
      } else {
        this.elements.scriptStatus.textContent =
          "Status: Failed to stop playback on any device";
      }
    } catch (error) {
      console.error("Error stopping script:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    } finally {
      this.updateButtonStates();
    }
  }

  /**
   * Sync script time with current time
   */
  private async syncScriptTime(): Promise<void> {
    try {
      const timeMs = (Number(this.elements.videoTime.value) || 0) * 1000;

      this.elements.syncTime.disabled = true;

      // Sync time on all connected devices
      const results = await this.deviceManager.syncTimeAll(timeMs);
      const successCount = Object.values(results).filter(Boolean).length;

      if (successCount > 0) {
        this.elements.scriptStatus.textContent = `Status: Time synced to ${timeMs}ms (${successCount} device${
          successCount !== 1 ? "s" : ""
        })`;
      } else {
        this.elements.scriptStatus.textContent =
          "Status: Failed to sync time on any device";
      }
    } catch (error) {
      console.error("Error syncing time:", error);
      this.elements.scriptStatus.textContent = `Status: Error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`;
    } finally {
      this.elements.syncTime.disabled = false;
    }
  }

  /**
   * Update the enabled/disabled state of all buttons
   */
  private updateButtonStates(): void {
    const handyConnected = this.handyDevice?.isConnected || false;
    const buttplugConnected = this.buttplugDevice?.isConnected || false;
    const anyDeviceConnected = handyConnected || buttplugConnected;

    // Handy buttons
    this.elements.handyConnect.disabled = handyConnected;
    this.elements.handyDisconnect.disabled = !handyConnected;
    this.elements.handyConnectionKey.disabled = handyConnected;

    // Buttplug buttons
    this.elements.buttplugConnect.disabled = buttplugConnected;
    this.elements.buttplugDisconnect.disabled = !buttplugConnected;
    this.elements.buttplugScan.disabled = !buttplugConnected;
    this.elements.buttplugServerUrl.disabled = buttplugConnected;

    // Playback buttons
    this.elements.loadScript.disabled = !anyDeviceConnected;
    this.elements.uploadScript.disabled = !anyDeviceConnected;
    this.elements.playScript.disabled =
      !this.scriptLoaded || !anyDeviceConnected;
    this.elements.stopScript.disabled = !anyDeviceConnected;
    this.elements.syncTime.disabled = !anyDeviceConnected;
  }
}

// Initialize the application
const app = new IVEConnectTestApp();
