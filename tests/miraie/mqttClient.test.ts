import { MqttError, mqttConnect } from '@/miraie/mqtt/client';
import { createFakeCloud } from '@/miraie/testing/fakeCloud';

const opts = {
  clientId: 'one',
  username: 'home1',
  password: 'tok',
  keepAliveS: 60,
  timeoutMs: 1000,
};

async function connect(cloud = createFakeCloud()) {
  const stream = await cloud.net.openTls('mqtt.miraie.in', 8883, 1000);
  const conn = await mqttConnect({ ...opts, stream });
  return { cloud, conn };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe('mqtt client', () => {
  it('connects with the home id and token, subscribes, receives and publishes', async () => {
    const { cloud, conn } = await connect();
    expect(cloud.broker.connects[0]).toMatchObject({
      username: 'home1',
      password: 'tok',
      clean: true,
    });
    await conn.subscribe(['u/h/d/status'], 1);
    expect(cloud.broker.subscriptions).toEqual(['u/h/d/status']);

    const got: [string, string][] = [];
    conn.onMessage((t, m) => got.push([t, m]));
    cloud.broker.send('u/h/d/status', '{"ps":"on"}');
    cloud.broker.send('u/h/other/status', '{"ps":"off"}');
    await flush();
    expect(got).toEqual([['u/h/d/status', '{"ps":"on"}']]);

    conn.publish('u/h/d/control', '{"ps":"off"}');
    expect(cloud.broker.published).toEqual([{ topic: 'u/h/d/control', text: '{"ps":"off"}' }]);
    conn.close();
    expect(conn.open).toBe(false);
    expect(() => conn.publish('u/h/d/control', '{}')).toThrow(MqttError);
  });

  it('rejects auth when the broker refuses the token, and closes the stream', async () => {
    const cloud = createFakeCloud();
    cloud.broker.accept = (_u, p) => p === 'fresh';
    const stream = await cloud.net.openTls('mqtt.miraie.in', 8883, 1000);
    const closeSpy = jest.spyOn(stream, 'close');
    await expect(mqttConnect({ ...opts, stream })).rejects.toMatchObject({
      code: 'auth',
      returnCode: 5,
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('times out when the broker never answers CONNECT', async () => {
    jest.useFakeTimers();
    try {
      const cloud = createFakeCloud();
      cloud.broker.silent = true;
      const stream = await cloud.net.openTls('mqtt.miraie.in', 8883, 1000);
      const p = mqttConnect({ ...opts, stream });
      jest.advanceTimersByTime(1000);
      await expect(p).rejects.toMatchObject({ code: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('tells its listener once when the broker drops the session', async () => {
    const { cloud, conn } = await connect();
    const closed = jest.fn();
    conn.onClose(closed);
    cloud.broker.dropAll();
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toMatchObject({ code: 'closed' });
    expect(conn.open).toBe(false);
  });

  it('pings at three quarters of the keep-alive and gives up when a ping goes unanswered', async () => {
    jest.useFakeTimers();
    try {
      const { cloud, conn } = await connect();
      const closed = jest.fn();
      conn.onClose(closed);
      jest.advanceTimersByTime(45_000);
      await flush();
      jest.advanceTimersByTime(45_000);
      await flush();
      expect(closed).not.toHaveBeenCalled();
      cloud.broker.answerPings = false;
      jest.advanceTimersByTime(45_000);
      await flush();
      expect(closed).not.toHaveBeenCalled();
      jest.advanceTimersByTime(45_000);
      await flush();
      expect(closed.mock.calls[0][0]).toMatchObject({ code: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('closes on bytes that are not MQTT', async () => {
    const cloud = createFakeCloud();
    const stream = await cloud.net.openTls('mqtt.miraie.in', 8883, 1000);
    let feed: ((b: Uint8Array) => void) | undefined;
    const realOnData = stream.onData.bind(stream);
    stream.onData = (cb) => {
      feed = cb;
      realOnData(cb);
    };
    const conn = await mqttConnect({ ...opts, stream });
    const closed = jest.fn();
    conn.onClose(closed);
    feed?.(Uint8Array.from([0xf0, 0x00]));
    expect(closed.mock.calls[0][0]).toMatchObject({ code: 'protocol' });
  });

  it('rejects a refused subscription', async () => {
    const cloud = createFakeCloud();
    const stream = await cloud.net.openTls('mqtt.miraie.in', 8883, 1000);
    let feed: ((b: Uint8Array) => void) | undefined;
    const realOnData = stream.onData.bind(stream);
    stream.onData = (cb) => {
      feed = cb;
      realOnData(() => undefined);
    };
    const realWrite = stream.write.bind(stream);
    stream.write = (b) => {
      realWrite(b);
      // CONNECT → CONNACK 0; SUBSCRIBE id 1 → SUBACK 0x80.
      if (b[0] === 0x10)
        void Promise.resolve().then(() => feed?.(Uint8Array.from([0x20, 2, 0, 0])));
      if (b[0] === 0x82)
        void Promise.resolve().then(() => feed?.(Uint8Array.from([0x90, 3, 0, 1, 0x80])));
    };
    const conn = await mqttConnect({ ...opts, stream });
    await expect(conn.subscribe(['x'], 1)).rejects.toMatchObject({ code: 'refused' });
  });
});
