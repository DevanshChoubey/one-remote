import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FoundTv, Link } from '@/core';
import { isTvLink, PairError, tvLinkOf } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Input, Row, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';

/**
 * Connection actions for a TV's Wi-Fi link (any brand): its address, finding it again after the address
 * changed, and pairing again. Renders nothing for any other device or link.
 */
export function TvLinkActions(props: { deviceId: string; link?: Link }): ReactElement | null {
  const { tv, tvBrands } = useServices();
  const device = useKnownDevice(props.deviceId);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Pairing again with a code brand: the TV shows a code and the person types it here.
  const [ask, setAsk] = useState<{ wrong: boolean } | null>(null);
  const [code, setCode] = useState('');
  const pending = useRef<((c: string | null) => void) | null>(null);
  // Leaving the screen answers a question the driver is still waiting on.
  useEffect(
    () => () => {
      pending.current?.(null);
      pending.current = null;
    },
    [],
  );
  const link: Link | undefined = props.link ?? (device ? tvLinkOf(device) : undefined);
  if (!device || device.kind !== 'tv' || !link || !isTvLink(link)) return null;

  const run = (job: () => Promise<string>): void => {
    setBusy(true);
    setNote(null);
    job().then(
      (msg) => {
        setBusy(false);
        setNote(msg);
      },
      (e: unknown) => {
        setBusy(false);
        setAsk(null);
        if (e instanceof PairError && e.code === 'cancelled') return;
        setNote(
          e instanceof PairError && e.code === 'denied'
            ? t('addTv.denied')
            : e instanceof PairError && e.code === 'timeout'
              ? t('addTv.timedOut')
              : t('addTv.unreachable'),
        );
      },
    );
  };

  const findAgain = (): void =>
    run(async () => {
      const host = await tv.findAgain(device);
      if (host === null) return t('addTv.notFound');
      return t('addTv.foundAt', { host });
    });

  const pairAgain = (): void =>
    run(async () => {
      const found: FoundTv = {
        kind: link.kind,
        host: link.host,
        name: device.name,
        secure: link.kind === 'webos' ? link.secure : true,
      };
      await tv.pair(
        found,
        {
          onAllow: () => setNote(t('addTv.pairAllow')),
          askCode: (wrong) =>
            new Promise<string | null>((resolve) => {
              pending.current?.(null);
              pending.current = resolve;
              setCode('');
              setAsk({ wrong });
            }),
        },
        link,
      );
      return t('addTv.paired');
    });

  const codeLength = tvBrands.find((b) => b.kind === link.kind)?.codeLength ?? 6;
  const answer = (value: string | null): void => {
    const resolve = pending.current;
    pending.current = null;
    setAsk(null);
    resolve?.(value);
  };

  return (
    <Column gap={2}>
      <Row justify="between" align="center">
        <Txt variant="caption" color="ink2">
          {t('addTv.address')}
        </Txt>
        <Txt variant="caption">{link.host}</Txt>
      </Row>
      <Row gap={2} wrap>
        <Button
          label={t('addTv.findAgain')}
          variant="secondary"
          onPress={findAgain}
          disabled={busy}
        />
        <Button
          label={t('addTv.pairAgain')}
          variant="secondary"
          onPress={pairAgain}
          disabled={busy}
        />
      </Row>
      {ask ? (
        <Column gap={2}>
          <Txt variant="caption" color="ink2">
            {t('addTv.codeTitle')}
          </Txt>
          <Input
            value={code}
            onChangeText={setCode}
            accessibilityLabel={t('addTv.codeTitle')}
            autoCapitalize="characters"
            maxLength={codeLength}
          />
          {ask.wrong ? (
            <Txt live variant="caption" color="danger">
              {t('addTv.codeWrong')}
            </Txt>
          ) : null}
          <Row gap={2} wrap>
            <Button
              label={t('addTv.codePair')}
              onPress={() => answer(code.toUpperCase())}
              disabled={code.length === 0}
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => answer(null)} />
          </Row>
        </Column>
      ) : null}
      {note ? (
        <Txt live variant="caption" color="ink2">
          {note}
        </Txt>
      ) : null}
    </Column>
  );
}
