// From aer-remote src/ble/rnTransport.ts (2026-11-04). Adapted: AerError, no location permission and no Android below 12, bleSupported added, a refused connect becomes busy.
import { PermissionsAndroid, Platform } from 'react-native';
import {
  BleErrorCode,
  BleManager,
  State,
  type Device,
  type Subscription,
} from 'react-native-ble-plx';

import { AerError } from '@/aer/errors';
import { SERVICE_UUID } from '@/aer/protocol/uuids';

import { base64ToBytes, bytesToBase64 } from './base64';
import type {
  AdapterState,
  BleCharacteristic,
  BleConnection,
  BleTransport,
  FoundDevice,
} from './transport';

const DISCONNECT_TIMEOUT_MS = 3000;
const ANDROID_MTU = 185;
/** A monitor that fails right away (e.g. no CCCD) rejects subscribe(); later errors go to onError. */
const SUBSCRIBE_SETTLE_MS = 250;
const STATE_SETTLE_MS = 2000;
/** Android 12 (API 31) added Bluetooth permissions that scan without location. */
const BT_PERMISSIONS_API = 31;

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

const errorCodeOf = (e: unknown): unknown =>
  typeof e === 'object' && e !== null && 'errorCode' in e ? e.errorCode : undefined;

/** A scan failure the user can fix becomes a AerError; anything else is passed on as it is. */
export function scanError(e: unknown): Error {
  const code = errorCodeOf(e);
  if (code === BleErrorCode.BluetoothPoweredOff) return new AerError('bluetoothOff');
  if (code === BleErrorCode.BluetoothUnauthorized) return new AerError('permissionDenied');
  return toError(e);
}

export function mapState(state: State): AdapterState {
  switch (state) {
    case State.PoweredOn:
      return 'on';
    case State.PoweredOff:
      return 'off';
    case State.Unauthorized:
      return 'unauthorized';
    case State.Unsupported:
      return 'unsupported';
    default:
      return 'unknown';
  }
}

function androidApi(): number {
  return typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
}

type AndroidPermission =
  (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

/** Whether this phone can talk to the aer: any iPhone, and Android 12 or later. */
export function bleSupported(
  platform: { OS: string; Version: number | string } = Platform,
): boolean {
  return platform.OS !== 'android' || Number(platform.Version) >= BT_PERMISSIONS_API;
}

/**
 * The runtime permissions Bluetooth needs on this Android version. The aer never asks for
 * location; below Android 12 it is unavailable, so nothing is asked.
 */
export function androidPermissionsFor(api: number): AndroidPermission[] {
  return api >= BT_PERMISSIONS_API
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
    : [];
}

/** Whether the Bluetooth permissions are already granted. Never prompts. */
async function androidPermissionsGranted(): Promise<boolean> {
  const needed = androidPermissionsFor(androidApi());
  const results = await Promise.all(needed.map((p) => PermissionsAndroid.check(p)));
  return results.every(Boolean);
}

/** Prompts for the Bluetooth permissions. */
async function androidRequestPermissions(): Promise<boolean> {
  const needed = androidPermissionsFor(androidApi());
  const result = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => result[p] === 'granted');
}

/** The adapter state once it has settled: Unknown and Resetting resolve shortly after start-up. */
export async function settledState(manager: BleManager, timeoutMs: number): Promise<State> {
  const first = await manager.state();
  if (first !== State.Unknown && first !== State.Resetting) return first;
  return new Promise<State>((resolve) => {
    let sub: Subscription | null = null;
    let last: State = first;
    const finish = (state: State): void => {
      clearTimeout(timer);
      sub?.remove();
      resolve(state);
    };
    const timer = setTimeout(() => finish(last), timeoutMs);
    sub = manager.onStateChange((state) => {
      last = state;
      if (state !== State.Unknown && state !== State.Resetting) finish(state);
    }, true);
  });
}

/** Cancels a connection, never hanging: the link is released best-effort if the stack is slow. */
async function cancelBounded(manager: BleManager, deviceId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DISCONNECT_TIMEOUT_MS);
  });
  try {
    await Promise.race([manager.cancelDeviceConnection(deviceId).then(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function wrapDevice(manager: BleManager, device: Device): BleConnection {
  const id = device.id;
  return {
    deviceId: id,
    async characteristics(): Promise<BleCharacteristic[]> {
      const list = await device.characteristicsForService(SERVICE_UUID).catch((e: unknown) => {
        // Scans list every device, so the user can pick one that is not a dispenser.
        throw errorCodeOf(e) === BleErrorCode.ServiceNotFound ? new AerError('notDispenser') : e;
      });
      return list.map((c) => ({
        uuid: c.uuid.toLowerCase(),
        // Writes are always without response, so only that property counts.
        writable: c.isWritableWithoutResponse,
        notifiable: c.isNotifiable || c.isIndicatable,
      }));
    },
    async write(charUuid, bytes): Promise<void> {
      await device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        charUuid,
        bytesToBase64(bytes),
      );
    },
    subscribe(charUuid, onData, onError): Promise<() => void> {
      return new Promise((resolve, reject) => {
        let settled = false;
        let removed = false;
        let sub: Subscription | null = null;
        const remove = (): void => {
          removed = true;
          sub?.remove();
          sub = null;
        };
        const timer = setTimeout(() => {
          settled = true;
          resolve(remove);
        }, SUBSCRIBE_SETTLE_MS);
        sub = device.monitorCharacteristicForService(SERVICE_UUID, charUuid, (error, c) => {
          if (error) {
            // Our own close, and link drops (reported through onDisconnect), are not errors.
            if (
              removed ||
              error.errorCode === BleErrorCode.OperationCancelled ||
              error.errorCode === BleErrorCode.DeviceDisconnected
            ) {
              return;
            }
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              remove();
              reject(toError(error));
            } else if (onError) {
              onError(toError(error));
            }
            return;
          }
          if (!removed && c?.value) onData(base64ToBytes(c.value));
        });
      });
    },
    onDisconnect(cb): () => void {
      const sub = manager.onDeviceDisconnected(id, () => cb());
      return () => sub.remove();
    },
    disconnect(): Promise<void> {
      return cancelBounded(manager, id);
    },
  };
}

export function createRnTransport(
  createManager: () => BleManager = () => new BleManager(),
): BleTransport {
  let manager: BleManager | null = null;
  const mgr = (): BleManager => {
    manager ??= createManager();
    return manager;
  };

  return {
    async adapterState(): Promise<AdapterState> {
      if (!bleSupported(Platform)) return 'unsupported';
      if (Platform.OS === 'android' && !(await androidPermissionsGranted())) return 'unauthorized';
      return mapState(await settledState(mgr(), STATE_SETTLE_MS));
    },

    requestPermissions(): Promise<boolean> {
      if (!bleSupported(Platform)) return Promise.resolve(false);
      return Platform.OS === 'android' ? androidRequestPermissions() : Promise.resolve(true);
    },

    scan(onFound, timeoutMs): { stop(): void; done: Promise<void> } {
      const m = mgr();
      let finish: () => void = () => undefined;
      let fail: (e: Error) => void = () => undefined;
      const done = new Promise<void>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      let stopped = false;
      const stop = (): void => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        m.stopDeviceScan().then(finish, fail);
      };
      const timer = setTimeout(stop, timeoutMs);
      // No native filter: a real Smart Matic does not advertise its service (hardware test,
      // 2026-10-27). Every device is listed, and adding one checks for the service.
      m.startDeviceScan(null, { allowDuplicates: false }, async (error, device) => {
        if (error) {
          if (!stopped) {
            stopped = true;
            clearTimeout(timer);
            m.stopDeviceScan().catch(() => undefined);
            fail(scanError(error));
          }
          return;
        }
        if (device && !stopped) {
          const found: FoundDevice = {
            id: device.id,
            name: device.name ?? device.localName ?? null,
            rssi: device.rssi,
          };
          onFound(found);
        }
      }).catch((e: unknown) => {
        stopped = true;
        clearTimeout(timer);
        m.stopDeviceScan().catch(() => undefined);
        fail(scanError(e));
      });
      return { stop, done };
    },

    async connect(deviceId, timeoutMs): Promise<BleConnection> {
      const m = mgr();
      let timedOut = false;
      // The whole sequence (connect, discovery, MTU) shares one budget.
      const sequence = (async (): Promise<Device> => {
        const connected = await m.connectToDevice(deviceId, { timeout: timeoutMs });
        // A late success after the timeout must not keep the dispenser's single connection slot.
        if (timedOut) {
          m.cancelDeviceConnection(deviceId).catch(() => undefined);
          throw new Error('connect timed out');
        }
        const ready = await connected.discoverAllServicesAndCharacteristics();
        if (Platform.OS !== 'android') return ready;
        try {
          return await ready.requestMTU(ANDROID_MTU);
        } catch (e) {
          console.warn('requestMTU failed; continuing with the default MTU', e);
          return ready;
        }
      })();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          reject(new Error('connect timed out'));
        }, timeoutMs);
      });
      sequence.catch(() => undefined);
      try {
        const device = await Promise.race([sequence, timeout]);
        return wrapDevice(m, device);
      } catch (e) {
        await cancelBounded(m, deviceId).catch(() => undefined);
        // The dispenser holds one connection; a refusal before the timeout means it is taken.
        if (!timedOut && errorCodeOf(e) === BleErrorCode.DeviceConnectionFailed) {
          throw new AerError('busy');
        }
        throw toError(e);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
