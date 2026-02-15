/**
 * Minimal Buttplug v4 WebSocket transport
 */

const PROTOCOL_VERSION_MAJOR = 4
const PROTOCOL_VERSION_MINOR = 0

type PendingMsg = {
  resolve: (v: Record<string, unknown>) => void
  reject: (e: Error) => void
}

type MessageHandler = (type: string, payload: any) => void

export class ButtplugWs {
  private ws: WebSocket | null = null
  private msgId = 0
  private pending = new Map<number, PendingMsg>()
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private onMessage: MessageHandler

  constructor(onMessage: MessageHandler) {
    this.onMessage = onMessage
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  async open(url: string, clientName: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(url)
      } catch (err) {
        reject(err)
        return
      }

      this.ws.onopen = async () => {
        try {
          const info = await this.send('RequestServerInfo', {
            ClientName: clientName,
            ProtocolVersionMajor: PROTOCOL_VERSION_MAJOR,
            ProtocolVersionMinor: PROTOCOL_VERSION_MINOR,
          })

          if (info.MaxPingTime && (info.MaxPingTime as number) > 0) {
            this.pingTimer = setInterval(
              () => this.send('Ping', {}).catch(() => {}),
              Math.floor((info.MaxPingTime as number) / 2),
            )
          }

          await this.send('RequestDeviceList', {})
          resolve()
        } catch (err) {
          reject(err)
        }
      }

      this.ws.onerror = () => reject(new Error(`WS failed: ${url}`))
      this.ws.onclose = () => this.cleanup()
      this.ws.onmessage = (e: MessageEvent) => this.handleRaw(e.data as string)
    })
  }

  async send(
    type: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected'))
        return
      }
      const id = ++this.msgId
      this.pending.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify([{ [type]: { Id: id, ...payload } }]))
    })
  }

  close(): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.close()
    this.cleanup()
  }

  private handleRaw(data: string): void {
    let msgs: Record<string, Record<string, unknown>>[]
    try {
      msgs = JSON.parse(data)
    } catch {
      return
    }

    for (const msg of msgs) {
      const type = Object.keys(msg)[0]
      const payload = msg[type]
      const id = payload?.Id as number | undefined

      if (id !== undefined && this.pending.has(id)) {
        if (type === 'Error') {
          this.pending
            .get(id)!
            .reject(new Error(payload.ErrorMessage as string))
        } else {
          this.pending.get(id)!.resolve(payload)
        }
        this.pending.delete(id)
      }

      this.onMessage(type, payload)
    }
  }

  private cleanup(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    for (const p of this.pending.values()) {
      p.reject(new Error('Connection closed'))
    }
    this.pending.clear()
    this.ws = null
  }
}
