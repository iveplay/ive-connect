/**
 * Handy API Implementation
 *
 * Based on the official Handy API v3
 */
import {
  HandyDeviceInfo,
  HandyTimeInfo,
  HspState,
  HspPoint,
  HspAddRequest,
  HspPlayRequest,
  ApiResponse,
  OffsetResponse,
  StrokeSettings,
} from "./types";

export class HandyApi {
  private readonly baseV3Url: string;
  private readonly baseV2Url: string;
  private readonly applicationId: string;
  private connectionKey: string;
  private serverTimeOffset = 0;
  private _eventSource: EventSource | null = null;

  constructor(
    baseV3Url: string,
    baseV2Url: string,
    applicationId: string,
    connectionKey = ""
  ) {
    this.baseV3Url = baseV3Url;
    this.baseV2Url = baseV2Url;
    this.applicationId = applicationId;
    this.connectionKey = connectionKey;
  }

  /**
   * Set the connection key for API requests
   */
  public setConnectionKey(connectionKey: string): void {
    this.connectionKey = connectionKey;
  }

  /**
   * Get the connection key
   */
  public getConnectionKey(): string {
    return this.connectionKey;
  }

  /**
   * Set the server time offset for synchronization
   */
  public setServerTimeOffset(offset: number): void {
    this.serverTimeOffset = offset;
  }

  /**
   * Get the server time offset
   */
  public getServerTimeOffset(): number {
    return this.serverTimeOffset;
  }

  /**
   * Estimate the current server time based on local time and offset
   */
  public estimateServerTime(): number {
    return Math.round(Date.now() + this.serverTimeOffset);
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(): HeadersInit {
    return {
      "X-Connection-Key": this.connectionKey,
      Authorization: `Bearer ${this.applicationId}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  /**
   * Make an API request with error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useV2 = false
  ): Promise<ApiResponse<T>> {
    try {
      const baseUrl = useV2 ? this.baseV2Url : this.baseV3Url;
      const response = await fetch(`${baseUrl}${endpoint}`, {
        ...options,
        headers: {
          ...this.getHeaders(),
          ...options.headers,
        },
      });

      const data = await response.json();
      return data as ApiResponse<T>;
    } catch (error) {
      console.error(`API error (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Check if the device is connected
   */
  public async isConnected(): Promise<boolean> {
    try {
      const response = await this.request<{ connected: boolean }>("/connected");
      return !!response.result?.connected;
    } catch (error) {
      console.error("Handy: Error checking connection:", error);
      return false;
    }
  }

  /**
   * Get device information
   */
  public async getDeviceInfo(): Promise<HandyDeviceInfo | null> {
    try {
      const response = await this.request<HandyDeviceInfo>("/info");
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error getting device info:", error);
      return null;
    }
  }

  /**
   * Get the current device mode
   */
  public async getMode(): Promise<number | null> {
    try {
      const response = await this.request<{ mode: number }>("/mode");
      return response.result?.mode ?? null;
    } catch (error) {
      console.error("Handy: Error getting mode:", error);
      return null;
    }
  }

  /**
   * Upload a script file to the hosting service
   * Returns the URL where the script can be accessed
   */
  public async uploadScript(scriptFile: File | Blob): Promise<string | null> {
    try {
      // Convert Blob to File if needed
      const file =
        scriptFile instanceof File
          ? scriptFile
          : new File([scriptFile], "script.funscript", {
              type: "application/json",
            });

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${this.baseV2Url}/upload`, {
        method: "POST",
        body: formData,
        mode: "cors",
        credentials: "omit",
      });

      const data = (await response.json()) as { url: string };
      return data.url || null;
    } catch (error) {
      console.error("Handy: Error uploading script:", error);
      return null;
    }
  }

  // ============================================
  // HSSP (Handy Synchronized Script Protocol)
  // ============================================

  /**
   * Setup script for HSSP playback
   */
  public async setupScript(scriptUrl: string): Promise<boolean> {
    try {
      const response = await this.request<HspState>("/hssp/setup", {
        method: "PUT",
        body: JSON.stringify({ url: scriptUrl }),
      });
      return !!response.result?.stream_id;
    } catch (error) {
      console.error("Handy: Error setting up script:", error);
      return false;
    }
  }

  /**
   * Start playback with the HSSP protocol
   */
  public async play(
    videoTime: number,
    playbackRate = 1.0,
    loop = false
  ): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hssp/play", {
        method: "PUT",
        body: JSON.stringify({
          start_time: Math.round(videoTime),
          server_time: this.estimateServerTime(),
          playback_rate: playbackRate,
          loop,
        }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error starting playback:", error);
      return null;
    }
  }

  /**
   * Stop HSSP playback
   */
  public async stop(): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hssp/stop", {
        method: "PUT",
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error stopping playback:", error);
      return null;
    }
  }

  /**
   * Synchronize the device's time with video time (HSSP)
   */
  public async syncVideoTime(
    videoTime: number,
    filter = 0.5
  ): Promise<boolean> {
    try {
      const response = await this.request<HspState>("/hssp/synctime", {
        method: "PUT",
        body: JSON.stringify({
          current_time: Math.round(videoTime),
          server_time: this.estimateServerTime(),
          filter,
        }),
      });
      return !!response.result?.stream_id;
    } catch (error) {
      console.error("Handy: Error syncing video time:", error);
      return false;
    }
  }

  // ============================================
  // HSP (Handy Streaming Protocol)
  // ============================================

  /**
   * Setup a new HSP session on the device.
   * This clears any existing HSP session state.
   * @param streamId Optional session identifier. If not provided, one will be generated.
   */
  public async hspSetup(streamId?: number): Promise<HspState | null> {
    try {
      const body = streamId ? { stream_id: streamId } : {};
      const response = await this.request<HspState>("/hsp/setup", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting up HSP:", error);
      return null;
    }
  }

  /**
   * Get the current HSP state
   */
  public async hspGetState(): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/state");
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error getting HSP state:", error);
      return null;
    }
  }

  /**
   * Add points to the HSP buffer.
   * You can add up to 100 points in a single command.
   * @param points Array of points to add (max 100)
   * @param tailPointStreamIndex The index of the last point relative to the overall stream
   * @param flush If true, clears buffer before adding new points
   * @param tailPointThreshold Optional threshold for starving notifications
   */
  public async hspAddPoints(
    points: HspPoint[],
    tailPointStreamIndex: number,
    flush: boolean = false,
    tailPointThreshold?: number
  ): Promise<HspState | null> {
    try {
      const body: HspAddRequest = {
        points,
        tail_point_stream_index: tailPointStreamIndex,
        flush,
      };

      if (tailPointThreshold !== undefined) {
        body.tail_point_threshold = tailPointThreshold;
      }

      const response = await this.request<HspState>("/hsp/add", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error adding HSP points:", error);
      return null;
    }
  }

  /**
   * Start HSP playback
   * @param startTime The start time in milliseconds
   * @param options Optional playback options
   */
  public async hspPlay(
    startTime: number,
    options: {
      serverTime?: number;
      playbackRate?: number;
      pauseOnStarving?: boolean;
      loop?: boolean;
      addPoints?: HspAddRequest;
    } = {}
  ): Promise<HspState | null> {
    try {
      const body: HspPlayRequest = {
        start_time: Math.round(startTime),
        server_time: options.serverTime ?? this.estimateServerTime(),
      };

      if (options.playbackRate !== undefined) {
        body.playback_rate = options.playbackRate;
      }
      if (options.pauseOnStarving !== undefined) {
        body.pause_on_starving = options.pauseOnStarving;
      }
      if (options.loop !== undefined) {
        body.loop = options.loop;
      }
      if (options.addPoints) {
        body.add = options.addPoints;
      }

      const response = await this.request<HspState>("/hsp/play", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error starting HSP playback:", error);
      return null;
    }
  }

  /**
   * Stop HSP playback
   */
  public async hspStop(): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/stop", {
        method: "PUT",
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error stopping HSP:", error);
      return null;
    }
  }

  /**
   * Pause HSP playback
   */
  public async hspPause(): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/pause", {
        method: "PUT",
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error pausing HSP:", error);
      return null;
    }
  }

  /**
   * Resume HSP playback
   * @param pickUp If true, resumes from current 'live' position. If false, resumes from paused position.
   */
  public async hspResume(pickUp: boolean = false): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/resume", {
        method: "PUT",
        body: JSON.stringify({ pick_up: pickUp }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error resuming HSP:", error);
      return null;
    }
  }

  /**
   * Flush the HSP buffer (remove all points)
   */
  public async hspFlush(): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/flush", {
        method: "PUT",
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error flushing HSP buffer:", error);
      return null;
    }
  }

  /**
   * Set the HSP loop flag
   */
  public async hspSetLoop(loop: boolean): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/loop", {
        method: "PUT",
        body: JSON.stringify({ loop }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting HSP loop:", error);
      return null;
    }
  }

  /**
   * Set the HSP playback rate
   */
  public async hspSetPlaybackRate(
    playbackRate: number
  ): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/playbackrate", {
        method: "PUT",
        body: JSON.stringify({ playback_rate: playbackRate }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting HSP playback rate:", error);
      return null;
    }
  }

  /**
   * Set the HSP tail point stream index threshold
   */
  public async hspSetThreshold(threshold: number): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/threshold", {
        method: "PUT",
        body: JSON.stringify({ tail_point_threshold: threshold }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting HSP threshold:", error);
      return null;
    }
  }

  /**
   * Set the HSP pause-on-starving flag
   */
  public async hspSetPauseOnStarving(
    pauseOnStarving: boolean
  ): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/pause/onstarving", {
        method: "PUT",
        body: JSON.stringify({ pause_on_starving: pauseOnStarving }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting HSP pause on starving:", error);
      return null;
    }
  }

  /**
   * Sync HSP time with external source
   * @param currentTime Current time from external source
   * @param filter Filter value for gradual adjustment (0-1)
   */
  public async hspSyncTime(
    currentTime: number,
    filter: number = 0.5
  ): Promise<HspState | null> {
    try {
      const response = await this.request<HspState>("/hsp/synctime", {
        method: "PUT",
        body: JSON.stringify({
          current_time: Math.round(currentTime),
          server_time: this.estimateServerTime(),
          filter,
        }),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error syncing HSP time:", error);
      return null;
    }
  }

  // ============================================
  // HSTP (Handy Simple Timing Protocol)
  // ============================================

  /**
   * Get the current time offset
   */
  public async getOffset(): Promise<number> {
    try {
      const response = await this.request<OffsetResponse>("/hstp/offset");
      return response.result?.offset || 0;
    } catch (error) {
      console.error("Handy: Error getting offset:", error);
      return 0;
    }
  }

  /**
   * Set the time offset
   */
  public async setOffset(offset: number): Promise<boolean> {
    try {
      const response = await this.request<string>("/hstp/offset", {
        method: "PUT",
        body: JSON.stringify({ offset }),
      });
      return response.result === "ok";
    } catch (error) {
      console.error("Handy: Error setting offset:", error);
      return false;
    }
  }

  /**
   * Get device time info
   */
  public async getDeviceTimeInfo(): Promise<HandyTimeInfo | null> {
    try {
      const response = await this.request<HandyTimeInfo>("/hstp/info");
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error getting device time info:", error);
      return null;
    }
  }

  /**
   * Trigger a server-device clock synchronization
   */
  public async clockSync(
    synchronous: boolean = true
  ): Promise<HandyTimeInfo | null> {
    try {
      const response = await this.request<HandyTimeInfo>(
        `/hstp/clocksync?s=${synchronous}`
      );
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error triggering clock sync:", error);
      return null;
    }
  }

  // ============================================
  // Slider Settings
  // ============================================

  /**
   * Get the current stroke settings
   */
  public async getStrokeSettings(): Promise<StrokeSettings | null> {
    try {
      const response = await this.request<StrokeSettings>("/slider/stroke");
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error getting stroke settings:", error);
      return null;
    }
  }

  /**
   * Set the stroke settings
   */
  public async setStrokeSettings(settings: {
    min: number;
    max: number;
  }): Promise<StrokeSettings | null> {
    try {
      const response = await this.request<StrokeSettings>("/slider/stroke", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      return response.result || null;
    } catch (error) {
      console.error("Handy: Error setting stroke settings:", error);
      return null;
    }
  }

  // ============================================
  // Server Time Sync
  // ============================================

  /**
   * Get the server time for synchronization calculations
   */
  public async getServerTime(): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseV3Url}/servertime`);
      const data = await response.json();
      return data.server_time || null;
    } catch (error) {
      console.error("Handy: Error getting server time:", error);
      return null;
    }
  }

  /**
   * Synchronize time with the server
   * Returns calculated server time offset
   */
  public async syncServerTime(sampleCount = 10): Promise<number> {
    try {
      const samples: { rtd: number; offset: number }[] = [];

      for (let i = 0; i < sampleCount; i++) {
        try {
          const start = Date.now();
          const serverTime = await this.getServerTime();

          if (!serverTime) continue;

          const end = Date.now();
          const rtd = end - start; // Round trip delay
          const serverTimeEst = rtd / 2 + serverTime;

          samples.push({
            rtd,
            offset: serverTimeEst - end,
          });
        } catch (error) {
          console.warn("Error during time sync sample:", error);
          // Continue with other samples
        }
      }

      // Sort samples by RTD (Round Trip Delay) to get the most accurate ones
      if (samples.length > 0) {
        samples.sort((a, b) => a.rtd - b.rtd);

        // Use 80% of the most accurate samples if we have enough
        const usableSamples =
          samples.length > 3
            ? samples.slice(0, Math.ceil(samples.length * 0.8))
            : samples;

        const averageOffset =
          usableSamples.reduce((acc, sample) => acc + sample.offset, 0) /
          usableSamples.length;

        this.serverTimeOffset = averageOffset;
        return averageOffset;
      }

      return this.serverTimeOffset;
    } catch (error) {
      console.error("Error syncing time:", error);
      return this.serverTimeOffset;
    }
  }

  // ============================================
  // SSE (Server-Sent Events)
  // ============================================

  /**
   * Create an EventSource for server-sent events
   */
  public createEventSource(): EventSource {
    if (this._eventSource) {
      this._eventSource.close();
    }

    this._eventSource = new EventSource(
      `${this.baseV3Url}/sse?ck=${this.connectionKey}&apikey=${this.applicationId}`
    );

    return this._eventSource;
  }

  /**
   * Close the EventSource if it exists
   */
  public closeEventSource(): void {
    if (this._eventSource) {
      this._eventSource.close();
      this._eventSource = null;
    }
  }
}

// Factory function to create HandyApi instances
export const createHandyApi = (
  baseV3Url: string,
  baseV2Url: string,
  applicationId: string,
  connectionKey = ""
): HandyApi => {
  return new HandyApi(baseV3Url, baseV2Url, applicationId, connectionKey);
};
