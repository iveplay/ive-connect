/**
 * Handy API Implementation
 *
 * Based on the official Handy API
 */
import {
  HandyDeviceInfo,
  HandyTimeInfo,
  HspState,
  ApiResponse,
  OffsetResponse,
  StrokeSettings,
  UploadResponse,
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
   * Stop playback
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
   * Synchronize the device's time with video time
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
