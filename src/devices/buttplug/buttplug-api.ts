/**
 * Buttplug API — high-level device management over Buttplug v4 protocol
 */
import { EventEmitter } from '../../core/events'
import {
  ButtplugConnectionState,
  ButtplugConnectionType,
  ButtplugDeviceInfo,
  DevicePreference,
} from './types'
import { ButtplugWs } from './buttplug-ws'

interface FeatureOutput {
  Value: number[] // [min, max] step range
  Duration?: number
}

interface DeviceFeature {
  featureIndex: number
  type: string
  maxSteps: number // max value from Output[type].Value[1]
}

export class ButtplugApi extends EventEmitter {
  private ws: ButtplugWs
  private devices = new Map<number, ButtplugDeviceInfo>()
  private devicePreferences = new Map<number, DevicePreference>()
  private features = new Map<number, DeviceFeature[]>()
  public isScanning = false
  private connectionState = ButtplugConnectionState.DISCONNECTED
  private connectedUrl?: string
  private clientName: string

  constructor(clientName: string = 'IVE-Connect') {
    super()
    this.clientName = clientName
    this.ws = new ButtplugWs((type, payload) => this.onMessage(type, payload))
  }

  getConnectionState(): ButtplugConnectionState {
    return this.connectionState
  }
  getConnectedUrl(): string | undefined {
    return this.connectedUrl
  }
  getDevices(): ButtplugDeviceInfo[] {
    return Array.from(this.devices.values())
  }
  getIsScanning(): boolean {
    return this.isScanning
  }
  getDevicePreferences(): Map<number, DevicePreference> {
    return this.devicePreferences
  }

  setDevicePreference(index: number, pref: DevicePreference): void {
    this.devicePreferences.set(index, pref)
    this.emit('devicePreferenceChanged', {
      deviceIndex: index,
      preference: pref,
    })
  }

  // ── Connection ──────────────────────────────────────────────────

  async connect(
    type: ButtplugConnectionType,
    serverUrl?: string,
  ): Promise<boolean> {
    if (this.connectionState !== ButtplugConnectionState.DISCONNECTED) {
      await this.disconnect()
    }
    if (type !== ButtplugConnectionType.WEBSOCKET || !serverUrl) {
      this.emit('error', 'WebSocket URL required')
      return false
    }

    try {
      this.connectionState = ButtplugConnectionState.CONNECTING
      this.emit('connectionStateChanged', this.connectionState)

      await this.ws.open(serverUrl, this.clientName)

      this.connectedUrl = serverUrl
      this.connectionState = ButtplugConnectionState.CONNECTED
      this.emit('connectionStateChanged', this.connectionState)
      return true
    } catch (e) {
      console.error('Buttplug connect error:', e)
      this.cleanup()
      this.emit('error', e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async disconnect(): Promise<boolean> {
    this.ws.close()
    this.cleanup()
    return true
  }

  // ── Scanning ────────────────────────────────────────────────────

  async startScanning(): Promise<boolean> {
    if (!this.ws.connected) return false
    try {
      this.isScanning = true
      this.emit('scanningChanged', true)
      await this.ws.send('StartScanning', {})
      return true
    } catch (e) {
      this.isScanning = false
      this.emit('scanningChanged', false)
      this.emit('error', e instanceof Error ? e.message : String(e))
      return false
    }
  }

  async stopScanning(): Promise<boolean> {
    if (!this.ws.connected) return false
    try {
      await this.ws.send('StopScanning', {})
      return true
    } catch {
      this.isScanning = false
      this.emit('scanningChanged', false)
      return false
    }
  }

  // ── Device commands ─────────────────────────────────────────────

  async vibrateDevice(index: number, speed: number): Promise<boolean> {
    return this.outputCmd(index, 'Vibrate', speed)
  }

  async linearDevice(
    index: number,
    position: number,
    duration: number,
  ): Promise<boolean> {
    const feat = this.findFeature(index, 'HwPositionWithDuration')
    if (!feat) return false
    try {
      const value = Math.ceil(
        feat.maxSteps * Math.min(1, Math.max(0, position)),
      )
      await this.ws.send('OutputCmd', {
        DeviceIndex: index,
        FeatureIndex: feat.featureIndex,
        Command: {
          HwPositionWithDuration: {
            Value: value,
            Duration: Math.round(duration),
          },
        },
      })
      return true
    } catch {
      return false
    }
  }

  async rotateDevice(
    index: number,
    speed: number,
    _clockwise: boolean,
  ): Promise<boolean> {
    return this.outputCmd(index, 'Rotate', speed)
  }

  async oscillateDevice(
    index: number,
    speed: number,
    _frequency: number,
  ): Promise<boolean> {
    return this.outputCmd(index, 'Oscillate', speed)
  }

  async stopDevice(index: number): Promise<boolean> {
    const d = this.devices.get(index)
    if (!d) return false
    try {
      if (d.canVibrate) await this.outputCmd(index, 'Vibrate', 0.01)
      else if (d.canRotate) await this.outputCmd(index, 'Rotate', 0.01)
      else if (d.canLinear) await this.linearDevice(index, 0.01, 500)

      await this.delay(100)
      await this.ws.send('StopCmd', {
        DeviceIndex: index,
        FeatureIndex: undefined,
        Inputs: true,
        Outputs: true,
      })
      return true
    } catch {
      return false
    }
  }

  async stopAllDevices(): Promise<boolean> {
    if (!this.ws.connected) return false
    try {
      for (const d of this.devices.values()) {
        try {
          if (d.canVibrate) await this.outputCmd(d.index, 'Vibrate', 0.01)
          else if (d.canRotate) await this.outputCmd(d.index, 'Rotate', 0.01)
          else if (d.canLinear) await this.linearDevice(d.index, 0.01, 500)
        } catch {}
      }
      await this.delay(100)
      await this.ws.send('StopCmd', {
        DeviceIndex: undefined,
        FeatureIndex: undefined,
        Inputs: true,
        Outputs: true,
      })
      return true
    } catch {
      return false
    }
  }

  // ── Internals ───────────────────────────────────────────────────

  private onMessage(type: string, payload: any): void {
    switch (type) {
      case 'DeviceAdded':
        this.addDevice(payload)
        break
      case 'DeviceRemoved':
        this.removeDevice(payload.DeviceIndex)
        break
      case 'DeviceList': {
        // DeviceList.Devices is an object keyed by index
        const incoming = payload.Devices || {}
        // Add new devices
        for (const dev of Object.values(incoming)) {
          this.addDevice(dev)
        }
        // Remove devices no longer in the list
        for (const index of this.devices.keys()) {
          if (!incoming.hasOwnProperty(index.toString())) {
            this.removeDevice(index)
          }
        }
        break
      }
      case 'ScanningFinished':
        this.isScanning = false
        this.emit('scanningChanged', false)
        break
    }
  }

  private addDevice(dev: any): void {
    // DeviceFeatures is an object keyed by feature index
    const rawFeatures: Record<string, any> = dev.DeviceFeatures || {}
    const parsed: DeviceFeature[] = []

    for (const [idx, feat] of Object.entries(rawFeatures)) {
      const output: Record<string, FeatureOutput> | undefined = (feat as any)
        .Output
      if (!output) continue
      for (const [outputType, outputDef] of Object.entries(output)) {
        parsed.push({
          featureIndex: parseInt(idx),
          type: outputType,
          maxSteps: outputDef.Value?.[1] ?? outputDef.Value ?? 100,
        })
      }
    }

    this.features.set(dev.DeviceIndex, parsed)

    const has = (t: string) => parsed.some((f) => f.type === t)
    const info: ButtplugDeviceInfo = {
      index: dev.DeviceIndex,
      name: dev.DeviceDisplayName || dev.DeviceName,
      canVibrate: has('Vibrate'),
      canLinear: has('Position') || has('HwPositionWithDuration'),
      canRotate: has('Rotate'),
      canOscillate: has('Oscillate'),
    }

    this.devices.set(dev.DeviceIndex, info)
    if (!this.devicePreferences.has(dev.DeviceIndex)) {
      this.devicePreferences.set(dev.DeviceIndex, {
        enabled: true,
        useVibrate: info.canVibrate,
        useRotate: info.canRotate,
        useLinear: info.canLinear,
        useOscillate: info.canOscillate,
      })
    }
    this.emit('deviceAdded', info)
  }

  private removeDevice(index: number): void {
    const info = this.devices.get(index)
    if (!info) return
    this.devices.delete(index)
    this.features.delete(index)
    this.emit('deviceRemoved', info)
  }

  private findFeature(
    deviceIndex: number,
    type: string,
  ): DeviceFeature | undefined {
    return this.features.get(deviceIndex)?.find((f) => f.type === type)
  }

  private async outputCmd(
    deviceIndex: number,
    outputType: string,
    percent: number,
  ): Promise<boolean> {
    const feat = this.findFeature(deviceIndex, outputType)
    if (!feat) return false
    try {
      const value = Math.ceil(
        feat.maxSteps * Math.min(1, Math.max(0, percent)),
      )
      await this.ws.send('OutputCmd', {
        DeviceIndex: deviceIndex,
        FeatureIndex: feat.featureIndex,
        Command: { [outputType]: { Value: value } },
      })
      return true
    } catch {
      return false
    }
  }

  private cleanup(): void {
    this.devices.clear()
    this.features.clear()
    this.isScanning = false
    this.connectionState = ButtplugConnectionState.DISCONNECTED
    this.connectedUrl = undefined
    this.emit('connectionStateChanged', this.connectionState)
    this.emit('scanningChanged', false)
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms))
  }
}
