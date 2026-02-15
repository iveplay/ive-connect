/**
 * Buttplug Device Implementation
 *
 * Implements the HapticDevice interface for Buttplug devices
 */
import {
  ConnectionState,
  DeviceCapability,
  DeviceInfo,
  DeviceScriptLoadResult,
  Funscript,
  FunscriptAction,
  HapticDevice,
} from '../../core/device-interface'
import { EventEmitter } from '../../core/events'
import { ButtplugApi } from './buttplug-api'
import {
  ButtplugConnectionState,
  ButtplugConnectionType,
  ButtplugDeviceInfo,
  ButtplugSettings,
  DevicePreference,
} from './types'
import { generateClientName } from './buttplug-server'
import { createMultiDeviceCommandExecutor } from './command-helpers'

/**
 * Default Buttplug configuration
 */
const DEFAULT_CONFIG: ButtplugSettings = {
  id: 'buttplug',
  name: 'Buttplug Devices',
  enabled: true,
  connectionType: ButtplugConnectionType.WEBSOCKET,
  serverUrl: 'ws://127.0.0.1:12345',
  clientName: generateClientName(),
  strokeRange: { min: 0, max: 1 },
  allowedFeatures: {
    vibrate: true,
    rotate: true,
    linear: true,
    oscillate: true,
  },
  devicePreferences: {},
}

/**
 * Buttplug device implementation
 */
export class ButtplugDevice extends EventEmitter implements HapticDevice {
  private _api: ButtplugApi
  private _config: ButtplugSettings
  private _connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private _isPlaying: boolean = false
  private _currentScriptActions: FunscriptAction[] = []
  private _lastActionIndex: number = -1
  private _playbackInterval: ReturnType<typeof setInterval> | null = null
  private _playbackStartTime: number = 0
  private _playbackRate: number = 1.0
  private _loopPlayback: boolean = false
  private _scriptPrepared: boolean = false

  readonly id: string = 'buttplug'
  readonly name: string = 'Buttplug Devices'
  readonly type: string = 'buttplug'
  readonly capabilities: DeviceCapability[] = [
    DeviceCapability.VIBRATE,
    DeviceCapability.ROTATE,
    DeviceCapability.LINEAR,
    DeviceCapability.OSCILLATE,
  ]

  constructor(config?: Partial<ButtplugSettings>) {
    super()

    this._config = { ...DEFAULT_CONFIG }
    if (config) {
      Object.assign(this._config, config)
    }

    this._api = new ButtplugApi(this._config.clientName)
    this._setupApiEventHandlers()
  }

  /**
   * Get connected state
   */
  get isConnected(): boolean {
    return this._connectionState === ConnectionState.CONNECTED
  }

  /**
   * Get playing state
   */
  get isPlaying(): boolean {
    return this._isPlaying
  }

  /**
   * Connect to Buttplug server
   */
  async connect(config?: Partial<ButtplugSettings>): Promise<boolean> {
    try {
      // Update config if provided
      if (config) {
        await this.updateConfig(config)
      }

      // Update connection state
      this._connectionState = ConnectionState.CONNECTING
      this.emit('connectionStateChanged', this._connectionState)

      // Connect to the server via WebSocket
      const serverUrl = this._config.serverUrl || 'ws://127.0.0.1:12345'
      const success = await this._api.connect(
        this._config.connectionType,
        serverUrl,
      )

      if (success) {
        this._connectionState = ConnectionState.CONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('connected', this.getDeviceInfo())

        // Start scanning for devices automatically
        this._api.startScanning().catch((error) => {
          console.error('Error starting device scan:', error)
        })

        return true
      } else {
        this._connectionState = ConnectionState.DISCONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('error', 'Failed to connect to Buttplug server')
        return false
      }
    } catch (error) {
      console.error('Buttplug: Error connecting to server:', error)
      this._connectionState = ConnectionState.DISCONNECTED
      this.emit('connectionStateChanged', this._connectionState)
      this.emit(
        'error',
        `Connection error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return false
    }
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<boolean> {
    try {
      // Stop playback if active
      if (this._isPlaying) {
        await this.stop()
      }

      // Disconnect from server
      await this._api.disconnect()

      // Update state
      this._connectionState = ConnectionState.DISCONNECTED
      this._scriptPrepared = false
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')

      return true
    } catch (error) {
      console.error('Buttplug: Error disconnecting:', error)
      this._connectionState = ConnectionState.DISCONNECTED
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')
      return true // Return true anyway for better UX
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ButtplugSettings {
    return { ...this._config }
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<ButtplugSettings>): Promise<boolean> {
    // Update local config
    if (config.serverUrl !== undefined) {
      this._config.serverUrl = config.serverUrl
    }

    if (config.clientName !== undefined) {
      this._config.clientName = config.clientName
    }

    if (config.strokeRange !== undefined) {
      this._config.strokeRange = {
        min: config.strokeRange.min,
        max: config.strokeRange.max,
      }
    }

    if (config.allowedFeatures !== undefined) {
      this._config.allowedFeatures = {
        ...this._config.allowedFeatures,
        ...config.allowedFeatures,
      }
    }

    if (config.devicePreferences !== undefined) {
      // Update device preferences in the API
      for (const [index, prefs] of Object.entries(config.devicePreferences)) {
        const deviceIndex = Number(index)
        this._api.setDevicePreference(deviceIndex, prefs)
      }

      // Update local config
      this._config.devicePreferences = {
        ...this._config.devicePreferences,
        ...config.devicePreferences,
      }
    }

    // Update other fields if present
    if (config.name !== undefined) {
      this._config.name = config.name
    }

    if (config.enabled !== undefined) {
      this._config.enabled = config.enabled
    }

    // Emit configuration changed event
    this.emit('configChanged', this._config)

    return true
  }

  /**
   * Prepare a script for playback (store in memory)
   * The funscript is already parsed - we just store the actions
   *
   * @param funscript The parsed funscript content
   */
  async prepareScript(funscript: Funscript): Promise<DeviceScriptLoadResult> {
    try {
      // Store the actions (already sorted and processed by DeviceManager)
      this._currentScriptActions = [...funscript.actions]
      this._lastActionIndex = -1
      this._scriptPrepared = true

      this.emit('scriptLoaded', {
        type: 'funscript',
        actions: this._currentScriptActions.length,
      })

      return { success: true }
    } catch (error) {
      console.error('Buttplug: Error preparing script:', error)
      return {
        success: false,
        error: `Script preparation error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  /**
   * Play the loaded script
   */
  async play(
    timeMs: number,
    playbackRate: number = 1.0,
    loop: boolean = false,
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot play: Not connected to a server')
      return false
    }

    if (!this._scriptPrepared || !this._currentScriptActions.length) {
      this.emit('error', 'Cannot play: No script prepared')
      return false
    }

    try {
      // Stop any existing playback
      if (this._isPlaying) {
        await this.stop()
      }

      // Set playback parameters
      this._playbackStartTime = Date.now() - timeMs
      this._playbackRate = playbackRate
      this._loopPlayback = loop
      this._lastActionIndex = -1

      // Create command executor for all devices
      const devices = this._api.getDevices()
      const preferences = this._api.getDevicePreferences()
      const executor = createMultiDeviceCommandExecutor(
        this._api,
        devices,
        preferences,
        false,
      )

      // Start playback
      this._isPlaying = true

      // Create an interval to check for actions
      this._playbackInterval = setInterval(() => {
        this._processActions(executor)
      }, 20)

      this.emit('playbackStateChanged', {
        isPlaying: this._isPlaying,
        timeMs,
        playbackRate,
        loop,
      })

      return true
    } catch (error) {
      console.error('Buttplug: Error starting playback:', error)
      this._isPlaying = false
      this.emit(
        'error',
        `Playback error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      this.emit('playbackStateChanged', { isPlaying: false })
      return false
    }
  }

  /**
   * Stop playback
   */
  async stop(): Promise<boolean> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot stop: Not connected to a server')
      return false
    }

    try {
      // Clear playback interval
      if (this._playbackInterval !== null) {
        clearInterval(this._playbackInterval)
        this._playbackInterval = null
      }

      // Stop all devices
      await this._api.stopAllDevices()

      // Update playback state
      this._isPlaying = false
      this._lastActionIndex = -1

      this.emit('playbackStateChanged', { isPlaying: false })
      return true
    } catch (error) {
      console.error('Buttplug: Error stopping playback:', error)
      this._isPlaying = false
      this.emit(
        'error',
        `Stopping playback error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      this.emit('playbackStateChanged', { isPlaying: false })
      return false
    }
  }

  /**
   * Sync playback time
   */
  async syncTime(timeMs: number): Promise<boolean> {
    if (!this.isConnected || !this._isPlaying) {
      return false
    }

    try {
      // Update the playback start time based on the current time
      this._playbackStartTime = Date.now() - timeMs
      return true
    } catch (error) {
      console.error('Buttplug: Error syncing time:', error)
      return false
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo(): DeviceInfo | null {
    // Get connected devices
    const devices = this._api.getDevices()

    if (devices.length === 0) {
      return {
        id: this.id,
        name: this.name,
        type: this.type,
        deviceCount: 0,
        devices: [],
      }
    }

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      deviceCount: devices.length,
      devices: devices.map((device) => ({
        index: device.index,
        name: device.name,
        features: [
          device.canVibrate ? 'vibrate' : null,
          device.canRotate ? 'rotate' : null,
          device.canLinear ? 'linear' : null,
          device.canOscillate ? 'oscillate' : null,
        ].filter(Boolean) as string[],
      })),
    }
  }

  /**
   * Process script actions based on current time
   */
  private _processActions(executor: {
    executeAction: (
      pos: number,
      prevPos: number,
      durationMs: number,
      strokeRange?: { min: number; max: number },
    ) => Promise<void>
  }): void {
    if (!this._isPlaying || !this._currentScriptActions.length) {
      return
    }

    // Calculate current time in the script
    const currentTime = Date.now()
    const elapsedMs =
      (currentTime - this._playbackStartTime) * this._playbackRate

    // Find the action for the current time
    const actionIndex = this._findActionIndexForTime(elapsedMs)

    // If we reached the end of the script
    if (
      actionIndex === this._currentScriptActions.length - 1 &&
      elapsedMs > this._currentScriptActions[actionIndex]?.at + 1000
    ) {
      if (this._loopPlayback) {
        // Reset for loop playback
        this._playbackStartTime = Date.now()
        this._lastActionIndex = -1
        return
      } else {
        // We're past the end of the script, stop playback
        this.stop().catch(console.error)
        return
      }
    }

    // If we have a new action to execute
    if (actionIndex !== this._lastActionIndex && actionIndex >= 0) {
      const action = this._currentScriptActions[actionIndex]
      const prevAction =
        actionIndex > 0
          ? this._currentScriptActions[actionIndex - 1]
          : { pos: 0 }

      // Calculate duration for linear movement based on time with previous action
      let durationMs = 500 // Default duration if we can't determine
      if (actionIndex < this._currentScriptActions.length - 1) {
        const prevActionTime = this._currentScriptActions[actionIndex - 1]
        durationMs = action?.at - prevActionTime?.at

        // Enforce a minimum duration to prevent erratic movement
        durationMs = Math.max(100, durationMs)
      }

      // Get current stroke range from config (live updates)
      const strokeRange = this._config.strokeRange || { min: 0, max: 1 }

      // Execute the action on all devices with current stroke range
      executor
        .executeAction(action.pos, prevAction.pos, durationMs, strokeRange)
        .catch((error) => {
          console.error('Error executing action:', error)
        })

      this._lastActionIndex = actionIndex
    }
  }

  /**
   * Find the action index for the given time
   */
  private _findActionIndexForTime(timeMs: number): number {
    if (!this._currentScriptActions.length) {
      return -1
    }

    // If we're past the end of the script
    if (
      timeMs >
      this._currentScriptActions[this._currentScriptActions.length - 1].at
    ) {
      return this._currentScriptActions.length - 1
    }

    // If we're before the beginning of the script
    if (timeMs < this._currentScriptActions[0].at) {
      return 0
    }

    // Binary search for the action
    let low = 0
    let high = this._currentScriptActions.length - 1
    let bestIndex = -1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      if (this._currentScriptActions[mid].at <= timeMs) {
        bestIndex = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    // Return the next action
    return bestIndex < this._currentScriptActions.length - 1
      ? bestIndex + 1
      : bestIndex
  }

  /**
   * Set up event handlers for the Buttplug API
   */
  private _setupApiEventHandlers(): void {
    // Forward connection state changes
    this._api.on('connectionStateChanged', (state: ButtplugConnectionState) => {
      let connectionState: ConnectionState

      switch (state) {
        case ButtplugConnectionState.CONNECTED:
          connectionState = ConnectionState.CONNECTED
          break
        case ButtplugConnectionState.CONNECTING:
          connectionState = ConnectionState.CONNECTING
          break
        default:
          connectionState = ConnectionState.DISCONNECTED
          break
      }

      this._connectionState = connectionState
      this.emit('connectionStateChanged', connectionState)
    })

    // Forward device events
    this._api.on('deviceAdded', (deviceInfo: ButtplugDeviceInfo) => {
      this.emit('deviceAdded', deviceInfo)
    })

    this._api.on('deviceRemoved', (deviceInfo: ButtplugDeviceInfo) => {
      this.emit('deviceRemoved', deviceInfo)
    })

    // Forward errors
    this._api.on('error', (error: string) => {
      this.emit('error', error)
    })

    // Forward scanning state changes
    this._api.on('scanningChanged', (scanning: boolean) => {
      this.emit('scanningChanged', scanning)
    })

    // Forward device preference changes
    this._api.on(
      'devicePreferenceChanged',
      (data: { deviceIndex: number; preference: DevicePreference }) => {
        this.emit('devicePreferenceChanged', data)

        // Update local config
        if (!this._config.devicePreferences) {
          this._config.devicePreferences = {}
        }

        this._config.devicePreferences[data.deviceIndex] = data.preference
        this.emit('configChanged', this._config)
      },
    )
  }
}
