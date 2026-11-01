import { ProtoWriter, readFields, str, sub } from '@/androidtv/proto';
import { decodePairing, decodeRemote, encodePairing, encodeRemote } from '@/androidtv/messages';

const hex = (b: Uint8Array): string =>
  [...b].map((x) => x.toString(16).padStart(2, '0').toUpperCase()).join(' ');

describe('pairing encoding', () => {
  it('configuration', () =>
    expect(hex(encodePairing({ kind: 'configuration' }))).toBe(
      '08 02 10 C8 01 F2 01 08 0A 04 08 03 10 06 10 01',
    ));

  it('options', () =>
    expect(hex(encodePairing({ kind: 'options' }))).toBe(
      '08 02 10 C8 01 A2 01 08 0A 04 08 03 10 06 18 01',
    ));

  it('pairing request carries atvremote and the client name', () => {
    const req = sub(
      readFields(encodePairing({ kind: 'pairingRequest', clientName: 'One Remote' })),
      10,
    );
    expect(req).toBeDefined();
    expect(str(req!, 1)).toBe('atvremote');
    expect(str(req!, 2)).toBe('One Remote');
  });

  it('secret goes in field 40 as bytes in field 1', () => {
    const body = sub(
      readFields(encodePairing({ kind: 'secret', secret: Uint8Array.of(1, 2, 3) })),
      40,
    );
    expect(body).toBeDefined();
    expect(body!.get(1)?.[0]).toEqual(Uint8Array.of(1, 2, 3));
  });
});

describe('pairing decoding', () => {
  it('a pairing reply with status 402 decodes status 402', () => {
    const b = new ProtoWriter().varint(1, 2).varint(2, 402).message(31, new ProtoWriter()).finish();
    expect(decodePairing(b)).toEqual({ status: 402, msg: { kind: 'configurationAck' } });
  });

  it('a pairing request ack carries the server name', () => {
    const b = new ProtoWriter()
      .varint(1, 2)
      .varint(2, 200)
      .message(11, new ProtoWriter().string(1, 'BRAVIA'))
      .finish();
    expect(decodePairing(b)).toEqual({
      status: 200,
      msg: { kind: 'pairingRequestAck', serverName: 'BRAVIA' },
    });
  });
});

describe('remote encoding', () => {
  it('key DPAD_UP short', () =>
    expect(hex(encodeRemote({ kind: 'key', code: 19, direction: 3 }))).toBe('52 04 08 13 10 03'));

  it('pong echoes val1', () =>
    expect(hex(encodeRemote({ kind: 'pong', val1: 5 }))).toBe('4A 02 08 05'));

  it('text edit carries the counters, the text and a cursor at its end', () => {
    const f = readFields(
      encodeRemote({ kind: 'imeText', imeCounter: 4, fieldCounter: 9, text: 'news' }),
    );
    const edit = sub(f, 21);
    expect(edit).toBeDefined();
    const info = sub(edit!, 3);
    expect(info).toBeDefined();
    const status = sub(info!, 2);
    expect(status).toBeDefined();
    expect(str(status!, 3)).toBe('news');
  });
});

describe('remote decoding', () => {
  it('decodes a ping request', () => {
    const b = new ProtoWriter().message(8, new ProtoWriter().varint(1, 7)).finish();
    expect(decodeRemote(b)).toEqual({ kind: 'ping', val1: 7 });
  });

  it('decodes a start message', () => {
    const b = new ProtoWriter().message(40, new ProtoWriter().bool(1, true)).finish();
    expect(decodeRemote(b)).toEqual({ kind: 'start', started: true });
  });

  it('decodes a volume message', () => {
    const b = new ProtoWriter()
      .message(50, new ProtoWriter().varint(6, 100).varint(7, 23).bool(8, false))
      .finish();
    expect(decodeRemote(b)).toEqual({ kind: 'volume', level: 23, max: 100, muted: false });
  });

  it('decodes a configure message with its device info', () => {
    const info = new ProtoWriter().string(1, 'X1').string(2, 'Sony');
    const b = new ProtoWriter()
      .message(1, new ProtoWriter().varint(1, 103).message(2, info))
      .finish();
    expect(decodeRemote(b)).toEqual({
      kind: 'configure',
      features: 103,
      model: 'X1',
      vendor: 'Sony',
    });
  });

  it('decodes an IME key inject with its app package', () => {
    const b = new ProtoWriter()
      .message(20, new ProtoWriter().message(1, new ProtoWriter().string(12, 'com.netflix.ninja')))
      .finish();
    expect(decodeRemote(b)).toEqual({ kind: 'imeKeyInject', appPackage: 'com.netflix.ninja' });
  });

  it('decodes an IME batch edit', () => {
    const b = new ProtoWriter().message(21, new ProtoWriter().varint(1, 4).varint(2, 9)).finish();
    expect(decodeRemote(b)).toEqual({ kind: 'imeBatchEdit', imeCounter: 4, fieldCounter: 9 });
  });

  it('decodes set-active and error', () => {
    expect(
      decodeRemote(new ProtoWriter().message(2, new ProtoWriter().varint(1, 1)).finish()),
    ).toEqual({ kind: 'setActive' });
    expect(decodeRemote(new ProtoWriter().message(3, new ProtoWriter()).finish())).toEqual({
      kind: 'error',
    });
  });

  it('an unknown RemoteMessage field decodes as other', () => {
    const b = new ProtoWriter().message(99, new ProtoWriter().varint(1, 1)).finish();
    expect(decodeRemote(b)).toEqual({ kind: 'other' });
  });
});
