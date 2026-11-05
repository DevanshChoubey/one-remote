import { DeviceError } from '@/core';
import type { AcState } from '@/core';
import { GENERIC_KEY, GreeCryptoError } from './crypto';
import type { GreeCipher } from './crypto';
import {
  GreeProtocolError,
  bindPack,
  checkCmdReply,
  cmdPack,
  openMessage,
  packMessage,
  parseBindOk,
  parseScanReply,
  parseStatus,
  scanRequest,
  statusPack,
} from './protocol';
import type { GreeFound, Json } from './protocol';
import type { GreeUdp } from './udp';

/** Where a bound unit is and how to talk to it. */
export interface GreeTarget {
  mac: string;
  host: string;
  key: string;
  cipher: GreeCipher;
}

export interface GreeClient {
  /** Every unit that answered within `windowMs`, one per MAC. */
  scan(windowMs: number): Promise<GreeFound[]>;
  /** Asks the unit for its device key. Tries the cipher the scan saw first, then the other. */
  bind(
    found: Pick<GreeFound, 'mac' | 'host' | 'cipher'>,
  ): Promise<{ key: string; cipher: GreeCipher }>;
  status(target: GreeTarget, prev: AcState): Promise<{ state: AcState; roomTemp?: number }>;
  /** Sets the whole state in one cmd. Resolves once the unit said it took it. */
  set(target: GreeTarget, state: AcState): Promise<void>;
}

export interface GreeClientOptions {
  udp: GreeUdp;
  /** Per request; the hub's own timeout bounds a send anyway. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1500;

/** Opens a reply; a reply the key cannot open means the unit has a new key (it was reset). */
function open(text: string, key: string, cipher: GreeCipher): Json {
  try {
    return openMessage(text, key, cipher);
  } catch (e) {
    if (e instanceof GreeCryptoError) throw new DeviceError('notPaired', 'The AC has a new key');
    if (e instanceof GreeProtocolError) throw new DeviceError('notSent', e.message);
    throw e;
  }
}

export function createGreeClient(o: GreeClientOptions): GreeClient {
  const { udp } = o;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const bindWith = async (
    found: Pick<GreeFound, 'mac' | 'host'>,
    cipher: GreeCipher,
  ): Promise<string> => {
    const generic = GENERIC_KEY[cipher];
    const reply = await udp.request(
      found.host,
      packMessage(bindPack(found.mac, cipher), found.mac, generic, cipher, 1),
      timeoutMs,
    );
    try {
      return parseBindOk(openMessage(reply, generic, cipher));
    } catch (e) {
      if (e instanceof GreeCryptoError || e instanceof GreeProtocolError) {
        throw new DeviceError('notPaired', 'The AC did not hand out a key');
      }
      throw e;
    }
  };

  return {
    async scan(windowMs): Promise<GreeFound[]> {
      const found = new Map<string, GreeFound>();
      await udp.scan(scanRequest(), windowMs, (text, host) => {
        const unit = parseScanReply(text, host);
        if (unit && !found.has(unit.mac)) found.set(unit.mac, unit);
      });
      return [...found.values()];
    },

    async bind(found): Promise<{ key: string; cipher: GreeCipher }> {
      const order: GreeCipher[] = found.cipher === 'gcm' ? ['gcm', 'ecb'] : ['ecb', 'gcm'];
      let first: unknown;
      for (const cipher of order) {
        try {
          return { key: await bindWith(found, cipher), cipher };
        } catch (e) {
          // Off the home network or not sent: the other cipher will not do better.
          if (e instanceof DeviceError && (e.code === 'notLocal' || e.code === 'notSent')) throw e;
          first ??= e;
        }
      }
      throw first;
    },

    async status(target, prev): Promise<{ state: AcState; roomTemp?: number }> {
      const reply = await udp.request(
        target.host,
        packMessage(statusPack(target.mac), target.mac, target.key, target.cipher, 0),
        timeoutMs,
      );
      try {
        return parseStatus(open(reply, target.key, target.cipher), prev);
      } catch (e) {
        if (e instanceof GreeProtocolError) throw new DeviceError('notSent', e.message);
        throw e;
      }
    },

    async set(target, state): Promise<void> {
      const reply = await udp.request(
        target.host,
        packMessage(cmdPack(state), target.mac, target.key, target.cipher, 0),
        timeoutMs,
      );
      try {
        checkCmdReply(open(reply, target.key, target.cipher));
      } catch (e) {
        // The unit answered and refused: nothing changed.
        if (e instanceof GreeProtocolError) throw new DeviceError('notSent', e.message);
        throw e;
      }
    },
  };
}
