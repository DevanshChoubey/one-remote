import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ScrollView } from 'react-native';
import type { Command, Device, FoundTv, TvKey } from '@/core';
import { Button, Column, Input, Row, Screen, Txt } from '@/ui';
import { useServices } from '@/services';

const DEVICE_ID = 'spike-tv';
const ROOM_ID = 'spike-room';
const MAX_LOG = 200;

/** Module-level so render-purity linting does not see clock reads in event handlers. */
function now(): number {
  return Date.now();
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function TvSpike(): ReactElement {
  const { tv, hub, store, removeDevice } = useServices();
  const [log, setLog] = useState<string[]>([]);
  const [hits, setHits] = useState<string[]>([]);
  const [text, setText] = useState('hello');
  const [burst, setBurst] = useState('');
  const found = useRef<FoundTv[]>([]);
  const t0 = useRef(0);

  const add = (line: string): void =>
    setLog((l) => [...l.slice(-(MAX_LOG - 1)), `${stamp()} ${line}`]);

  useEffect(() => {
    const stop = tv.onFrame?.((f) =>
      add(`${f.dir === 'in' ? '<-' : f.dir === 'out' ? '->' : '**'} ${f.text}`),
    );
    return () => stop?.();
  }, [tv]);

  const send = async (cmd: Command): Promise<number> => {
    const at = now();
    try {
      const r = await hub.send(DEVICE_ID, cmd);
      add(`send ${JSON.stringify(cmd)} ok via ${r.via} in ${now() - at} ms`);
    } catch (e) {
      add(`send ${JSON.stringify(cmd)} FAILED: ${String(e)}`);
    }
    return now() - at;
  };
  const key = (k: TvKey) => (): void => void send({ kind: 'tv.key', key: k });

  const discover = (): void => {
    found.current = [];
    setHits([]);
    t0.current = now();
    add('discover started');
    const stop = tv.discover((hit) => {
      found.current = [...found.current.filter((f) => f.host !== hit.host), hit];
      const line = `+${now() - t0.current} ms ${hit.host} ${hit.name} ${hit.secure ? 'wss:3001' : 'ws:3000'} usn=${hit.usn ?? '-'}`;
      setHits((h) => [...h, line]);
      add(`found ${line}`);
    });
    setTimeout(() => {
      stop();
      add('discover stopped after 15 s');
    }, 15000);
  };

  const pair = async (): Promise<void> => {
    const hit = found.current[found.current.length - 1];
    if (!hit) return add('pair: discover first');
    add(`pairing with ${hit.host}; accept the prompt on the TV`);
    try {
      const paired = await tv.pair(hit, {
        onAllow: () => add('prompt is showing on the TV'),
        askCode: () => Promise.resolve(null),
      });
      const device: Device = {
        id: DEVICE_ID,
        kind: 'tv',
        name: paired.suggestedName,
        roomId: ROOM_ID,
        order: 0,
        links: [paired.link],
      };
      await store.upsertRoom({ id: ROOM_ID, name: 'Spike', order: 0 });
      await store.upsertDevice(device);
      add(`paired: ${JSON.stringify(paired.link)}`);
    } catch (e) {
      add(`pair FAILED: ${String(e)}`);
    }
  };

  const touchpadBurst = async (): Promise<void> => {
    const at = now();
    let failed = 0;
    for (let i = 0; i < 100; i++) {
      try {
        await hub.send(DEVICE_ID, { kind: 'tv.key', key: i % 2 === 0 ? 'right' : 'left' });
      } catch {
        failed++;
      }
    }
    const line = `burst: 100 presses in ${now() - at} ms, ${failed} failed`;
    setBurst(line);
    add(line);
  };

  const forget = async (): Promise<void> => {
    await removeDevice(DEVICE_ID);
    add('spike TV removed');
  };

  const keys: TvKey[] = [
    'up',
    'down',
    'left',
    'right',
    'ok',
    'back',
    'home',
    'volumeUp',
    'volumeDown',
    'mute',
  ];

  return (
    <Screen title="TV spike" scroll>
      <Column gap={3}>
        <Button label="Discover" onPress={discover} />
        {hits.map((h) => (
          <Txt key={h} variant="caption" selectable>
            {h}
          </Txt>
        ))}
        <Button label="Pair with last hit" onPress={() => void pair()} />
        <Row gap={2}>
          {keys.map((k) => (
            <Button key={k} label={k} variant="secondary" onPress={key(k)} />
          ))}
        </Row>
        <Button label="Touchpad burst (100)" onPress={() => void touchpadBurst()} />
        {burst ? <Txt>{burst}</Txt> : null}
        <Input value={text} onChangeText={setText} accessibilityLabel="Text to send" />
        <Button label="Send text" onPress={() => void send({ kind: 'tv.text', text })} />
        <Button label="Input" variant="secondary" onPress={key('input')} />
        <Button label="Play/Pause" variant="secondary" onPress={key('playPause')} />
        <Button
          label="WoL (power on)"
          variant="secondary"
          onPress={() => void send({ kind: 'tv.powerOn' })}
        />
        <Button label="Remove spike TV" variant="ghost" onPress={() => void forget()} />
        <Txt variant="heading">SSAP log</Txt>
        <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
          {log.map((l, i) => (
            <Txt key={i} variant="caption" selectable>
              {l}
            </Txt>
          ))}
        </ScrollView>
      </Column>
    </Screen>
  );
}

export default function TvSpikeRoute(): ReactElement {
  if (!__DEV__) return <Redirect href="/" />;
  return <TvSpike />;
}
