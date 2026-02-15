/**
 * Handy Device Implementation
 */
import {
  ConnectionState,
  DeviceCapability,
  DeviceInfo,
  DeviceScriptLoadResult,
  Funscript,
  HapticDevice,
} from '../../core/device-interface'
import { EventEmitter } from '../../core/events'
import { HandyApi, createHandyApi } from './handy-api'
import {
  HandyDeviceInfo,
  HandySettings,
  HspState,
  HspPoint,
  HspPlayState,
} from './types'

/**
 * Default Handy configuration
 */
const DEFAULT_CONFIG: HandySettings = {
  id: 'handy',
  name: 'Handy',
  connectionKey: '',
  enabled: true,
  offset: 0,
  stroke: {
    min: 0,
    max: 1,
  },
}

/**
 * Handy configuration options
 */
export interface HandyConfig {
  connectionKey?: string
  baseV3Url?: string
  baseV2Url?: string
  applicationId?: string
}

/**
 * Handy device implementation
 */
export class HandyDevice extends EventEmitter implements HapticDevice {
  private _api: HandyApi
  private _config: HandySettings
  private _connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private _deviceInfo: HandyDeviceInfo | null = null
  private _isPlaying: boolean = false
  private _eventSource: EventSource | null = null
  private _scriptPrepared: boolean = false

  // HSP state tracking
  private _hspState: HspState | null = null
  private _hspStreamIndex: number = 0

  readonly id: string = 'handy'
  readonly name: string = 'Handy'
  readonly type: string = 'handy'
  readonly capabilities: DeviceCapability[] = [
    DeviceCapability.LINEAR,
    DeviceCapability.STROKE,
  ]

  /**
   * Create a new Handy device instance
   * @param config Optional configuration
   */
  constructor(config?: HandyConfig) {
    super()

    this._config = { ...DEFAULT_CONFIG }

    // Set up configuration
    if (config?.connectionKey) {
      this._config.connectionKey = config.connectionKey
    }

    // Create the API client
    this._api = createHandyApi(
      config?.baseV3Url || 'https://www.handyfeeling.com/api/handy-rest/v3',
      config?.baseV2Url || 'https://www.handyfeeling.com/api/hosting/v2',
      config?.applicationId || '12345',
      this._config.connectionKey,
    )
  }

  /**
   * Get the API instance for direct access
   */
  get api(): HandyApi {
    return this._api
  }

  /**
   * Get device connection state
   */
  get isConnected(): boolean {
    return this._connectionState === ConnectionState.CONNECTED
  }

  /**
   * Get device playback state
   */
  get isPlaying(): boolean {
    return this._isPlaying
  }

  /**
   * Get current HSP state
   */
  get hspState(): HspState | null {
    return this._hspState
  }

  /**
   * Connect to the device
   * @param config Optional configuration override
   */
  async connect(config?: Partial<HandySettings>): Promise<boolean> {
    try {
      // Update config if provided
      if (config) {
        this.updateConfig(config)
      }

      // Validate connection key
      if (
        !this._config.connectionKey ||
        this._config.connectionKey.length < 5
      ) {
        this.emit('error', 'Connection key must be at least 5 characters')
        return false
      }

      // Update connection state
      this._connectionState = ConnectionState.CONNECTING
      this.emit('connectionStateChanged', this._connectionState)

      // Synchronize time
      await this._api.syncServerTime()

      // Create event source for server-sent events
      this._eventSource = this._api.createEventSource()

      // Set up event handlers
      this._setupEventHandlers()

      // Get initial device info
      const isConnected = await this._api.isConnected()
      if (isConnected) {
        this._deviceInfo = await this._api.getDeviceInfo()
        this._connectionState = ConnectionState.CONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('connected', this._deviceInfo)

        // Get device settings after connection
        await this._loadDeviceSettings()

        return true
      } else {
        this._connectionState = ConnectionState.DISCONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('error', 'Failed to connect to device')
        return false
      }
    } catch (error) {
      console.error('Handy: Error connecting to device:', error)
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
      // Stop playback if active
      if (this._isPlaying) {
        await this.stop()
      }

      // Close event source
      if (this._eventSource) {
        this._eventSource.close()
        this._eventSource = null
      }

      // Update state immediately
      this._connectionState = ConnectionState.DISCONNECTED
      this._deviceInfo = null
      this._isPlaying = false
      this._hspState = null
      this._scriptPrepared = false

      // Emit events
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')

      return true
    } catch (error) {
      console.error('Handy: Error disconnecting device:', error)

      // Set disconnected state even in case of error
      this._connectionState = ConnectionState.DISCONNECTED
      this._deviceInfo = null
      this._isPlaying = false

      // Emit events
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')

      return true
    }
  }

  /**
   * Get current device configuration
   */
  getConfig(): HandySettings {
    return { ...this._config }
  }

  /**
   * Update device configuration
   * @param config Partial configuration to update
   */
  async updateConfig(config: Partial<HandySettings>): Promise<boolean> {
    // Update local config
    if (config.connectionKey !== undefined) {
      this._config.connectionKey = config.connectionKey
      this._api.setConnectionKey(config.connectionKey)
    }

    // Update offset if connected
    if (config.offset !== undefined && this.isConnected) {
      this._config.offset = config.offset
      await this._api.setOffset(config.offset)
    } else if (config.offset !== undefined) {
      this._config.offset = config.offset
    }

    // Update stroke settings if connected
    if (config.stroke !== undefined && this.isConnected) {
      this._config.stroke = { ...this._config.stroke, ...config.stroke }
      await this._api.setStrokeSettings(this._config.stroke)
    } else if (config.stroke !== undefined) {
      this._config.stroke = { ...this._config.stroke, ...config.stroke }
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
   * Prepare a script for playback (upload to Handy server)
   * The funscript is already parsed - we just need to upload it
   *
   * @param funscript The parsed funscript content
   * @param _options Script options (inversion already applied by DeviceManager)
   */
  async prepareScript(funscript: Funscript): Promise<DeviceScriptLoadResult> {
    if (!this.isConnected) {
      return { success: false, error: 'Device not connected' }
    }

    try {
      // Convert funscript to blob and upload
      const blob = new Blob([JSON.stringify(funscript)], {
        type: 'application/json',
      })

      const uploadedUrl = await this._api.uploadScript(blob)
      if (!uploadedUrl) {
        return {
          success: false,
          error: 'Failed to upload script to Handy server',
        }
      }

      // Setup the script on the device
      const success = await this._api.setupScript(uploadedUrl)

      if (success) {
        this._scriptPrepared = true
        this.emit('scriptLoaded', {
          url: uploadedUrl,
          actions: funscript.actions.length,
        })
        return { success: true }
      } else {
        return { success: false, error: 'Failed to setup script on device' }
      }
    } catch (error) {
      console.error('Handy: Error preparing script:', error)
      return {
        success: false,
        error: `Script preparation error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
  }

  /**
   * Play the loaded script at the specified time (HSSP)
   * @param timeMs Current time in milliseconds
   * @param playbackRate Playback rate (1.0 = normal speed)
   * @param loop Whether to loop the script
   */
  async play(
    timeMs: number,
    playbackRate: number = 1.0,
    loop: boolean = false,
  ): Promise<boolean> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot play: Device not connected')
      return false
    }

    if (!this._scriptPrepared) {
      this.emit('error', 'Cannot play: No script prepared')
      return false
    }

    try {
      const hspState = await this._api.play(timeMs, playbackRate, loop)

      if (hspState) {
        this._isPlaying =
          hspState.play_state === 1 || hspState.play_state === '1'

        this.emit('playbackStateChanged', {
          isPlaying: this._isPlaying,
          timeMs,
          playbackRate,
          loop,
        })

        return true
      } else {
        this.emit('error', 'Failed to start playback')
        return false
      }
    } catch (error) {
      console.error('Handy: Error playing script:', error)
      this.emit(
        'error',
        `Playback error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return false
    }
  }

  /**
   * Stop playback (works for both HSSP and HSP)
   */
  async stop(): Promise<boolean> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot stop: Device not connected')
      return false
    }

    try {
      // Try HSP stop first, then HSSP stop
      let hspState = await this._api.hspStop()
      if (!hspState) {
        hspState = await this._api.stop()
      }

      if (hspState) {
        this._isPlaying =
          hspState.play_state === HspPlayState.PLAYING ||
          hspState.play_state === 1 ||
          hspState.play_state === '1'

        this._hspState = hspState

        this.emit('playbackStateChanged', {
          isPlaying: this._isPlaying,
        })

        return true
      } else {
        this.emit('error', 'Failed to stop playback')
        return false
      }
    } catch (error) {
      console.error('Handy: Error stopping:', error)
      this.emit(
        'error',
        `Stop error: ${error instanceof Error ? error.message : String(error)}`,
      )
      return false
    }
  }

  /**
   * Synchronize device time with provided time
   * @param timeMs Current time in milliseconds
   */
  async syncTime(timeMs: number, filter: number = 0.5): Promise<boolean> {
    if (!this.isConnected || !this._isPlaying) {
      return false
    }

    try {
      return await this._api.syncVideoTime(timeMs, filter)
    } catch (error) {
      console.error('Handy: Error syncing time:', error)
      return false
    }
  }

  /**
   * Get device-specific information
   */
  getDeviceInfo(): DeviceInfo | null {
    if (!this._deviceInfo) return null

    return {
      id: this.id,
      name: this.name,
      type: this.type,
      firmware: this._deviceInfo.fw_version,
      hardware: this._deviceInfo.hw_model_name,
      sessionId: this._deviceInfo.session_id,
      ...this._deviceInfo,
    }
  }

  // ============================================
  // HSP (Handy Streaming Protocol) Methods
  // ============================================

  /**
   * Initialize a new HSP session.
   * This clears any existing session state and prepares the device for streaming.
   * @param streamId Optional custom stream ID
   */
  async hspSetup(streamId?: number): Promise<HspState | null> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot setup HSP: Device not connected')
      return null
    }

    try {
      const state = await this._api.hspSetup(streamId)
      if (state) {
        this._hspState = state
        this._hspStreamIndex = 0
        this.emit('hspStateChanged', state)
      }
      return state
    } catch (error) {
      console.error('Handy: Error setting up HSP:', error)
      this.emit(
        'error',
        `HSP setup error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  /**
   * Get the current HSP state from the device
   */
  async hspGetState(): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspGetState()
      if (state) {
        this._hspState = state
      }
      return state
    } catch (error) {
      console.error('Handy: Error getting HSP state:', error)
      return null
    }
  }

  /**
   * Add points to the HSP buffer.
   * Points are {t, x} where:
   *   - t: timestamp in ms relative to start (t=0)
   *   - x: position 0-100 (0=bottom, 100=top)
   *
   * @param points Array of points to add (max 100 per call)
   * @param flush If true, clear buffer before adding
   */
  async hspAddPoints(
    points: HspPoint[],
    flush: boolean = false,
  ): Promise<HspState | null> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot add HSP points: Device not connected')
      return null
    }

    try {
      // Update stream index
      this._hspStreamIndex += points.length

      const state = await this._api.hspAddPoints(
        points,
        this._hspStreamIndex,
        flush,
      )

      if (state) {
        this._hspState = state
        this.emit('hspStateChanged', state)
      }

      return state
    } catch (error) {
      console.error('Handy: Error adding HSP points:', error)
      this.emit(
        'error',
        `HSP add points error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  /**
   * Start HSP playback
   * @param startTime Time to start from (in ms, relative to points)
   * @param options Playback options
   */
  async hspPlay(
    startTime: number = 0,
    options: {
      playbackRate?: number
      pauseOnStarving?: boolean
      loop?: boolean
    } = {},
  ): Promise<HspState | null> {
    if (!this.isConnected) {
      this.emit('error', 'Cannot start HSP: Device not connected')
      return null
    }

    try {
      const state = await this._api.hspPlay(startTime, options)

      if (state) {
        this._hspState = state
        this._isPlaying =
          state.play_state === HspPlayState.PLAYING ||
          state.play_state === 1 ||
          state.play_state === '1'

        this.emit('hspStateChanged', state)
        this.emit('playbackStateChanged', {
          isPlaying: this._isPlaying,
          timeMs: startTime,
          playbackRate: options.playbackRate ?? 1.0,
          loop: options.loop ?? false,
        })
      }

      return state
    } catch (error) {
      console.error('Handy: Error starting HSP playback:', error)
      this.emit(
        'error',
        `HSP play error: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return null
    }
  }

  /**
   * Stop HSP playback
   */
  async hspStop(): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspStop()

      if (state) {
        this._hspState = state
        this._isPlaying = false
        this.emit('hspStateChanged', state)
        this.emit('playbackStateChanged', { isPlaying: false })
      }

      return state
    } catch (error) {
      console.error('Handy: Error stopping HSP:', error)
      return null
    }
  }

  /**
   * Pause HSP playback
   */
  async hspPause(): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspPause()

      if (state) {
        this._hspState = state
        this._isPlaying = false
        this.emit('hspStateChanged', state)
        this.emit('playbackStateChanged', { isPlaying: false })
      }

      return state
    } catch (error) {
      console.error('Handy: Error pausing HSP:', error)
      return null
    }
  }

  /**
   * Resume HSP playback
   * @param pickUp If true, resumes from current live position. If false, from paused position.
   */
  async hspResume(pickUp: boolean = false): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspResume(pickUp)

      if (state) {
        this._hspState = state
        this._isPlaying =
          state.play_state === HspPlayState.PLAYING ||
          state.play_state === 1 ||
          state.play_state === '1'

        this.emit('hspStateChanged', state)
        this.emit('playbackStateChanged', { isPlaying: this._isPlaying })
      }

      return state
    } catch (error) {
      console.error('Handy: Error resuming HSP:', error)
      return null
    }
  }

  /**
   * Flush the HSP buffer (remove all points)
   */
  async hspFlush(): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspFlush()

      if (state) {
        this._hspState = state
        this._hspStreamIndex = 0
        this.emit('hspStateChanged', state)
      }

      return state
    } catch (error) {
      console.error('Handy: Error flushing HSP:', error)
      return null
    }
  }

  /**
   * Set HSP loop mode
   */
  async hspSetLoop(loop: boolean): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspSetLoop(loop)
      if (state) {
        this._hspState = state
        this.emit('hspStateChanged', state)
      }
      return state
    } catch (error) {
      console.error('Handy: Error setting HSP loop:', error)
      return null
    }
  }

  /**
   * Set HSP playback rate
   */
  async hspSetPlaybackRate(rate: number): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspSetPlaybackRate(rate)
      if (state) {
        this._hspState = state
        this.emit('hspStateChanged', state)
      }
      return state
    } catch (error) {
      console.error('Handy: Error setting HSP playback rate:', error)
      return null
    }
  }

  /**
   * Sync HSP time with external source
   */
  async hspSyncTime(
    currentTime: number,
    filter: number = 0.5,
  ): Promise<HspState | null> {
    if (!this.isConnected || !this._isPlaying) {
      return null
    }

    try {
      const state = await this._api.hspSyncTime(currentTime, filter)
      if (state) {
        this._hspState = state
        this.emit('hspStateChanged', state)
      }
      return state
    } catch (error) {
      console.error('Handy: Error syncing HSP time:', error)
      return null
    }
  }

  /**
   * Set pause-on-starving flag
   * When enabled, device clock pauses when buffer runs out and resumes when points are added
   */
  async hspSetPauseOnStarving(pause: boolean): Promise<HspState | null> {
    if (!this.isConnected) {
      return null
    }

    try {
      const state = await this._api.hspSetPauseOnStarving(pause)
      if (state) {
        this._hspState = state
        this.emit('hspStateChanged', state)
      }
      return state
    } catch (error) {
      console.error('Handy: Error setting pause on starving:', error)
      return null
    }
  }

  /**
   * Get the current stream index for tracking
   */
  getHspStreamIndex(): number {
    return this._hspStreamIndex
  }

  /**
   * Reset the stream index (call after hspSetup)
   */
  resetHspStreamIndex(): void {
    this._hspStreamIndex = 0
  }

  // ============================================
  // Private Methods
  // ============================================

  /**
   * Set up event handlers for the device
   */
  private _setupEventHandlers(): void {
    if (!this._eventSource) return

    this._eventSource.onerror = (error) => {
      console.error('EventSource error:', error)
      this.emit('error', 'Connection to device lost')
    }

    this._eventSource.addEventListener('device_status', (event) => {
      const data = JSON.parse(event.data)
      this._deviceInfo = data.data.info
      const connected = data.data.connected

      if (connected && this._connectionState !== ConnectionState.CONNECTED) {
        this._connectionState = ConnectionState.CONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('connected', this._deviceInfo)
      } else if (
        !connected &&
        this._connectionState === ConnectionState.CONNECTED
      ) {
        this._connectionState = ConnectionState.DISCONNECTED
        this.emit('connectionStateChanged', this._connectionState)
        this.emit('disconnected')
      }
    })

    this._eventSource.addEventListener('device_connected', (event) => {
      const data = JSON.parse(event.data)
      this._deviceInfo = data.data.info
      this._connectionState = ConnectionState.CONNECTED
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('connected', this._deviceInfo)
    })

    this._eventSource.addEventListener('device_disconnected', () => {
      this._connectionState = ConnectionState.DISCONNECTED
      this.emit('connectionStateChanged', this._connectionState)
      this.emit('disconnected')
    })

    this._eventSource.addEventListener('mode_changed', () => {
      this._isPlaying = false
      this.emit('playbackStateChanged', { isPlaying: false })
    })

    // HSP-specific events
    this._eventSource.addEventListener('hsp_state_changed', (event) => {
      const data = JSON.parse(event.data)
      const state = data.data?.data as HspState

      if (state) {
        this._hspState = state
        this._isPlaying =
          state.play_state === HspPlayState.PLAYING ||
          state.play_state === 1 ||
          state.play_state === '1'

        this.emit('hspStateChanged', state)
        this.emit('playbackStateChanged', { isPlaying: this._isPlaying })
      }
    })

    this._eventSource.addEventListener('hsp_starving', (event) => {
      const data = JSON.parse(event.data)
      this.emit('hspStarving', data.data?.data)
    })

    this._eventSource.addEventListener('hsp_threshold_reached', (event) => {
      const data = JSON.parse(event.data)
      this.emit('hspThresholdReached', data.data?.data)
    })

    this._eventSource.addEventListener('hsp_looping', (event) => {
      const data = JSON.parse(event.data)
      this.emit('hspLooping', data.data?.data)
    })
  }

  /**
   * Load device settings after connection
   */
  private async _loadDeviceSettings(): Promise<void> {
    if (!this.isConnected) return

    try {
      // Get device offset
      const offset = await this._api.getOffset()
      if (offset !== undefined) {
        this._config.offset = offset
      }

      // Get stroke settings
      const strokeSettings = await this._api.getStrokeSettings()
      if (strokeSettings) {
        this._config.stroke = {
          min: strokeSettings.min,
          max: strokeSettings.max,
        }
      }

      // Emit config updated event
      this.emit('configChanged', this._config)
    } catch (error) {
      console.error('Handy: Error loading device settings:', error)
    }
  }
}
