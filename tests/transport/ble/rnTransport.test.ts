import { BleErrorCode, State, type BleManager, type Device } from 'react-native-ble-plx';

import { AerError } from '@/aer/errors';
import {
  androidPermissionsFor,
  bleSupported,
  createRnTransport,
  mapState,
  settledState,
  wrapDevice,
} from '@/transport/ble/rnTransport';

describe('androidPermissionsFor', () => {
  it('asks Android 12 and later for the Bluetooth permissions only', () => {
    expect(androidPermissionsFor(31)).toEqual([
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ]);
    expect(androidPermissionsFor(36)).not.toContain('android.permission.ACCESS_FINE_LOCATION');
  });

  it('asks Android 11 for nothing: the aer needs Android 12', () => {
    expect(androidPermissionsFor(30)).toEqual([]);
  });

  it('never asks for location', () => {
    for (let n = 23; n <= 36; n++) {
      const asked = androidPermissionsFor(n) as string[];
      expect(asked).not.toContain('android.permission.ACCESS_FINE_LOCATION');
      expect(asked).not.toContain('android.permission.ACCESS_COARSE_LOCATION');
    }
  });
});

describe('bleSupported', () => {
  it('needs Android 12 or iOS', () => {
    expect(bleSupported({ OS: 'android', Version: 30 })).toBe(false);
    expect(bleSupported({ OS: 'android', Version: 31 })).toBe(true);
    expect(bleSupported({ OS: 'ios', Version: '17.0' })).toBe(true);
  });
});

describe('createRnTransport on Android 11', () => {
  it('is unsupported and does not prompt', async () => {
    const { Platform } = jest.requireActual<typeof import('react-native')>('react-native');
    const os = Platform.OS;
    const version = Platform.Version;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    Object.defineProperty(Platform, 'Version', { value: 30, configurable: true });
    try {
      const t = createRnTransport(() => ({}) as BleManager);
      await expect(t.requestPermissions()).resolves.toBe(false);
      await expect(t.adapterState()).resolves.toBe('unsupported');
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
      Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
    }
  });
});

describe('mapState', () => {
  it.each([
    [State.PoweredOn, 'on'],
    [State.PoweredOff, 'off'],
    [State.Unauthorized, 'unauthorized'],
    [State.Unsupported, 'unsupported'],
    [State.Resetting, 'unknown'],
    [State.Unknown, 'unknown'],
  ] as const)('%s -> %s', (state, expected) => {
    expect(mapState(state)).toBe(expected);
  });
});

describe('settledState', () => {
  const fakeManager = (
    initial: State,
    later?: State,
  ): { m: BleManager; removed: () => boolean } => {
    let removed = false;
    const m = {
      state: async () => initial,
      onStateChange: (cb: (s: State) => void) => {
        if (later) setTimeout(() => cb(later), 10);
        return {
          remove: () => {
            removed = true;
          },
        };
      },
    } as unknown as BleManager;
    return { m, removed: () => removed };
  };

  it('returns a settled state immediately', async () => {
    expect(await settledState(fakeManager(State.PoweredOn).m, 50)).toBe(State.PoweredOn);
  });

  it('waits out Unknown and removes the subscription', async () => {
    const { m, removed } = fakeManager(State.Unknown, State.PoweredOn);
    expect(await settledState(m, 500)).toBe(State.PoweredOn);
    expect(removed()).toBe(true);
  });

  it('gives up after the timeout', async () => {
    const { m, removed } = fakeManager(State.Resetting);
    expect(await settledState(m, 30)).toBe(State.Resetting);
    expect(removed()).toBe(true);
  });
});

describe('wrapDevice subscribe', () => {
  type Listener = (e: { errorCode: number } | null, c: { value: string } | null) => void;
  const rig = (): {
    listener: () => Listener;
    removed: () => boolean;
    conn: ReturnType<typeof wrapDevice>;
  } => {
    let listener: Listener = () => undefined;
    let removed = false;
    const device = {
      id: 'd',
      monitorCharacteristicForService: (_s: string, _c: string, l: Listener) => {
        listener = l;
        return {
          remove: () => {
            removed = true;
          },
        };
      },
    } as unknown as Device;
    return {
      listener: () => listener,
      removed: () => removed,
      conn: wrapDevice({} as BleManager, device),
    };
  };

  it('rejects an immediate monitor error', async () => {
    const r = rig();
    const p = r.conn.subscribe('c', () => undefined);
    r.listener()({ errorCode: BleErrorCode.DescriptorNotFound }, null);
    await expect(p).rejects.toBeInstanceOf(Error);
    expect(r.removed()).toBe(true);
  });

  it('reports later errors but not cancel, disconnect or post-close errors', async () => {
    jest.useFakeTimers();
    try {
      const r = rig();
      const onError = jest.fn();
      const p = r.conn.subscribe('c', () => undefined, onError);
      jest.advanceTimersByTime(300);
      const off = await p;
      r.listener()({ errorCode: BleErrorCode.OperationCancelled }, null);
      r.listener()({ errorCode: BleErrorCode.DeviceDisconnected }, null);
      expect(onError).not.toHaveBeenCalled();
      r.listener()({ errorCode: BleErrorCode.CharacteristicReadFailed }, null);
      expect(onError).toHaveBeenCalledTimes(1);
      off();
      r.listener()({ errorCode: BleErrorCode.CharacteristicReadFailed }, null);
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

// A real Smart Matic does not advertise its service (hardware test, 2026-10-27), so the scan
// cannot filter by it: it lists every device and adding one checks for the service.
describe('createRnTransport scan', () => {
  type ScanListener = (e: Error | null, d: Device | null) => void;
  const advert = (id: string, name: string | null): Device =>
    ({ id, name, localName: null, rssi: -50 }) as unknown as Device;

  it('scans without a filter and reports every device', () => {
    let listener: ScanListener = () => undefined;
    let uuids: unknown = 'unset';
    const manager = {
      startDeviceScan: async (u: unknown, _o: unknown, l: ScanListener) => {
        uuids = u;
        listener = l;
      },
      stopDeviceScan: async () => undefined,
    } as unknown as BleManager;
    const found: (string | null)[] = [];
    const handle = createRnTransport(() => manager).scan((d) => found.push(d.name), 10000);
    listener(null, advert('aer', 'Smart Matic'));
    listener(null, advert('tv', '[LG] webOS TV'));
    listener(null, advert('tag', null));
    handle.stop();
    expect(uuids).toBeNull();
    expect(found).toEqual(['Smart Matic', '[LG] webOS TV', null]);
  });
});

describe('wrapDevice characteristics', () => {
  it('reports a device without the aer service as notDispenser', async () => {
    const device = {
      id: 'tv',
      characteristicsForService: () =>
        Promise.reject(
          Object.assign(new Error('no service'), { errorCode: BleErrorCode.ServiceNotFound }),
        ),
    } as unknown as Device;
    const result = wrapDevice({} as BleManager, device).characteristics();
    await expect(result).rejects.toBeInstanceOf(AerError);
    await expect(result).rejects.toMatchObject({ code: 'notDispenser' });
  });
});

describe('createRnTransport scan errors', () => {
  type ScanListener = (e: Error | null, d: null) => void;
  const scanWith = (errorCode: number): Promise<void> => {
    let listener: ScanListener = () => undefined;
    const manager = {
      startDeviceScan: async (_u: unknown, _o: unknown, l: ScanListener) => {
        listener = l;
      },
      stopDeviceScan: async () => undefined,
    } as unknown as BleManager;
    const handle = createRnTransport(() => manager).scan(() => undefined, 10000);
    listener(Object.assign(new Error('native'), { errorCode }), null);
    return handle.done;
  };

  it.each([
    [BleErrorCode.BluetoothPoweredOff, 'bluetoothOff'],
    [BleErrorCode.BluetoothUnauthorized, 'permissionDenied'],
  ] as const)('maps BleErrorCode %s to %s', async (errorCode, code) => {
    const done = scanWith(errorCode);
    await expect(done).rejects.toBeInstanceOf(AerError);
    await expect(done).rejects.toMatchObject({ code });
  });

  it('passes other scan errors through unchanged', async () => {
    const done = scanWith(BleErrorCode.ScanStartFailed);
    await expect(done).rejects.not.toBeInstanceOf(AerError);
    await expect(done).rejects.toMatchObject({
      message: 'native',
      errorCode: BleErrorCode.ScanStartFailed,
    });
  });
});

describe('createRnTransport connect failure', () => {
  it('does not hang on a stuck cancel after a failed connect', async () => {
    jest.useFakeTimers();
    try {
      const manager = {
        connectToDevice: () => Promise.reject(new Error('GATT 133')),
        cancelDeviceConnection: () => new Promise(() => undefined),
      } as unknown as BleManager;
      const result = createRnTransport(() => manager)
        .connect('d', 8000)
        .then(
          () => 'connected',
          (e: Error) => e.message,
        );
      await jest.advanceTimersByTimeAsync(3000);
      await expect(result).resolves.toBe('GATT 133');
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('createRnTransport connect refusal', () => {
  it('maps a refused connect to busy', async () => {
    const manager = {
      connectToDevice: () =>
        Promise.reject(
          Object.assign(new Error('refused'), { errorCode: BleErrorCode.DeviceConnectionFailed }),
        ),
      cancelDeviceConnection: async () => undefined,
    } as unknown as BleManager;
    const result = createRnTransport(() => manager).connect('d', 8000);
    await expect(result).rejects.toBeInstanceOf(AerError);
    await expect(result).rejects.toMatchObject({ code: 'busy' });
  });
});
