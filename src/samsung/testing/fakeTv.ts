import type { TvSocket } from '@/tv/transport';
import { INFO_PORT, WSS_PORT } from '../url';

export interface FakeSamsungTv {
  host: string;
  mac: string;
  name: string;
  certSha256: string;
  /** KEY_* names received, in order (JSON key frames only). */
  keys: string[];
  /** Decoded UTF-8 text of each SendInputString received. */
  texts: string[];
  /** 'on': everything answers. 'standby': info answers with PowerState "standby", wss refused.
   *  'off': nothing answers (SSDP, probe, request, open). */
  setPower(p: 'on' | 'standby' | 'off'): void;
  /** Pending Allow prompt, if a client connected without a valid token. */
  allow(): void;
  deny(): void;
  /** Forget the token, as removing the device in the TV's own list does: the next connect prompts. */
  revokeToken(): void;
  /** Close every open socket from the TV's side. */
  drop(): void;
  /** Sockets stay open but no ms.channel.connect is ever sent (an unanswered prompt, or a hung TV). */
  stayQuiet(on: boolean): void;
  moveTo(host: string): void;
  infoRequests(): number;
  connections(): number;
  /** Serve this body on the info page instead (a router, junk). */
  setInfoBody(body: string | null): void;
  /** Used by the fake LAN: does a `wss://` URL address this TV's remote-control channel? */
  matches(url: string): boolean;
  /** Used by the fake LAN: the TV's answer to the info page, or null when nothing answers. */
  infoBody(): string | null;
  /** Used by the fake LAN: opens a socket. Null when the TV would refuse. */
  connect(url: string): TvSocket | null;
  /** Used by the fake LAN: the SSDP reply text, or null when the TV is off. */
  ssdpReply(): string | null;
  /** Used by the fake LAN: false only when the TV is off. */
  isUp(): boolean;
}

export interface FakeSamsungOpts {
  host: string;
  mac: string;
  name?: string;
  model?: string;
  certSha256?: string;
  /** Default '12345678'. */
  token?: string;
  /** 'manual': the test calls allow()/deny(); 'allow' and 'deny' resolve at once. Default 'manual'. */
  prompt?: 'manual' | 'allow' | 'deny';
  /** No token in ms.channel.connect (old firmware). */
  noToken?: boolean;
}

interface Conn {
  deliver: (text: string) => void;
  closeCbs: (() => void)[];
  closed: boolean;
  authorized: boolean;
}

const WSS_RE = /^wss:\/\/([^/:]+):(\d+)\/api\/v2\/channels\/samsung\.remote\.control(\?.*)?$/;

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function createFakeSamsungTv(o: FakeSamsungOpts): FakeSamsungTv {
  const token = o.token ?? '12345678';
  const prompt = o.prompt ?? 'manual';
  const name = o.name ?? '[TV] Samsung 7 Series';
  const model = o.model ?? 'UE55NU7100';
  let host = o.host;
  let power: 'on' | 'standby' | 'off' = 'on';
  let tokenValid = true;
  let quiet = false;
  let infoOverride: string | null = null;
  let infoCount = 0;
  const conns = new Set<Conn>();
  const pending = new Set<Conn>();
  const keys: string[] = [];
  const texts: string[] = [];

  const send = (c: Conn, message: object): void => {
    const text = JSON.stringify(message);
    void Promise.resolve().then(() => {
      if (!c.closed) c.deliver(text);
    });
  };
  const grant = (c: Conn): void => {
    c.authorized = true;
    send(c, {
      event: 'ms.channel.connect',
      data: o.noToken ? {} : { token },
    });
  };
  const closeConn = (c: Conn): void => {
    if (c.closed) return;
    c.closed = true;
    conns.delete(c);
    pending.delete(c);
    c.closeCbs.forEach((cb) => cb());
  };
  const dropAll = (): void => {
    for (const c of [...conns]) closeConn(c);
  };

  const handle = (c: Conn, text: string): void => {
    if (!c.authorized) return;
    let m: unknown;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    const params = (m as { params?: Record<string, unknown> } | null)?.params;
    if (!params) return;
    if (params.TypeOfRemote === 'SendRemoteKey' && typeof params.DataOfCmd === 'string') {
      keys.push(params.DataOfCmd);
    } else if (params.TypeOfRemote === 'SendInputString' && typeof params.Cmd === 'string') {
      texts.push(decodeBase64Utf8(params.Cmd));
    }
  };

  const makeSocket = (c: Conn): TvSocket => {
    let onMessage: ((t: string) => void) | undefined;
    const backlog: string[] = [];
    c.deliver = (t) => (onMessage ? onMessage(t) : backlog.push(t));
    return {
      send: (text) => {
        if (c.closed) throw new Error('socket closed');
        handle(c, text);
      },
      close: () => {
        c.closed = true;
        conns.delete(c);
        pending.delete(c);
      },
      onMessage: (cb) => {
        onMessage = cb;
        backlog.splice(0).forEach(cb);
      },
      onClose: (cb) => {
        c.closeCbs.push(cb);
      },
    };
  };

  const tokenOf = (url: string): string => {
    const q = /\?(.*)$/.exec(url)?.[1] ?? '';
    return new URLSearchParams(q).get('token') ?? '';
  };

  return {
    get host() {
      return host;
    },
    set host(h: string) {
      host = h;
    },
    mac: o.mac,
    name,
    certSha256: o.certSha256 ?? `cert-${o.mac.replace(/:/g, '')}`,
    keys,
    texts,
    setPower: (p) => {
      power = p;
      if (p !== 'on') dropAll();
    },
    allow: () => {
      tokenValid = true;
      for (const c of [...pending]) {
        pending.delete(c);
        grant(c);
      }
    },
    deny: () => {
      for (const c of [...pending]) {
        pending.delete(c);
        send(c, { event: 'ms.channel.unauthorized' });
        // The close follows the event, as on the wire.
        void Promise.resolve().then(() => closeConn(c));
      }
    },
    revokeToken: () => {
      tokenValid = false;
    },
    drop: dropAll,
    stayQuiet: (on) => {
      quiet = on;
    },
    moveTo: (h) => {
      host = h;
      dropAll();
    },
    infoRequests: () => infoCount,
    connections: () => conns.size,
    setInfoBody: (b) => {
      infoOverride = b;
    },
    isUp: () => power !== 'off',
    matches: (url) => {
      const m = WSS_RE.exec(url);
      return !!m && m[1] === host && m[2] === String(WSS_PORT);
    },
    infoBody: () => {
      infoCount += 1;
      if (power === 'off') return null;
      if (infoOverride !== null) return infoOverride;
      return JSON.stringify({
        id: `uuid:${o.mac.replace(/:/g, '')}`,
        name,
        version: '2.0.25',
        device: {
          type: 'Samsung SmartTV',
          name,
          modelName: model,
          wifiMac: o.mac.toUpperCase(),
          PowerState: power === 'standby' ? 'standby' : 'on',
        },
        isSupport: '{"DMP_available":"true"}',
      });
    },
    connect: (url) => {
      if (power !== 'on') return null;
      const m = WSS_RE.exec(url);
      if (!m || m[1] !== host || m[2] !== String(WSS_PORT)) return null;
      const c: Conn = { deliver: () => undefined, closeCbs: [], closed: false, authorized: false };
      conns.add(c);
      const sock = makeSocket(c);
      if (quiet) return sock;
      if (tokenValid && !o.noToken && tokenOf(url) === token) {
        grant(c);
      } else if (prompt === 'allow') {
        tokenValid = true;
        grant(c);
      } else if (prompt === 'deny') {
        send(c, { event: 'ms.channel.unauthorized' });
        void Promise.resolve().then(() => closeConn(c));
      } else {
        pending.add(c);
      }
      return sock;
    },
    ssdpReply: () =>
      power === 'off'
        ? null
        : [
            'HTTP/1.1 200 OK',
            'CACHE-CONTROL: max-age=1800',
            `LOCATION: http://${host}:${String(INFO_PORT)}/ms/1.0/`,
            'ST: urn:samsung.com:device:RemoteControlReceiver:1',
            `USN: uuid:${o.mac.replace(/:/g, '')}-fake::urn:samsung.com:device:RemoteControlReceiver:1`,
            '',
            '',
          ].join('\r\n'),
  };
}
