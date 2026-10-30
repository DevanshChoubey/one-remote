import { DeviceError } from '@/core';
import type { Capabilities, Command, Device, FanState, Link, LinkDriver } from '@/core';
import type { Catalogue, FanKey, Remote } from './catalogue';
import { defaultCatalogue } from './codes';
import type { IrEmitter, IrSignal } from './emitter';
import { fanKeys } from './fanKeys';

const DEFAULT_GAP_MS = 200;
const TV_KEYS = ['power', 'volumeUp', 'volumeDown', 'mute'] as const;

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * The `ir` link. One press is one transmit and nothing is ever resent here: the hub decides about
 * fallbacks. The driver keeps no live state (no `observe`); the hub keeps what was last sent. It
 * remembers the last fan state it sent only so it can tell which toggle keys changed.
 */
export function createIrDriver(o: {
  emitter: IrEmitter;
  catalogue?: Catalogue;
  gapMs?: number;
}): LinkDriver & { kind: 'ir' } {
  const catalogue = o.catalogue ?? defaultCatalogue;
  const gapMs = o.gapMs ?? DEFAULT_GAP_MS;
  const lastFan = new Map<string, FanState>();

  const remoteOf = (link: Link): Remote | undefined =>
    link.kind === 'ir' ? catalogue.remote(link.remoteId) : undefined;

  const transmit = async (s: IrSignal): Promise<void> => {
    try {
      await o.emitter.transmit(s);
    } catch (e) {
      throw e instanceof DeviceError ? e : new DeviceError('notSent');
    }
  };

  const unsupported = (): never => {
    throw new DeviceError('unsupported');
  };

  return {
    kind: 'ir',
    available: () => o.emitter.hasEmitter(),
    supports(_device: Device, link: Link, cmd: Command): boolean {
      const r = remoteOf(link);
      if (!r) return false;
      switch (cmd.kind) {
        case 'ac.set':
          return r.kind === 'ac';
        case 'fan.set':
          return r.kind === 'fan';
        case 'tv.powerOn':
          return r.kind === 'tv' && r.keys.powerOn !== undefined;
        case 'tv.key':
          return (
            r.kind === 'tv' && TV_KEYS.some((k) => k === cmd.key) && r.keys[cmd.key] !== undefined
          );
        default:
          return false;
      }
    },
    capabilities(_device: Device, link: Link): Capabilities {
      const r = remoteOf(link);
      return r && r.kind !== 'tv' ? r.caps : {};
    },
    async send(device: Device, link: Link, cmd: Command): Promise<void> {
      if (!o.emitter.hasEmitter()) throw new DeviceError('noIrEmitter');
      const r = remoteOf(link);
      if (!r) return unsupported();
      if (cmd.kind === 'ac.set' && r.kind === 'ac') return transmit(r.encode(cmd.state));
      if (cmd.kind === 'fan.set' && r.kind === 'fan') {
        const keys = new Set(Object.keys(r.keys) as FanKey[]);
        const todo = fanKeys(lastFan.get(device.id), cmd.state, keys);
        for (const [i, key] of todo.entries()) {
          if (i > 0) await wait(gapMs);
          const signal = r.keys[key];
          if (signal) await transmit(signal);
        }
        lastFan.set(device.id, cmd.state);
        return;
      }
      if (r.kind === 'tv') {
        const signal =
          cmd.kind === 'tv.powerOn'
            ? r.keys.powerOn
            : cmd.kind === 'tv.key' && TV_KEYS.some((k) => k === cmd.key)
              ? r.keys[cmd.key]
              : undefined;
        if (signal) return transmit(signal);
      }
      return unsupported();
    },
  };
}
