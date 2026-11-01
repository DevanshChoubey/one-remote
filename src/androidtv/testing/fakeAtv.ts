import { DeviceError } from '@/core';
import type { TvStream } from '@/tv/transport';
import { STATUS_OK } from '../messages';
import { FrameReader, ProtoWriter, frame, int32, readFields, str, sub, uint } from '../proto';
import { pairingSecret, type RsaPublic } from '../secret';

export interface FakeAtv {
  host: string;
  readonly name: string;
  readonly certSha256: string;
  /** The certificate subject the TV reports (RFC 2253). */
  readonly subject: string;
  readonly server: RsaPublic;
  /** The 6-character code on screen during pairing, else null. */
  shownCode(): string | null;
  /** Client moduli the TV trusts on 6466 (added by a good secret). */
  readonly trusted: Set<string>;
  setPower(on: boolean): void;
  setVolume(level: number, max: number, muted?: boolean): void;
  setApp(pkg: string): void;
  openTextField(imeCounter: number, fieldCounter: number): void;
  ping(val1: number): void;
  refusePairing(): void;
  rejectNextSecret(): void;
  stopAnswering(): void;
  drop(): void;
  moveTo(host: string): void;
  standby(o: { answers: boolean }): void;
  readonly keys: { code: number; direction: number }[];
  readonly imeEdits: { imeCounter: number; fieldCounter: number; value: string }[];
  readonly pongs: number[];
  /** The feature masks of the client's `configure` messages, in order. */
  readonly configures: number[];
  /** Streams open right now on that port. */
  connections(port: 6466 | 6467): number;
  /** Streams ever opened on that port. */
  opened(port: 6466 | 6467): number;
  /** Used by the fake LAN. */
  isUp(): boolean;
  /** Used by the fake LAN. Throws DeviceError('notSent') when this TV would refuse. */
  connect(port: 6466 | 6467, client: RsaPublic | undefined): TvStream;
}

export interface FakeAtvOpts {
  host: string;
  name?: string;
  certSha256?: string;
  subject?: string;
  server?: RsaPublic;
  codeSuffix?: string;
  features?: number;
  /** Left out of the pairing request ack, as a TV that sends no name does. */
  omitServerName?: boolean;
  vendor?: string;
  model?: string;
}

interface Conn {
  port: 6466 | 6467;
  client: RsaPublic | undefined;
  reader: FrameReader;
  deliver: (bytes: Uint8Array) => void;
  closeCbs: (() => void)[];
  closed: boolean;
  muted: boolean;
  /** 6467: the code the user must type, once the pairing request was accepted. */
  code: string | null;
  /** 6466: the client sent its configure. */
  ready: boolean;
}

const hex2 = (b: number): string => b.toString(16).padStart(2, '0').toUpperCase();

/** A fake Android TV speaking the Remote Service v2 on 6466 and the pairing protocol on 6467. */
export function createFakeAtv(o: FakeAtvOpts): FakeAtv {
  let host = o.host;
  const name = o.name ?? `atv-${o.host}`;
  const certSha256 = o.certSha256 ?? `atv-${o.host}`;
  const server = o.server ?? {
    modulusHex: 'E5D4C3B2A19080706F5E4D3C2B1A0918',
    exponentHex: '10001',
  };
  const suffix = (o.codeSuffix ?? '3A7F').toUpperCase();
  const features = o.features ?? 615;
  const conns = new Set<Conn>();
  const opened = { 6466: 0, 6467: 0 };
  const trusted = new Set<string>();
  const keys: { code: number; direction: number }[] = [];
  const imeEdits: { imeCounter: number; fieldCounter: number; value: string }[] = [];
  const pongs: number[] = [];
  const configures: number[] = [];
  let up = true;
  let power = true;
  let volume = { level: 20, max: 100, muted: false };
  let refuse = false;
  let rejectSecret = false;
  let lastCode: string | null = null;

  const send = (c: Conn, msg: Uint8Array): void => {
    if (c.closed || c.muted) return;
    c.deliver(frame(msg));
  };
  const closeConn = (c: Conn): void => {
    if (c.closed) return;
    c.closed = true;
    conns.delete(c);
    if (c.port === 6467 && lastCode === c.code) lastCode = null;
    c.closeCbs.forEach((cb) => cb());
  };
  const dropAll = (): void => {
    for (const c of [...conns]) closeConn(c);
  };
  const remote = (c: Conn): boolean => c.port === 6466 && c.ready;
  const pushRemote = (msg: Uint8Array): void => {
    for (const c of conns) if (remote(c)) send(c, msg);
  };

  const startMsg = (): Uint8Array =>
    new ProtoWriter().message(40, new ProtoWriter().bool(1, power)).finish();
  const volumeMsg = (): Uint8Array =>
    new ProtoWriter()
      .message(
        50,
        new ProtoWriter().varint(6, volume.max).varint(7, volume.level).bool(8, volume.muted),
      )
      .finish();

  const outer = (status: number, field?: number, body?: ProtoWriter): Uint8Array => {
    const w = new ProtoWriter().varint(1, 2).varint(2, status);
    if (field !== undefined && body) w.message(field, body);
    return w.finish();
  };

  const codeFor = (client: RsaPublic): string => {
    for (let b = 0; b < 256; b++) {
      const code = `${hex2(b)}${suffix}`;
      if (pairingSecret(client, server, code)) return code;
    }
    throw new Error('no code');
  };

  const handlePairing = (c: Conn, msg: Uint8Array): void => {
    const f = readFields(msg);
    if (f.has(10)) {
      if (refuse) {
        send(c, outer(400));
        return;
      }
      if (c.client) {
        c.code = codeFor(c.client);
        lastCode = c.code;
      }
      send(
        c,
        outer(
          STATUS_OK,
          11,
          o.omitServerName ? new ProtoWriter() : new ProtoWriter().string(1, name),
        ),
      );
    } else if (f.has(20)) {
      const enc = new ProtoWriter().varint(1, 3).varint(2, 6);
      send(c, outer(STATUS_OK, 20, new ProtoWriter().message(1, enc).varint(3, 1)));
    } else if (f.has(30)) {
      send(c, outer(STATUS_OK, 31, new ProtoWriter()));
    } else if (f.has(40)) {
      const body = sub(f, 40);
      const secret = body?.get(1)?.[0];
      const want = c.client && c.code ? pairingSecret(c.client, server, c.code) : null;
      const good =
        secret instanceof Uint8Array &&
        want !== null &&
        secret.length === want.length &&
        secret.every((x, i) => x === want[i]);
      if (good && !rejectSecret && c.client) {
        trusted.add(c.client.modulusHex);
        send(c, outer(STATUS_OK, 41, new ProtoWriter().bytes(1, want)));
        return;
      }
      if (good) rejectSecret = false;
      send(c, outer(402));
      // The reply is already queued; the close comes after it.
      void Promise.resolve().then(() => closeConn(c));
    }
  };

  const handleRemote = (c: Conn, msg: Uint8Array): void => {
    const f = readFields(msg);
    if (f.has(1)) {
      const body = sub(f, 1);
      configures.push((body ? uint(body, 1) : undefined) ?? 0);
      c.ready = true;
      send(c, new ProtoWriter().message(2, new ProtoWriter().varint(1, 1)).finish());
      send(c, startMsg());
      send(c, volumeMsg());
    } else if (f.has(9)) {
      const body = sub(f, 9);
      pongs.push((body ? int32(body, 1) : undefined) ?? 0);
    } else if (f.has(10)) {
      const body = sub(f, 10);
      keys.push({
        code: (body ? int32(body, 1) : undefined) ?? 0,
        direction: body ? (int32(body, 2) ?? 0) : 0,
      });
    } else if (f.has(21)) {
      const body = sub(f, 21);
      const edit = body ? sub(body, 3) : undefined;
      const status = edit ? sub(edit, 2) : undefined;
      imeEdits.push({
        imeCounter: (body ? int32(body, 1) : undefined) ?? 0,
        fieldCounter: (body ? int32(body, 2) : undefined) ?? 0,
        value: (status ? str(status, 3) : undefined) ?? '',
      });
    }
  };

  const handle = (c: Conn, chunk: Uint8Array): void => {
    let frames: Uint8Array[];
    try {
      frames = c.reader.push(chunk);
    } catch {
      closeConn(c);
      return;
    }
    for (const m of frames) {
      if (c.closed) return;
      if (c.port === 6467) handlePairing(c, m);
      else handleRemote(c, m);
    }
  };

  const makeStream = (port: 6466 | 6467, client: RsaPublic | undefined): TvStream => {
    let onData: ((b: Uint8Array) => void) | undefined;
    const backlog: Uint8Array[] = [];
    const c: Conn = {
      port,
      client,
      reader: new FrameReader(),
      deliver: (b) => {
        void Promise.resolve().then(() => {
          if (c.closed) return;
          if (onData) onData(b);
          else backlog.push(b);
        });
      },
      closeCbs: [],
      closed: false,
      muted: false,
      code: null,
      ready: false,
    };
    conns.add(c);
    opened[port]++;
    let ownClose = false;
    if (port === 6466 && (!client || !trusted.has(client.modulusHex))) {
      // Like a real TV: the TLS handshake completes, then it hangs up on a client it does not know.
      void Promise.resolve().then(() => closeConn(c));
    } else if (port === 6466) {
      const info = new ProtoWriter().string(1, o.model ?? name).string(2, o.vendor ?? 'Fake');
      send(
        c,
        new ProtoWriter()
          .message(1, new ProtoWriter().varint(1, features).message(2, info))
          .finish(),
      );
    }
    return {
      certSha256,
      serverModulusHex: server.modulusHex,
      serverExponentHex: server.exponentHex,
      serverSubject: o.subject ?? 'CN=atvremote',
      write: (bytes) => {
        if (c.closed) throw new DeviceError('notSent', 'stream closed');
        handle(c, bytes);
      },
      close: () => {
        ownClose = true;
        if (c.closed) return;
        c.closed = true;
        conns.delete(c);
        if (c.port === 6467 && lastCode === c.code) lastCode = null;
      },
      onData: (cb) => {
        onData = cb;
        backlog.splice(0).forEach(cb);
      },
      onClose: (cb) => {
        if (ownClose) return;
        if (c.closed) cb();
        else c.closeCbs.push(cb);
      },
    };
  };

  return {
    get host() {
      return host;
    },
    set host(h: string) {
      host = h;
    },
    name,
    certSha256,
    subject: o.subject ?? 'CN=atvremote',
    server,
    shownCode: () => lastCode,
    trusted,
    setPower: (on) => {
      power = on;
      pushRemote(startMsg());
    },
    setVolume: (level, max, muted = false) => {
      volume = { level, max, muted };
      pushRemote(volumeMsg());
    },
    setApp: (pkg) =>
      pushRemote(
        new ProtoWriter()
          .message(20, new ProtoWriter().message(1, new ProtoWriter().string(12, pkg)))
          .finish(),
      ),
    openTextField: (imeCounter, fieldCounter) =>
      pushRemote(
        new ProtoWriter()
          .message(21, new ProtoWriter().varint(1, imeCounter).varint(2, fieldCounter))
          .finish(),
      ),
    ping: (val1) =>
      pushRemote(new ProtoWriter().message(8, new ProtoWriter().varint(1, val1)).finish()),
    refusePairing: () => {
      refuse = true;
    },
    rejectNextSecret: () => {
      rejectSecret = true;
    },
    stopAnswering: () => {
      for (const c of conns) c.muted = true;
    },
    drop: dropAll,
    moveTo: (h) => {
      host = h;
      dropAll();
    },
    standby: ({ answers }) => {
      power = false;
      if (answers) pushRemote(startMsg());
      else {
        up = false;
        dropAll();
      }
    },
    keys,
    imeEdits,
    pongs,
    configures,
    connections: (port) => [...conns].filter((c) => c.port === port).length,
    opened: (port) => opened[port],
    isUp: () => up,
    connect: (port, client) => {
      if (!up) throw new DeviceError('notSent', `cannot connect to ${host}:${String(port)}`);
      return makeStream(port, client);
    },
  };
}
