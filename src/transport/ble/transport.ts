// From aer-remote src/ble/transport.ts (2026-11-04). Adapted: none.
export type AdapterState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

export interface FoundDevice {
  id: string;
  name: string | null;
  rssi: number | null;
}

export interface BleCharacteristic {
  uuid: string;
  writable: boolean;
  notifiable: boolean;
}

export interface BleConnection {
  readonly deviceId: string;
  characteristics(): Promise<BleCharacteristic[]>;
  /** Write without response. */
  write(charUuid: string, bytes: Uint8Array): Promise<void>;
  /** onError receives monitor failures that happen after subscribing (e.g. a missing CCCD). */
  subscribe(
    charUuid: string,
    onData: (b: Uint8Array) => void,
    onError?: (e: Error) => void,
  ): Promise<() => void>;
  onDisconnect(cb: () => void): () => void;
  disconnect(): Promise<void>;
}

export interface BleTransport {
  adapterState(): Promise<AdapterState>;
  requestPermissions(): Promise<boolean>;
  /** Reports every nearby device; a real dispenser does not advertise its service. */
  scan(onFound: (d: FoundDevice) => void, timeoutMs: number): { stop(): void; done: Promise<void> };
  connect(deviceId: string, timeoutMs: number): Promise<BleConnection>;
}
