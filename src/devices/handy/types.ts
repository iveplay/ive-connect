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
 * HSP State (Handy Script Protocol)
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
 * Upload response
 */
export interface UploadResponse {
  url: string;
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
