import type {
  Capabilities,
  Command,
  Device,
  DeviceErrorCode,
  Link,
  LinkDriver,
  LinkKind,
  Reported,
  Unsubscribe,
  VoiceSession,
} from '@/core';
import { DeviceError } from '@/core';

export interface FakeDriverOptions {
  available?: boolean;
  supports?: (cmd: Command) => boolean;
  capabilities?: Capabilities;
  /** Gives the driver a `startVoice`. */
  startVoice?: (device: Device) => Promise<VoiceSession>;
}

export interface FakeDriver extends LinkDriver {
  sent: { deviceId: string; cmd: Command }[];
  /** The next send rejects with this code; it is not recorded in `sent`. */
  failNext(code: DeviceErrorCode): void;
  /** The next send never settles and is not recorded. */
  hangNext(): void;
  emit(deviceId: string, r: Reported): void;
  setAvailable(v: boolean): void;
  observe(device: Device, link: Link, cb: (r: Reported) => void): Unsubscribe;
}

export function createFakeDriver(kind: LinkKind, opts: FakeDriverOptions = {}): FakeDriver {
  let isAvailable = opts.available ?? true;
  let failCode: DeviceErrorCode | undefined;
  let hang = false;
  const sent: { deviceId: string; cmd: Command }[] = [];
  const observers = new Map<string, Set<(r: Reported) => void>>();

  const voice = opts.startVoice;
  return {
    kind,
    sent,
    ...(voice ? { startVoice: (device: Device): Promise<VoiceSession> => voice(device) } : {}),
    available: (): boolean => isAvailable,
    setAvailable: (v: boolean): void => {
      isAvailable = v;
    },
    supports: (_device: Device, _link: Link, cmd: Command): boolean =>
      opts.supports ? opts.supports(cmd) : true,
    capabilities: (): Capabilities => opts.capabilities ?? {},
    send: (device: Device, _link: Link, cmd: Command): Promise<void> => {
      if (failCode !== undefined) {
        const code = failCode;
        failCode = undefined;
        return Promise.reject(new DeviceError(code));
      }
      if (hang) {
        hang = false;
        return new Promise<void>(() => undefined);
      }
      sent.push({ deviceId: device.id, cmd });
      return Promise.resolve();
    },
    failNext: (code: DeviceErrorCode): void => {
      failCode = code;
    },
    hangNext: (): void => {
      hang = true;
    },
    observe: (device: Device, _link: Link, cb: (r: Reported) => void): Unsubscribe => {
      let set = observers.get(device.id);
      if (!set) {
        set = new Set();
        observers.set(device.id, set);
      }
      set.add(cb);
      return (): void => {
        observers.get(device.id)?.delete(cb);
      };
    },
    emit: (deviceId: string, r: Reported): void => {
      observers.get(deviceId)?.forEach((cb) => cb(r));
    },
  };
}
