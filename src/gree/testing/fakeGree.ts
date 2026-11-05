import { DeviceError } from '@/core';
import { GENERIC_KEY, decryptPack, encryptPack } from '../crypto';
import type { GreeCipher } from '../crypto';
import type { Json } from '../protocol';
import type { GreeUdp } from '../udp';

export interface FakeGreeUnitOptions {
  mac: string;
  host: string;
  cipher?: GreeCipher;
  /** The key bind hands out. */
  key?: string;
  name?: string;
  /** TemSen as the unit reports it (with the +40 offset). */
  temSen?: number;
}

/** A Gree unit on the fake LAN: answers scan, bind, status and cmd as the protocol describes. */
export class FakeGreeUnit {
  readonly mac: string;
  host: string;
  readonly cipher: GreeCipher;
  key: string;
  readonly name: string;
  /** The unit's parameters, by their protocol names. */
  readonly params: Record<string, number>;
  /** False: the unit is off the network and answers nothing. */
  up = true;
  /** Answers cmd with this `r` instead of 200. */
  refuseWith: number | undefined;
  /** Every decrypted request pack, in order. */
  readonly received: Json[] = [];

  constructor(o: FakeGreeUnitOptions) {
    this.mac = o.mac;
    this.host = o.host;
    this.cipher = o.cipher ?? 'ecb';
    this.key = o.key ?? 'Dk3Lm9Pq2Rs7Tu1V';
    this.name = o.name ?? 'f4911e';
    this.params = {
      Pow: 0,
      Mod: 1,
      SetTem: 24,
      TemUn: 0,
      WdSpd: 0,
      SwUpDn: 0,
      SwhSlp: 0,
      SlpMod: 0,
      TemSen: o.temSen ?? 66,
      Quiet: 0,
      Tur: 0,
    };
  }

  /** A factory reset: the unit hands out a new key and refuses the old one. */
  reset(newKey: string): void {
    this.key = newKey;
  }

  private seal(inner: Json, key: string): string {
    const s = encryptPack(JSON.stringify(inner), key, this.cipher);
    return JSON.stringify({
      t: 'pack',
      i: 0,
      uid: 0,
      cid: this.mac,
      tcid: 'app',
      pack: s.pack,
      ...(s.tag !== undefined ? { tag: s.tag } : {}),
    });
  }

  /** The reply to one datagram, or null for silence. */
  answer(text: string): string | null {
    if (!this.up) return null;
    const outer = JSON.parse(text) as Json;
    if (outer.t === 'scan') {
      return this.seal(
        {
          t: 'dev',
          cid: this.mac,
          bc: 'gree',
          brand: 'gree',
          catalog: 'gree',
          mac: this.mac,
          mid: '10001',
          model: 'gree',
          name: this.name,
          series: 'gree',
          vender: '1',
          ver: this.cipher === 'gcm' ? 'V3.0.0' : 'V1.1.13',
          lock: 0,
        },
        GENERIC_KEY[this.cipher],
      );
    }
    if (outer.t !== 'pack' || outer.tcid !== this.mac) return null;
    const tag = typeof outer.tag === 'string' ? outer.tag : undefined;
    // A unit only speaks its own cipher.
    if ((tag !== undefined) !== (this.cipher === 'gcm')) return null;
    const sealed = { pack: String(outer.pack), ...(tag !== undefined ? { tag } : {}) };
    let inner: Json;
    let generic = false;
    try {
      inner = JSON.parse(decryptPack(sealed, this.key, this.cipher)) as Json;
    } catch {
      try {
        inner = JSON.parse(decryptPack(sealed, GENERIC_KEY[this.cipher], this.cipher)) as Json;
        generic = true;
      } catch {
        return null; // a key it does not know: silence, as a real unit
      }
    }
    this.received.push(inner);
    if (inner.t === 'bind') {
      if (!generic) return null;
      return this.seal(
        { t: 'bindok', mac: this.mac, key: this.key, r: 200 },
        GENERIC_KEY[this.cipher],
      );
    }
    if (generic) return null;
    if (inner.t === 'status') {
      const cols = Array.isArray(inner.cols) ? (inner.cols as string[]) : [];
      return this.seal(
        { t: 'dat', mac: this.mac, r: 200, cols, dat: cols.map((c) => this.params[c] ?? 0) },
        this.key,
      );
    }
    if (inner.t === 'cmd') {
      const opt = (inner.opt ?? []) as string[];
      const p = (inner.p ?? []) as number[];
      if (this.refuseWith !== undefined) {
        return this.seal({ t: 'res', mac: this.mac, r: this.refuseWith, opt, p }, this.key);
      }
      opt.forEach((name, i) => {
        const v = p[i];
        if (v !== undefined) this.params[name] = v;
      });
      return this.seal({ t: 'res', mac: this.mac, r: 200, opt, p, val: p }, this.key);
    }
    return null;
  }
}

export interface FakeGreeLan extends GreeUdp {
  onWifiResult: boolean;
  /** Every datagram sent: [host or 'scan', text]. */
  readonly sent: [string, string][];
}

/** A fake home network of Gree units. A silent unit makes `request` reject 'timeout' at once. */
export function createFakeGreeLan(units: FakeGreeUnit[]): FakeGreeLan {
  const lan: FakeGreeLan = {
    onWifiResult: true,
    sent: [],
    onWifi: () => Promise.resolve(lan.onWifiResult),
    async scan(text, _windowMs, onReply): Promise<void> {
      if (!lan.onWifiResult) throw new DeviceError('notSent', 'Not on Wi-Fi');
      lan.sent.push(['scan', text]);
      for (const u of units) {
        const reply = u.answer(text);
        if (reply !== null) onReply(reply, u.host);
      }
      await Promise.resolve();
    },
    async request(host, text): Promise<string> {
      if (!lan.onWifiResult) throw new DeviceError('notSent', 'Not on Wi-Fi');
      lan.sent.push([host, text]);
      await Promise.resolve();
      const unit = units.find((u) => u.host === host);
      const reply = unit?.answer(text) ?? null;
      if (reply === null) throw new DeviceError('timeout', `No reply from ${host}`);
      return reply;
    },
  };
  return lan;
}
