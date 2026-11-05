import type { TvFrame, Unsubscribe } from '@/core';
import type { TvSocket, TvTransport } from '@/tv/transport';

/** Dev-only debug hook: sees every frame the webOS code sends and receives, changing nothing. */
export interface FrameTap {
  /** A transport that behaves exactly like `t` and reports each frame to subscribers. */
  wrap(t: TvTransport): TvTransport;
  subscribe(cb: (f: TvFrame) => void): Unsubscribe;
}

export function createFrameTap(): FrameTap {
  const subs = new Set<(f: TvFrame) => void>();
  const emit = (dir: TvFrame['dir'], text: string): void => {
    if (subs.size === 0) return;
    const f: TvFrame = { dir, text, at: Date.now() };
    for (const cb of [...subs]) {
      try {
        cb(f);
      } catch {
        // a log listener must never disturb the connection
      }
    }
  };
  return {
    subscribe(cb) {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    wrap(t) {
      return {
        ...t,
        open: async (url, timeoutMs, tls): Promise<TvSocket> => {
          const sock = await t.open(url, timeoutMs, tls);
          emit('open', url);
          return {
            ...(sock.certSha256 === undefined ? {} : { certSha256: sock.certSha256 }),
            send: (text) => {
              emit('out', text);
              sock.send(text);
            },
            close: () => sock.close(),
            onMessage: (cb) =>
              sock.onMessage((text) => {
                emit('in', text);
                cb(text);
              }),
            onClose: (cb) => sock.onClose(cb),
          };
        },
        ssdpSearch: (m, w, r) => t.ssdpSearch(m, w, r),
        probe: (ports, ms, onOpen, isCancelled) => t.probe(ports, ms, onOpen, isCancelled),
        sendWol: (p) => t.sendWol(p),
        onWifi: () => t.onWifi(),
      };
    },
  };
}
