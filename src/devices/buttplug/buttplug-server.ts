/**
 * Buttplug Local Server
 *
 * Provides support for running a Buttplug server locally in the browser
 */

// This module provides functionality to create a local WebBluetooth connector
// The actual import of ButtplugWasmClientConnector is done dynamically in
// the ButtplugApi class to ensure it only runs in browser environments

/**
 * Check if WebBluetooth is supported in the current environment
 */
export function isWebBluetoothSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.navigator !== "undefined" &&
    (navigator as any).bluetooth !== undefined
  );
}

/**
 * Generate name for the client
 */
export function generateClientName(prefix: string = "IVE-Connect"): string {
  // Add a random suffix to make the client name unique
  return `${prefix}-${Math.floor(Math.random() * 10000)}`;
}
