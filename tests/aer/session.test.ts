// From aer-remote tests/device/session.test.ts (2026-11-04). Adapted: imports and DeviceError->AerError.
import { createFakeTransport, type FakeDispenserOptions } from '@/aer/testing/fakeDispenser';
import { AerError } from '@/aer/errors';
import { DispenserSession, openSession, type SessionOptions } from '@/aer/session';
import { fetchStatusMsg, MT, sprayNowMsg } from '@/aer/protocol/messages';
import { charUuid, DEFAULT_CHANNELS } from '@/aer/protocol/uuids';
import type { BleConnection, BleTransport } from '@/transport/ble/transport';
import * as cbor from '@/aer/protocol/cbor';
import { encodeMap } from '@/aer/protocol/cbor';

const ID = 'dev1';
const NOW = new Date('2026-10-26T10:00:00Z');
const base: SessionOptions = { now: () => NOW };

const setup = (opts: FakeDispenserOptions = {}) => createFakeTransport({ [ID]: opts });

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (e) {
    if (e instanceof AerError) return e.code;
    throw e;
  }
  return 'resolved';
};

describe('openSession', () => {
  it('opens, sets the time and returns status', async () => {
    const t = setup();
    const { status, channels } = await openSession(t, ID, 'Asia/Kolkata', undefined, base);
    expect(status.autoSpray).toBeNull();
    expect(status.batteryMv).toBe(3000);
    expect(channels).toEqual(DEFAULT_CHANNELS);
    expect(t.state(ID).writes.map((w) => w.mT)).toEqual([102, 107]);
  });

  it('sends the set-time with the epoch and the negated standard offset', async () => {
    const t = setup();
    await openSession(t, ID, 'Asia/Kolkata', undefined, base);
    expect(t.state(ID).time).toBe(Math.floor(NOW.getTime() / 1000));
  });

  it('sends tZ -330 for Asia/Kolkata', async () => {
    const t = setup();
    const writes: Uint8Array[] = [];
    const wrapped: BleTransport = {
      ...t,
      adapterState: () => t.adapterState(),
      async connect(id, ms) {
        const c = await t.connect(id, ms);
        return {
          deviceId: c.deviceId,
          characteristics: () => c.characteristics(),
          write: (u, b) => {
            writes.push(b);
            return c.write(u, b);
          },
          subscribe: (u, cb) => c.subscribe(u, cb),
          onDisconnect: (cb) => c.onDisconnect(cb),
          disconnect: () => c.disconnect(),
        };
      },
    };
    await openSession(wrapped, ID, 'Asia/Kolkata', undefined, base);
    // CBOR negative int -330 = 0x39 0x01 0x49
    const hex = Buffer.from(writes[0] ?? new Uint8Array()).toString('hex');
    expect(hex).toContain(Buffer.from('tZ').toString('hex') + '390149');
  });

  it('finds the command characteristic by probing', async () => {
    const t = setup({ commandChar: charUuid('0002') });
    const { channels, status } = await openSession(t, ID, 'Asia/Kolkata', undefined, {
      ...base,
      replyTimeoutMs: 20,
    });
    expect(channels.command).toBe(charUuid('0002'));
    expect(channels.schedule).toBe(charUuid('0004'));
    expect(status.batteryMv).toBe(3000);
    const writes = t.state(ID).writes;
    expect(writes[writes.length - 1]).toEqual({ char: charUuid('0002'), mT: MT.setTime });
  });

  it('uses known channels without probing', async () => {
    const t = setup({ commandChar: charUuid('0002') });
    const known = { ...DEFAULT_CHANNELS, command: charUuid('0002') };
    const { channels } = await openSession(t, ID, 'Asia/Kolkata', known, base);
    expect(channels).toEqual(known);
    expect(t.state(ID).writes.map((w) => w.mT)).toEqual([102, 107]);
  });

  it('fails with noReply when no characteristic answers, and disconnects', async () => {
    const t = setup({ dropReplies: true });
    const p = codeOf(
      openSession(t, ID, 'Asia/Kolkata', undefined, { ...base, replyTimeoutMs: 10 }),
    );
    expect(await p).toBe('noReply');
    // connection released: a new one can be opened
    await expect(t.connect(ID, 1000)).resolves.toBeDefined();
  });

  it('reports unreachable after 3 attempts when busy', async () => {
    jest.useFakeTimers();
    try {
      const t = setup({ busy: true });
      const spy = jest.spyOn(t, 'connect');
      const p = codeOf(openSession(t, ID, 'Asia/Kolkata', undefined, base));
      await jest.advanceTimersByTimeAsync(500);
      expect(spy).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(1500);
      expect(await p).toBe('unreachable');
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for permissions before the adapter check and proceeds when granted', async () => {
    const t = setup();
    const order: string[] = [];
    const wrapped: BleTransport = {
      ...t,
      requestPermissions: async () => {
        order.push('permissions');
        return true;
      },
      adapterState: async () => {
        order.push('adapter');
        return 'on';
      },
      connect: (id, ms) => t.connect(id, ms),
    };
    await openSession(wrapped, ID, 'UTC', undefined, base);
    expect(order).toEqual(['permissions', 'adapter']);
  });

  it('maps denied permissions to permissionDenied without connecting', async () => {
    const t = { ...setup(), requestPermissions: async () => false } as BleTransport;
    const connect = jest.spyOn(t, 'connect');
    const adapter = jest.spyOn(t, 'adapterState');
    expect(await codeOf(openSession(t, ID, 'UTC', undefined, base))).toBe('permissionDenied');
    expect(connect).not.toHaveBeenCalled();
    expect(adapter).not.toHaveBeenCalled();
  });

  it('maps a failing permission request to permissionDenied without connecting', async () => {
    const t = {
      ...setup(),
      requestPermissions: () => Promise.reject(new Error('no activity')),
    } as BleTransport;
    const connect = jest.spyOn(t, 'connect');
    expect(await codeOf(openSession(t, ID, 'UTC', undefined, base))).toBe('permissionDenied');
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([
    ['off', 'bluetoothOff'],
    ['unsupported', 'bluetoothOff'],
    ['unauthorized', 'permissionDenied'],
  ] as const)('maps adapter %s to %s', async (state, code) => {
    const t = { ...setup(), adapterState: async () => state } as BleTransport;
    const spy = jest.spyOn(t, 'connect');
    expect(await codeOf(openSession(t, ID, 'UTC', undefined, base))).toBe(code);
    expect(spy).not.toHaveBeenCalled();
  });

  it('proceeds when the adapter state is unknown', async () => {
    const real = setup();
    const t = { ...real, adapterState: async () => 'unknown' as const } as BleTransport;
    await expect(openSession(t, ID, 'UTC', undefined, base)).resolves.toBeDefined();
  });

  it('copes with split replies', async () => {
    const t = setup({ splitReplies: true });
    const { status } = await openSession(t, ID, 'UTC', undefined, base);
    expect(status.batteryMv).toBe(3000);
  });

  it('disconnects if setup fails after connecting', async () => {
    const real = setup();
    const t: BleTransport = {
      ...real,
      async connect(id, ms) {
        const c = await real.connect(id, ms);
        return {
          ...c,
          deviceId: c.deviceId,
          characteristics: () => c.characteristics(),
          write: (u, b) => c.write(u, b),
          onDisconnect: (cb) => c.onDisconnect(cb),
          disconnect: () => c.disconnect(),
          subscribe: async () => {
            throw new Error('nope');
          },
        };
      },
    };
    expect(await codeOf(openSession(t, ID, 'UTC', undefined, base))).toBe('unreachable');
    await expect(real.connect(ID, 1000)).resolves.toBeDefined();
  });
});

describe('DispenserSession.send', () => {
  const open = async (opts: FakeDispenserOptions = {}, so: SessionOptions = {}) => {
    const t = setup(opts);
    const opened = await openSession(t, ID, 'UTC', undefined, { ...base, ...so });
    return { t, ...opened };
  };

  it('resolves with the matching reply', async () => {
    const { session } = await open();
    const r = await session.send(sprayNowMsg(session.nextMN(), 10));
    expect(r.mT).toBe(MT.sprayNow + 50);
    expect(r.ack).toBe(200);
  });

  it('ignores a stale reply carrying the previous mN', async () => {
    const { session } = await open({ lateReplyFromPrevious: true });
    const mN = session.nextMN();
    const r = await session.send(fetchStatusMsg(mN));
    expect(r.mN).toBe(mN);
  });

  it('writes concurrent sends one after another', async () => {
    const { t, session } = await open({ replyDelayMs: 5 });
    const before = t.state(ID).writes.length;
    const a = session.send(sprayNowMsg(session.nextMN(), 10));
    const b = session.send(fetchStatusMsg(session.nextMN()));
    await Promise.resolve();
    await Promise.resolve();
    expect(t.state(ID).writes.length).toBe(before + 1);
    await Promise.all([a, b]);
    expect(
      t
        .state(ID)
        .writes.slice(before)
        .map((w) => w.mT),
    ).toEqual([104, 107]);
  });

  it('times out with noReply when replies are dropped', async () => {
    jest.useFakeTimers();
    try {
      const t2 = setup({ dropReplies: true });
      const conn = await t2.connect(ID, 1000);
      const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS, { replyTimeoutMs: 3000 });
      const p = codeOf(s.send(fetchStatusMsg(100)));
      await jest.advanceTimersByTimeAsync(2999);
      let settled = false;
      void p.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(await p).toBe('noReply');
      expect(s.connected).toBe(true);
      await s.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never lets a late reply to a timed-out command satisfy a later one', async () => {
    jest.useFakeTimers();
    try {
      const t = setup({ replyDelayMs: 100 });
      const conn = await t.connect(ID, 1000);
      const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS, { replyTimeoutMs: 50 });
      const first = codeOf(s.send(fetchStatusMsg(100)));
      await jest.advanceTimersByTimeAsync(50);
      expect(await first).toBe('noReply');
      const second = s.send(fetchStatusMsg(101));
      const outcome = second.then(
        (r) => r.mN,
        (e: unknown) => (e instanceof AerError ? e.code : 'other'),
      );
      // first reply (mN 100) lands at t=100 while the second command waits
      await jest.advanceTimersByTimeAsync(60);
      expect(await outcome).toBe('noReply');
      await s.close();
    } finally {
      jest.useRealTimers();
    }
  });

  describe('with a scripted link', () => {
    const scripted = () => {
      let onData: (b: Uint8Array) => void = () => undefined;
      const writes: Uint8Array[] = [];
      const conn: BleConnection = {
        deviceId: ID,
        characteristics: async () => [],
        write: async (_u, b) => {
          writes.push(b);
        },
        subscribe: async (_u, cb) => {
          onData = cb;
          return () => undefined;
        },
        onDisconnect: () => () => undefined,
        disconnect: async () => undefined,
      };
      return { conn, emit: (b: Uint8Array) => onData(b), writes };
    };
    const reply = (mT: number, mN: number, ack: number) =>
      encodeMap([
        ['mT', mT + 50],
        ['mN', mN],
        ['ack', ack],
      ]);

    it('maps a non-200 ack to rejected', async () => {
      const { conn, emit } = scripted();
      const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS);
      const p = codeOf(s.send(fetchStatusMsg(100)));
      await Promise.resolve();
      emit(reply(MT.fetchStatus, 100, 500));
      expect(await p).toBe('rejected');
      await s.close();
    });

    it('recovers after a corrupt frame', async () => {
      const { conn, emit } = scripted();
      const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS);
      emit(Uint8Array.from([0xff, 0xff, 0xff]));
      const p = s.send(fetchStatusMsg(100));
      await Promise.resolve();
      emit(reply(MT.fetchStatus, 100, 200));
      await expect(p).resolves.toMatchObject({ mN: 100 });
      await s.close();
    });

    it('discards an oversized incomplete frame', async () => {
      const { conn, emit } = scripted();
      const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS);
      // byte string header claiming 60000 bytes, then more than the cap of payload
      emit(Uint8Array.from([0x59, 0xea, 0x60]));
      emit(new Uint8Array(2000));
      const p = s.send(fetchStatusMsg(100));
      await Promise.resolve();
      emit(reply(MT.fetchStatus, 100, 200));
      await expect(p).resolves.toMatchObject({ mN: 100 });
      await s.close();
    });
  });

  it('rejects the in-flight command with disconnected when the link drops', async () => {
    const { t, session } = await open({ replyDelayMs: 50 });
    const p = codeOf(session.send(fetchStatusMsg(session.nextMN())));
    await Promise.resolve();
    t.disconnect(ID);
    expect(await p).toBe('disconnected');
    expect(session.connected).toBe(false);
    expect(await codeOf(session.send(fetchStatusMsg(1)))).toBe('disconnected');
  });

  it('rejects queued commands too, and notifies onDisconnect once', async () => {
    const { t, session } = await open({ replyDelayMs: 50 });
    const cb = jest.fn();
    const off = session.onDisconnect(cb);
    const a = codeOf(session.send(fetchStatusMsg(session.nextMN())));
    const b = codeOf(session.send(fetchStatusMsg(session.nextMN())));
    await Promise.resolve();
    t.disconnect(ID);
    expect(await a).toBe('disconnected');
    expect(await b).toBe('disconnected');
    expect(cb).toHaveBeenCalledTimes(1);
    off();
  });

  it('handles a link that drops mid-command via disconnectAfter', async () => {
    const t = setup({ disconnectAfter: 3 });
    const { session } = await openSession(t, ID, 'UTC', undefined, base);
    expect(await codeOf(session.send(fetchStatusMsg(session.nextMN())))).toBe('disconnected');
  });

  it('close disconnects, is idempotent, and later sends reject', async () => {
    const { t, session } = await open();
    await session.close();
    await session.close();
    expect(session.connected).toBe(false);
    expect(await codeOf(session.send(fetchStatusMsg(1)))).toBe('disconnected');
    await expect(t.connect(ID, 1000)).resolves.toBeDefined();
  });

  it('cycles mN between 100 and 253', async () => {
    const { session } = await open();
    const seen: number[] = [];
    for (let i = 0; i < 160; i += 1) seen.push(session.nextMN());
    expect(Math.min(...seen)).toBe(100);
    expect(Math.max(...seen)).toBe(253);
  });
});

describe('openSession hardening', () => {
  const OTA = '00010203-0405-0607-0809-0a0b0c0d2b12';

  it('never writes to the OTA or any non-aer characteristic while probing', async () => {
    const t = setup({
      commandChar: charUuid('0002'),
      extraWritable: [OTA, 'dead0000-0000-0000-0000-000000000000'],
    });
    const { session } = await openSession(t, ID, 'UTC', undefined, { ...base, replyTimeoutMs: 20 });
    const chars = new Set(t.state(ID).writes.map((w) => w.char));
    expect([...chars].every((c) => [charUuid('0002'), charUuid('0003')].includes(c))).toBe(true);
    await session.close();
  });

  it('does not probe an OTA-only device and fails with noReply', async () => {
    const t = setup({ commandChar: OTA, extraWritable: [OTA], dropReplies: true });
    expect(
      await codeOf(openSession(t, ID, 'UTC', undefined, { ...base, replyTimeoutMs: 10 })),
    ).toBe('noReply');
    expect(t.state(ID).writes.some((w) => w.char === OTA)).toBe(false);
  });

  it('falls back to the found command char for schedules when 0004 is not writable', async () => {
    const t = setup({ commandChar: charUuid('0002'), scheduleReadOnly: true });
    const { channels, session } = await openSession(t, ID, 'UTC', undefined, {
      ...base,
      replyTimeoutMs: 20,
    });
    expect(channels.schedule).toBe(charUuid('0002'));
    await session.close();
  });

  it('retries set-time once after status succeeds and reports clockSet', async () => {
    const t = setup();
    const { clockSet, session } = await openSession(t, ID, 'UTC', undefined, base);
    expect(clockSet).toBe(true);
    await session.close();
  });

  it('retries a failed set-time and still opens with clockSet false if it keeps failing', async () => {
    jest.useFakeTimers();
    try {
      const real = setup();
      // swallow set-time writes so they are never answered
      const t: BleTransport = {
        ...real,
        async connect(id, ms) {
          const c = await real.connect(id, ms);
          return {
            deviceId: c.deviceId,
            characteristics: () => c.characteristics(),
            write: (u, b) =>
              b.length > 0 && Buffer.from(b).includes(Buffer.from([0x18, 102]))
                ? Promise.resolve()
                : c.write(u, b),
            subscribe: (u, cb) => c.subscribe(u, cb),
            onDisconnect: (cb) => c.onDisconnect(cb),
            disconnect: () => c.disconnect(),
          };
        },
      };
      const p = openSession(t, ID, 'UTC', undefined, { ...base, replyTimeoutMs: 100 });
      await jest.advanceTimersByTimeAsync(1000);
      const { clockSet, status, session } = await p;
      expect(clockSet).toBe(false);
      expect(status.batteryMv).toBe(3000);
      expect(real.state(ID).writes.map((w) => w.mT)).toEqual([107]);
      await session.close();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects an invalid time zone with a timeZone AerError before touching the radio', async () => {
    const t = setup();
    const spy = jest.spyOn(t, 'connect');
    const adapter = jest.spyOn(t, 'adapterState');
    const p = openSession(t, ID, 'Not/AZone', undefined, base);
    await expect(p).rejects.toBeInstanceOf(AerError);
    await expect(p).rejects.toMatchObject({ code: 'timeZone' });
    expect(spy).not.toHaveBeenCalled();
    expect(adapter).not.toHaveBeenCalled();
  });

  it('turns an unparseable status into noReply', async () => {
    const t = setup({ omitBv: true });
    expect(
      await codeOf(openSession(t, ID, 'UTC', undefined, { ...base, replyTimeoutMs: 10 })),
    ).toBe('noReply');
  });

  it('maps a write failure to noReply', async () => {
    const real = setup();
    const conn = await real.connect(ID, 1000);
    const failing: BleConnection = {
      ...conn,
      deviceId: ID,
      characteristics: () => conn.characteristics(),
      subscribe: (u, cb) => conn.subscribe(u, cb),
      onDisconnect: (cb) => conn.onDisconnect(cb),
      disconnect: () => conn.disconnect(),
      write: async () => {
        throw new Error('gatt');
      },
    };
    const s = await DispenserSession.attach(failing, DEFAULT_CHANNELS);
    expect(await codeOf(s.send(fetchStatusMsg(100)))).toBe('noReply');
    await s.close();
  });

  it('stops notifying an unsubscribed disconnect callback', async () => {
    const t = setup();
    const { session } = await openSession(t, ID, 'UTC', undefined, base);
    const cb = jest.fn();
    session.onDisconnect(cb)();
    t.disconnect(ID);
    expect(cb).not.toHaveBeenCalled();
  });

  it('keeps notifying others when one disconnect callback throws', async () => {
    const t = setup();
    const { session } = await openSession(t, ID, 'UTC', undefined, base);
    const ok = jest.fn();
    session.onDisconnect(() => {
      throw new Error('boom');
    });
    session.onDisconnect(ok);
    t.disconnect(ID);
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it('never throws into the transport on a non-Cbor decode failure', async () => {
    let emit: (b: Uint8Array) => void = () => undefined;
    const conn: BleConnection = {
      deviceId: ID,
      characteristics: async () => [],
      write: async () => undefined,
      subscribe: async (_u, cb) => {
        emit = cb;
        return () => undefined;
      },
      onDisconnect: () => () => undefined,
      disconnect: async () => undefined,
    };
    const s = await DispenserSession.attach(conn, DEFAULT_CHANNELS);
    const spy = jest.spyOn(cbor, 'decodeFirst').mockImplementationOnce(() => {
      throw new RangeError('weird');
    });
    expect(() => emit(Uint8Array.from([0xa1]))).not.toThrow();
    spy.mockRestore();
    await s.close();
  });
});
