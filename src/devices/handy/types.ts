/**
 * Handy-specific types
 */
import { DeviceSettings } from "../../core/device-interface";

/**
 * Handy device information
 */
export interface HandyDeviceInfo {
  fw_version: string;
  hw_model_name: string;
  session_id: string;
  fw_status?: number;
  hw_model_no?: number;
  hw_model_variant?: number;
  fw_feature_flags?: string;
}

/**
 * HSP Point - a single point in the HSP buffer
 * t: timestamp in milliseconds relative to start time (t=0)
 * x: position [0-100] where 0=bottom, 100=top
 */
export interface HspPoint {
  t: number;
  x: number;
}

/**
 * HSP Add request - for adding points to the device buffer
 */
export interface HspAddRequest {
  points: HspPoint[];
  flush?: boolean;
  tail_point_stream_index: number;
  tail_point_threshold?: number;
}

/**
 * HSP Play request
 */
export interface HspPlayRequest {
  start_time: number;
  server_time?: number;
  playback_rate?: number;
  pause_on_starving?: boolean;
  loop?: boolean;
  add?: HspAddRequest;
}

/**
 * HSP Play state enum
 */
export enum HspPlayState {
  NOT_INITIALIZED = 0,
  PLAYING = 1,
  STOPPED = 2,
  PAUSED = 3,
  STARVING = 4,
}

/**
 * Handy time information for synchronization
 */
export interface HandyTimeInfo {
  time: number;
  clock_offset: number;
  rtd: number;
}

/**
 * Stroke offset response
 */
export interface OffsetResponse {
  offset: number;
}

/**
 * HSP State (Handy Streaming Protocol)
 */
export interface HspState {
  play_state: number | string;
  pause_on_starving?: boolean;
  points: number;
  max_points: number;
  current_point: number;
  current_time: number;
  loop: boolean;
  playback_rate: number;
  first_point_time: number;
  last_point_time: number;
  stream_id: number | string;
  tail_point_stream_index: number;
  tail_point_stream_index_threshold: number;
}

/**
 * Stroke settings
 */
export interface StrokeSettings {
  min: number;
  max: number;
  min_absolute?: number;
  max_absolute?: number;
}

/**
 * API response structure
 */
export interface ApiResponse<T = unknown> {
  result?: T;
  error?: {
    code: number;
    name: string;
    message: string;
    connected: boolean;
    data?: unknown;
  };
}

/**
 * Handy-specific device settings
 */
export interface HandySettings extends DeviceSettings {
  connectionKey: string;
  offset: number;
  stroke: {
    min: number;
    max: number;
  };
}
