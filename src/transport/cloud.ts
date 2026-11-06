/**
 * The app's only internet code: the opt-in MirAIe cloud connection (Panasonic India ACs).
 *
 * Everything else in One Remote is local and goes through `assertLocal()`. This file is the one,
 * deliberate exception, and it is fenced in three ways:
 * - it reaches only the MirAIe hosts in `MIRAIE_HOSTS` (exact names, https on 443, TLS on 8883);
 * - it refuses everything while the opt-in in Settings is off (`enabled()` is read on every call);
 * - TLS is verified against the system CAs, and the leaf certificate must name the host before a
 *   single byte (the token) is written.
 * Lint lets `fetch` appear only here (see eslint.config.js).
 */
import { CloudNetError } from '@/miraie/net';
import type { CloudNet, CloudRequest, CloudResponse, CloudStream } from '@/miraie/net';
import { MIRAIE_BROKER_PORT, MIRAIE_HOSTS } from '@/miraie/protocol';

/** A raw TLS socket from `cloudTls.ts` (faked in tests). */
export interface RawTls {
  /** The leaf certificate's subject CN, once the handshake is done. Null when unknown. */
  peerCommonName(): Promise<string | null>;
  write(bytes: Uint8Array): void;
  close(): void;
  onData(cb: (bytes: Uint8Array) => void): void;
  onClose(cb: () => void): void;
}

/** Opens a TLS socket checked against the system CAs; rejects on any failure. */
export type TlsDialer = (host: string, port: number, timeoutMs: number) => Promise<RawTls>;

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
    credentials: 'omit';
    redirect: 'error';
  },
) => Promise<{ status: number; url?: string; text(): Promise<string> }>;

export interface CloudNetOptions {
  /** The opt-in. Read on every request and connect. */
  enabled: () => boolean;
  dial: TlsDialer;
  fetch: FetchLike;
  /** Longest response body accepted. */
  maxBytes?: number;
}

const MAX_BYTES = 1024 * 1024;
const HTTPS_URL = /^https:\/\/([a-z0-9.-]+)(?::443)?(\/[^\s#]*)?$/i;

/** The host of an allowed `https://` URL, else null. No user info, other ports or odd schemes. */
export function allowedHttpsHost(url: string): string | null {
  const m = HTTPS_URL.exec(url);
  const host = m?.[1]?.toLowerCase();
  return host && MIRAIE_HOSTS.includes(host) ? host : null;
}

/** True when a certificate CN names `host` (exactly, or by a one-label wildcard). */
export function certNamesHost(cn: string | null, host: string): boolean {
  if (!cn) return false;
  const name = cn.trim().toLowerCase();
  if (name === host) return true;
  if (!name.startsWith('*.')) return false;
  const suffix = name.slice(1);
  const label = host.slice(0, host.length - suffix.length);
  return host.endsWith(suffix) && label.length > 0 && !label.includes('.');
}

export function createCloudNet(o: CloudNetOptions): CloudNet {
  const maxBytes = o.maxBytes ?? MAX_BYTES;
  const gate = (): void => {
    if (!o.enabled()) throw new CloudNetError('off', 'MirAIe cloud is off');
  };

  return {
    async request(req: CloudRequest): Promise<CloudResponse> {
      gate();
      if (allowedHttpsHost(req.url) === null)
        throw new CloudNetError('notAllowed', 'Not a MirAIe URL');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const res = await o.fetch(req.url, {
          method: req.method,
          headers: req.headers ?? {},
          ...(req.body !== undefined ? { body: req.body } : {}),
          signal: controller.signal,
          credentials: 'omit',
          redirect: 'error',
        });
        // A platform that followed a redirect anyway must not hand back another host's answer.
        if (res.url && allowedHttpsHost(res.url) === null) {
          throw new CloudNetError('notAllowed', 'Redirected off MirAIe');
        }
        if (res.status >= 300 && res.status < 400) throw new CloudNetError('failed', 'Redirect');
        const body = await res.text();
        if (body.length > maxBytes) throw new CloudNetError('failed', 'Response too large');
        return { status: res.status, body };
      } catch (e) {
        if (e instanceof CloudNetError) throw e;
        throw new CloudNetError('failed', e instanceof Error ? e.message : 'Request failed');
      } finally {
        clearTimeout(timer);
      }
    },

    async openTls(host: string, port: number, timeoutMs: number): Promise<CloudStream> {
      gate();
      const h = host.toLowerCase();
      if (!MIRAIE_HOSTS.includes(h) || port !== MIRAIE_BROKER_PORT) {
        throw new CloudNetError('notAllowed', 'Not the MirAIe broker');
      }
      let raw: RawTls;
      try {
        raw = await o.dial(h, port, timeoutMs);
      } catch (e) {
        throw new CloudNetError('failed', e instanceof Error ? e.message : 'Connect failed');
      }
      let cn: string | null = null;
      try {
        cn = await raw.peerCommonName();
      } catch {
        cn = null;
      }
      if (!certNamesHost(cn, h)) {
        raw.close();
        throw new CloudNetError('badCertificate', 'The certificate is not for the MirAIe broker');
      }
      // The opt-in may have been turned off while connecting.
      if (!o.enabled()) {
        raw.close();
        throw new CloudNetError('off', 'MirAIe cloud is off');
      }
      let ended = false;
      let closeCb: (() => void) | undefined;
      raw.onClose(() => {
        if (ended) return;
        ended = true;
        closeCb?.();
      });
      return {
        write(bytes) {
          if (ended) throw new CloudNetError('failed', 'Closed');
          raw.write(bytes);
        },
        close() {
          if (ended) return;
          ended = true;
          raw.close();
        },
        onData(cb) {
          raw.onData((b) => {
            if (!ended) cb(b);
          });
        },
        onClose(cb) {
          closeCb = cb;
        },
      };
    },
  };
}

/**
 * The platform fetch, used only for the MirAIe login and device list. This is the one place in the
 * app that may call it (lint enforces that); `createCloudNet` checks every URL before it gets here.
 */
export const platformFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init);
  return { status: res.status, url: res.url, text: () => res.text() };
};
