import { DeviceError } from '@/core';
import type { TvStream } from '@/tv/transport';
import { decodePairing, encodePairing, encodeRemote, STATUS_OK } from '@/androidtv/messages';
import { FrameReader, frame } from '@/androidtv/proto';
import { pairingSecret } from '@/androidtv/secret';
import { createFakeAtv } from '@/androidtv/testing/fakeAtv';
import { createFakeAtvLan } from '@/androidtv/testing/fakeAtvLan';

const HOST = '192.168.1.20';

/** Collects the frames a stream delivers. */
function listen(s: TvStream): { frames: Uint8Array[]; closed: () => boolean } {
  const r = new FrameReader();
  const frames: Uint8Array[] = [];
  let closed = false;
  s.onData((b) => frames.push(...r.push(b)));
  s.onClose(() => (closed = true));
  return { frames, closed: () => closed };
}
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const setup = async () => {
  const tv = createFakeAtv({ host: HOST });
  const lan = createFakeAtvLan({ tvs: [tv] });
  const id = await lan.ensureIdentity('c', 'One Remote');
  return { tv, lan, id };
};

async function pair(
  tv: ReturnType<typeof createFakeAtv>,
  lan: Awaited<ReturnType<typeof setup>>['lan'],
  secretFor?: string,
) {
  const s = await lan.openStream(HOST, 6467, 1000, { pairing: true, identity: 'c' });
  const l = listen(s);
  s.write(frame(encodePairing({ kind: 'pairingRequest', clientName: 'One Remote' })));
  s.write(frame(encodePairing({ kind: 'options' })));
  s.write(frame(encodePairing({ kind: 'configuration' })));
  await flush();
  const code = secretFor ?? tv.shownCode()!;
  const secret = pairingSecret(
    lan.identities.get('c')!,
    { modulusHex: s.serverModulusHex, exponentHex: s.serverExponentHex },
    code,
  );
  s.write(frame(encodePairing({ kind: 'secret', secret: secret ?? new Uint8Array(32) })));
  await flush();
  return { s, l };
}

test('a full good pairing ends with secretAck and a trusted modulus', async () => {
  const { tv, lan, id } = await setup();
  const { l } = await pair(tv, lan);
  const kinds = l.frames.map((f) => decodePairing(f));
  expect(kinds.map((k) => k.msg.kind)).toEqual([
    'pairingRequestAck',
    'options',
    'configurationAck',
    'secretAck',
  ]);
  expect(kinds.every((k) => k.status === STATUS_OK)).toBe(true);
  expect(tv.trusted.has(id.modulusHex)).toBe(true);
});

test('a bad secret gives status 402 and a close', async () => {
  const { tv, lan, id } = await setup();
  const { l } = await pair(tv, lan, '000000');
  expect(decodePairing(l.frames[l.frames.length - 1]!).status).toBe(402);
  expect(l.closed()).toBe(true);
  expect(tv.trusted.has(id.modulusHex)).toBe(false);
});

test('6466 without trust fails with handshake failed', async () => {
  const { lan } = await setup();
  await expect(
    lan.openStream(HOST, 6466, 1000, { pairing: true, identity: 'c' }),
  ).rejects.toMatchObject({
    code: 'notSent',
    message: expect.stringContaining('handshake failed'),
  });
});

test('after pairing, 6466 configures and a ping is answered', async () => {
  const { tv, lan } = await setup();
  await pair(tv, lan);
  const s = await lan.openStream(HOST, 6466, 1000, { pinSha256: tv.certSha256, identity: 'c' });
  const l = listen(s);
  await flush();
  expect(l.frames).toHaveLength(1);
  s.write(frame(encodeRemote({ kind: 'configure', features: 103 })));
  await flush();
  expect(tv.configures).toEqual([103]);
  expect(l.frames.length).toBeGreaterThanOrEqual(4);
  tv.ping(7);
  await flush();
  s.write(frame(encodeRemote({ kind: 'pong', val1: 7 })));
  s.write(frame(encodeRemote({ kind: 'key', code: 19, direction: 3 })));
  expect(tv.pongs).toEqual([7]);
  expect(tv.keys).toEqual([{ code: 19, direction: 3 }]);
});

test('moveTo makes the old host notSent', async () => {
  const { tv, lan } = await setup();
  tv.moveTo('192.168.1.31');
  await expect(lan.openStream(HOST, 6467, 1000, { pairing: true })).rejects.toMatchObject({
    code: 'notSent',
  });
  await expect(
    lan.openStream('192.168.1.31', 6467, 1000, { pairing: true }),
  ).resolves.toBeDefined();
});

test('a wrong pin is notPaired, and no pin and no pairing too', async () => {
  const { tv, lan } = await setup();
  const err = await lan
    .openStream(HOST, 6467, 1000, { pinSha256: 'other' })
    .catch((e: unknown) => e);
  expect(err).toBeInstanceOf(DeviceError);
  expect((err as DeviceError).code).toBe('notPaired');
  await expect(lan.openStream(HOST, 6467, 1000, {})).rejects.toMatchObject({ code: 'notPaired' });
  expect(tv.connections(6467)).toBe(0);
});

test('identities are deterministic until deleted', async () => {
  const { lan, id } = await setup();
  expect(await lan.ensureIdentity('c', 'x')).toEqual(id);
  await lan.deleteIdentity('c');
  expect((await lan.ensureIdentity('c', 'x')).modulusHex).not.toBe(id.modulusHex);
});
