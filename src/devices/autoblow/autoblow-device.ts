/**
 * Autoblow Device Implementation
 *
 * Implements the HapticDevice interface for Autoblow devices (Ultra and Vacuglide)
 * Focused on sync script playback functionality
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
import { AutoblowSettings, AutoblowDeviceType } from './types'

// Use type imports for SDK types to avoid runtime issues
import type * as AutoblowSdkTypes from '@xsense/autoblow-sdk'

/**
 * Default Autoblow configuration
 */
const DEFAULT_CONFIG: AutoblowSettings = {
  id: 'autoblow',
  name: 'Autoblow',
  enabled: true,
  deviceToken: '',
  offset: 0,
}

/**
 * Autoblow device implementation
 */
export class AutoblowDevice extends EventEmitter implements HapticDevice {
  private _config: AutoblowSettings
  private _connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private _deviceInfo: AutoblowSdkTypes.DeviceInfo | null = null
  private _device: AutoblowSdkTypes.Ultra | AutoblowSdkTypes.Vacuglide | null =
    null
  private _deviceType: AutoblowDeviceType | null = null
  private _isPlaying: boolean = false
  private _scriptPrepared: boolean = false

  readonly id: string = 'autoblow'
  readonly name: string = 'Autoblow'
  readonly type: string = 'autoblow'
  readonly capabilities: DeviceCapability[] = [
    DeviceCapability.LINEAR,
    DeviceCapability.STROKE,
  ]

  constructor(config?: Partial<AutoblowSettings>) {
    super()

    this._config = { ...DEFAULT_CONFIG }
    if (config) {
      Object.assign(this._config, config)
    }
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
   * Get the device type (ultra or vacuglide)
   */
  get deviceType(): AutoblowDeviceType | null {
    return this._deviceType
  }

  /**
   * Connect to the Autoblow device
   */
  async connect(config?: Partial<AutoblowSettings>): Promise<boolean> {
    try {
      if (config) {
        await this.updateConfig(config)
      }

      if (!this._config.deviceToken || this._config.deviceToken.length < 5) {
        this.emit('error', 'Device token must be at least 5 characters')
        return false
      }

      this._connectionState = ConnectionState.CONNECTING
      this.emit('connectionStateChanged', this._connectionState)

      // Dynamically import the SDK
      let sdk: typeof AutoblowSdkTypes
      try {
        sdk = await import('@xsense/autoblow-sdk')
      } catch (error) {
        this.emit(
          'error',
          'Failed to load Autoblow SDK. Make sure @xsense/autoblow-sdk is installed.',
        )
        this._connectionState = ConnectionState.DISCONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        return false
      }

      // Initialize device connection
      const result = await sdk.deviceInit(this._config.deviceToken)

      // Store the appropriate device reference
      if (result.ultra) {
        this._device = result.ultra
        this._deviceType = 'autoblow-ultra'
      } else if (result.vacuglide) {
        this._device = result.vacuglide
        this._deviceType = 'vacuglide'
      } else {
        throw new Error('No device returned from SDK')
      }

      this._deviceInfo = result.deviceInfo
      this._connectionState = ConnectionState.CONNECTED

      this.emit('connectionStateChanged', this._connectionState)
      this.emit('connected', this.getDeviceInfo())

      return true
    } catch (error) {
      console.error('Autoblow: Error connecting to device:', error)
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
   * Disconnect from the device
   */
  async disconnect(): Promise<boolean> {
    try {
      if (this._isPlaying) {
        await this.stop()
      }

      this._device = null
      this._deviceInfo = null
      this._deviceType = null
      this._isPlaying = false
      this._scriptPrepared = false
      this._connectionState = ConnectionState.DISCONNECTED

      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')

      return true
    } catch (error) {
      console.error('Autoblow: Error disconnecting:', error)
      this._connectionState = ConnectionState.DISCONNECTED
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')
      return true
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoblowSettings {
    return { ...this._config }
  }

  /**
   * Update configuration
   */
  async updateConfig(config: Partial<AutoblowSettings>): Promise<boolean> {
    if (config.deviceToken !== undefined) {
      this._config.deviceToken = config.deviceToken
    }

    if (config.offset !== undefined) {
      this._config.offset = config.offset

      // Apply offset to device if connected
      if (this.isConnected && this._device) {
        try {
          await this._device.syncScriptOffset(config.offset)
        } catch (error) {
          console.error('Autoblow: Error setting offset:', error)
        }
      }
    }

    if (config.name !== undefined) {
      this._config.name = config.name
    }

    if (config.enabled !== undefined) {
      this._config.enabled = config.enabled
    }

    this.emit('configChanged', this._config)
    return true
  }

  /**
   * Prepare a script for playback (upload to device)
   * The funscript is already parsed - we just need to upload it
   *
   * @param funscript The parsed funscript content
   */
  async prepareScript(funscript: Funscript): Promise<DeviceScriptLoadResult> {
    if (!this.isConnected || !this._device) {
      return { success: false, error: 'Device not connected' }
    }

    try {
      // Validate funscript format
      if (!funscript.actions || !Array.isArray(funscript.actions)) {
        return {
          success: false,
          error: 'Invalid script format: Missing actions array',
        }
      }

      // Convert to Autoblow SDK format
      const sdkFunscript = {
        actions: funscript.actions.map((action: FunscriptAction) => ({
          at: action.at,
          pos: action.pos,
        })),
      }

      const isReactNative =
        typeof navigator !== 'undefined' &&
        navigator.product === 'ReactNative'

      if (isReactNative) {
        // React Native's FormData doesn't support Blob. Make the API call
        // directly using the RN-compatible { uri, type, name } pattern.
        const cluster = this._device.connectedCluster
        if (!cluster) {
          return { success: false, error: 'Device cluster not available' }
        }
        const clusterUrl = cluster.includes('http')
          ? cluster
          : `https://${cluster}`

        const jsonStr = JSON.stringify(sdkFunscript)
        const base64 = btoa(jsonStr)
        const formData = new FormData()
        formData.append('file', {
          uri: `data:application/json;base64,${base64}`,
          type: 'application/json',
          name: 'funscript.json',
        } as unknown as Blob)

        const response = await fetch(
          `${clusterUrl}/autoblow/sync-script/upload-funscript`,
          {
            method: 'PUT',
            body: formData,
            headers: {
              'x-device-token': this._device.deviceToken,
            },
          },
        )

        if (!response.ok) {
          const text = await response.text().catch(() => response.statusText)
          return {
            success: false,
            error: `Upload failed (${response.status}): ${text}`,
          }
        }
      } else {
        await this._device.syncScriptUploadFunscriptFile(
          sdkFunscript as AutoblowSdkTypes.Funscript,
        )
      }

      this._scriptPrepared = true

      this.emit('scriptLoaded', {
        type: 'funscript',
        actions: funscript.actions.length,
      })

      return { success: true }
    } catch (error) {
      console.error('Autoblow: Error preparing script:', error)
      return {
        success: false,
        error: `Script preparation error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  /**
   * Start playback at the specified time
   */
  async play(
    timeMs: number,
    _playbackRate: number = 1.0,
    _loop: boolean = false,
  ): Promise<boolean> {
    if (!this.isConnected || !this._device) {
      this.emit('error', 'Cannot play: Device not connected')
      return false
    }

    if (!this._scriptPrepared) {
      this.emit('error', 'Cannot play: No script prepared')
      return false
    }

    try {
      // Apply offset before starting
      if (this._config.offset !== 0) {
        await this._device.syncScriptOffset(this._config.offset)
      }

      await this._device.syncScriptStart(timeMs)
      this._isPlaying = true

      this.emit('playbackStateChanged', {
        isPlaying: this._isPlaying,
        timeMs,
      })

      return true
    } catch (error) {
      console.error('Autoblow: Error starting playback:', error)
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
    if (!this.isConnected || !this._device) {
      this.emit('error', 'Cannot stop: Device not connected')
      return false
    }

    try {
      await this._device.syncScriptStop()
      this._isPlaying = false

      this.emit('playbackStateChanged', { isPlaying: false })
      return true
    } catch (error) {
      console.error('Autoblow: Error stopping playback:', error)
      this._isPlaying = false
      this.emit(
        'error',
        `Stop error: ${error instanceof Error ? error.message : String(error)}`,
      )
      this.emit('playbackStateChanged', { isPlaying: false })
      return false
    }
  }

  /**
   * Sync time - Autoblow handles this via syncScriptStart
   * We restart playback at the new time position
   */
  async syncTime(timeMs: number, _filter?: number): Promise<boolean> {
    if (!this.isConnected || !this._isPlaying || !this._device) {
      return false
    }

    try {
      // Autoblow doesn't have a direct sync method, restart at new position
      await this._device.syncScriptStart(timeMs)
      return true
    } catch (error) {
      console.error('Autoblow: Error syncing time:', error)
      return false
    }
  }

  /**
   * Set the sync script offset
   */
  async setOffset(offsetMs: number): Promise<boolean> {
    if (!this.isConnected || !this._device) {
      this.emit('error', 'Cannot set offset: Device not connected')
      return false
    }

    try {
      await this._device.syncScriptOffset(offsetMs)
      this._config.offset = offsetMs
      this.emit('configChanged', this._config)
      return true
    } catch (error) {
      console.error('Autoblow: Error setting offset:', error)
      return false
    }
  }

  /**
   * Get device state
   */
  async getState(): Promise<
    | AutoblowSdkTypes.UltraDeviceState
    | AutoblowSdkTypes.VacuglideDeviceState
    | null
  > {
    if (!this.isConnected || !this._device) {
      return null
    }

    try {
      return await this._device.getState()
    } catch (error) {
      console.error('Autoblow: Error getting state:', error)
      return null
    }
  }

  /**
   * Get device information
   */
  getDeviceInfo(): DeviceInfo | null {
    if (!this._deviceInfo) return null

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      deviceType: this._deviceType,
      firmware: String(this._deviceInfo.firmwareVersion),
      firmwareBranch: this._deviceInfo.firmwareBranch,
      hardware: this._deviceInfo.hardwareVersion,
      firmwareStatus: this._deviceInfo.firmwareStatus,
      mac: this._deviceInfo.mac,
    }
  }
}
