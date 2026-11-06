import { MiraieError } from '@/core';
import type { MiraieAc } from '@/core';
import { CloudNetError } from './net';
import type { CloudNet, CloudResponse } from './net';
import {
  HOMES_URL,
  LOGIN_URL,
  deviceUrl,
  loginBody,
  parseCategory,
  parseHomes,
  parseLogin,
  statusUrl,
} from './protocol';
import type { MiraieTokens } from './protocol';

/** The API refused the access token (401/403): sign in again and retry once. */
export class TokenRejected extends Error {
  constructor() {
    super('MirAIe refused the token');
    this.name = 'TokenRejected';
    Object.setPrototypeOf(this, TokenRejected.prototype);
  }
}

export interface MiraieApi {
  /** Rejects MiraieError: badLogin, notRegistered, offline (or off). */
  login(phone: string, password: string): Promise<MiraieTokens>;
  /** The ACs of every home. Rejects TokenRejected or MiraieError('offline'). */
  listAcs(token: string): Promise<MiraieAc[]>;
  /** The raw status JSON of one AC. Rejects TokenRejected or MiraieError('offline'). */
  status(token: string, deviceId: string): Promise<string>;
}

export interface MiraieApiOptions {
  net: CloudNet;
  timeoutMs?: number;
  now?: () => number;
  /** Digits for the login `scope`; random by default. */
  scopeDigits?: () => string;
}

const DEFAULT_TIMEOUT_MS = 15000;

const randomDigits = (): string => String(Math.floor(Math.random() * 1e9)).padStart(9, '0');

function netError(e: unknown): MiraieError {
  if (e instanceof CloudNetError && e.code === 'off') return new MiraieError('off');
  return new MiraieError('offline');
}

export function createMiraieApi(o: MiraieApiOptions): MiraieApi {
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = o.now ?? Date.now;
  const scope = o.scopeDigits ?? randomDigits;

  const get = async (url: string, token: string): Promise<CloudResponse> => {
    let res: CloudResponse;
    try {
      res = await o.net.request({
        method: 'GET',
        url,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        timeoutMs,
      });
    } catch (e) {
      throw netError(e);
    }
    if (res.status === 401 || res.status === 403) throw new TokenRejected();
    if (res.status < 200 || res.status >= 300)
      throw new MiraieError('offline', `HTTP ${res.status}`);
    return res;
  };

  return {
    async login(phone, password) {
      let res: CloudResponse;
      try {
        res = await o.net.request({
          method: 'POST',
          url: LOGIN_URL,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: loginBody(phone, password, scope()),
          timeoutMs,
        });
      } catch (e) {
        throw netError(e);
      }
      if (res.status === 401 || res.status === 400) throw new MiraieError('badLogin');
      if (res.status === 412 || res.status === 404) throw new MiraieError('notRegistered');
      if (res.status < 200 || res.status >= 300)
        throw new MiraieError('offline', `HTTP ${res.status}`);
      const tokens = parseLogin(res.body, now());
      if (!tokens) throw new MiraieError('offline', 'Login answer without a token');
      return tokens;
    },

    async listAcs(token) {
      const all = parseHomes((await get(HOMES_URL, token)).body);
      const acs: MiraieAc[] = [];
      for (const d of all) {
        // Accounts can hold fans and switches too: keep the ACs. A details call that fails for one
        // device must not hide the others, so it keeps that device (the user picks from the list).
        let category: string | null = null;
        try {
          category = parseCategory((await get(deviceUrl(d.deviceId), token)).body);
        } catch (e) {
          if (e instanceof TokenRejected) throw e;
        }
        if (category === null || category === 'ac') acs.push(d);
      }
      return acs;
    },

    async status(token, deviceId) {
      return (await get(statusUrl(deviceId), token)).body;
    },
  };
}
