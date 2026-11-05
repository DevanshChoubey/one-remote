import {
  MqttProtocolError,
  PacketReader,
  encodeConnack,
  encodeConnect,
  encodeDisconnect,
  encodePingreq,
  encodePuback,
  encodePublish,
  encodeSubscribe,
  encodeSuback,
  utf8Decode,
  utf8Encode,
} from '@/miraie/mqtt/codec';

const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');

describe('mqtt codec', () => {
  it('encodes CONNECT as MQTT 3.1.1 with clean session, username and password', () => {
    const b = encodeConnect({ clientId: 'c', username: 'u', password: 'p', keepAlive: 60 });
    // 10 = CONNECT, 0x13 bytes; "MQTT", level 4, flags c2, keepalive 60, then the three strings.
    expect(hex(b)).toBe(
      '1013' + '00044d515454' + '04' + 'c2' + '003c' + '000163' + '000175' + '000170',
    );
  });

  it('round-trips every packet the client and the fake broker use', () => {
    const r = new PacketReader();
    const bytes = [
      encodeConnect({ clientId: 'id', username: 'home', password: 'tok', keepAlive: 30 }),
      encodeConnack(false, 0),
      encodeSubscribe(7, [{ topic: 'a/+/#', qos: 1 }]),
      encodeSuback(7, [1]),
      encodePublish({ topic: 'a/b', payload: '{"ps":"on"}' }),
      encodePublish({ topic: 'a/b', payload: 'x', qos: 1, packetId: 9, retain: true }),
      encodePuback(9),
      encodePingreq(),
      encodeDisconnect(),
    ];
    const all = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of bytes) {
      all.set(b, at);
      at += b.length;
    }
    const packets = r.push(all);
    expect(packets.map((p) => p.type)).toEqual([
      'connect',
      'connack',
      'subscribe',
      'suback',
      'publish',
      'publish',
      'puback',
      'pingreq',
      'disconnect',
    ]);
    expect(packets[0]).toMatchObject({
      clientId: 'id',
      username: 'home',
      password: 'tok',
      keepAlive: 30,
      clean: true,
      protocolLevel: 4,
    });
    expect(packets[2]).toEqual({
      type: 'subscribe',
      packetId: 7,
      topics: [{ topic: 'a/+/#', qos: 1 }],
    });
    const pub = packets[4];
    expect(pub?.type === 'publish' && utf8Decode(pub.payload)).toBe('{"ps":"on"}');
    expect(packets[5]).toMatchObject({ qos: 1, packetId: 9, retain: true });
  });

  it('waits for the rest of a packet split across chunks, byte by byte', () => {
    const b = encodePublish({ topic: 't', payload: 'y'.repeat(300) });
    const r = new PacketReader();
    const out = [];
    for (const x of b) out.push(...r.push(Uint8Array.from([x])));
    expect(out).toHaveLength(1);
    const p = out[0];
    expect(p?.type === 'publish' && p.payload.length).toBe(300);
  });

  it('uses a multi-byte remaining length above 127', () => {
    const b = encodePublish({ topic: 't', payload: 'z'.repeat(200) });
    // 3 + 200 = 203 = 0xcb → 0xcb 0x01
    expect(hex(b.slice(0, 3))).toBe('30cb01');
  });

  it('refuses a wildcard topic name, an empty topic and a bad packet id', () => {
    expect(() => encodePublish({ topic: 'a/#', payload: '' })).toThrow(MqttProtocolError);
    expect(() => encodePublish({ topic: '', payload: '' })).toThrow(MqttProtocolError);
    expect(() => encodeSubscribe(0, [{ topic: 'a', qos: 0 }])).toThrow(MqttProtocolError);
    expect(() => encodeSubscribe(1, [])).toThrow(MqttProtocolError);
  });

  it('refuses an oversized or malformed packet', () => {
    expect(() => new PacketReader().push(Uint8Array.from([0x30, 0xff, 0xff, 0xff, 0x7f]))).toThrow(
      MqttProtocolError,
    );
    expect(() =>
      new PacketReader().push(Uint8Array.from([0x30, 0xff, 0xff, 0xff, 0xff, 1])),
    ).toThrow(MqttProtocolError);
    // PUBLISH whose topic length runs past the end.
    expect(() => new PacketReader().push(Uint8Array.from([0x30, 2, 0, 9]))).toThrow(
      MqttProtocolError,
    );
    // QoS 2 is not spoken.
    expect(() => new PacketReader().push(Uint8Array.from([0x34, 5, 0, 1, 0x61, 0, 1]))).toThrow(
      MqttProtocolError,
    );
  });

  it('encodes and decodes UTF-8, replacing bad bytes', () => {
    for (const s of ['plain', 'Café 24°', 'रसोई', '🙂 ok']) {
      expect(utf8Decode(utf8Encode(s))).toBe(s);
      expect(Buffer.from(utf8Encode(s)).toString('utf8')).toBe(s);
    }
    expect(utf8Decode(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b');
    expect(utf8Decode(Uint8Array.from([0xc3]))).toBe('�');
  });
});
