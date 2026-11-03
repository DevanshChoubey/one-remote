import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { Device, FoundTv, Link, TvLink } from '@/core';
import { isTvLink, PairError, tvLinkOf } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Button, Column, Field, Group, ListItem, Row, Spinner, Txt } from '@/ui';
import { useKnownDevice } from '../device/useKnownDevice';
import { unreachableHintKey } from './wakeHint';

export interface TvLinkActionsProps {
  deviceId: string;
  link?: Link;
  /**
   * The sheet was opened to pair again (trust lost): "Pair again" is then a chevron row in the
   * "How it's connected" group (`TvPairAgainRow`), not a button here.
   */
  repair?: boolean;
  /** A press on that row: `pairAgain` runs the pairing here. */
  request?: { key: string; n: number } | null;
}

/**
 * Connection actions for a TV's Wi-Fi link (any brand): its address, finding it again after the address
 * changed, and pairing again. Renders nothing for any other device or link.
 */
export function TvLinkActions(props: TvLinkActionsProps): ReactElement | null {
  const device = useKnownDevice(props.deviceId);
  const link: Link | undefined = props.link ?? (device ? tvLinkOf(device) : undefined);
  if (!device || device.kind !== 'tv' || !link || !isTvLink(link)) return null;
  return <TvLinkBlock device={device} link={link} repair={props.repair} request={props.request} />;
}

/** Mock `sheetSettings({ repair })`: "Pair again" as a chevron row in the link group. */
export function TvPairAgainRow(props: { onPress: () => void }): ReactElement {
  return <ListItem title={t('addTv.pairAgain')} trailing="chevron" onPress={props.onPress} />;
}

function TvLinkBlock(props: {
  device: Device;
  link: TvLink;
  repair?: boolean;
  request?: { key: string; n: number } | null;
}): ReactElement {
  const { device, link } = props;
  const { tv, tvBrands } = useServices();
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
              : t(unreachableHintKey(link.kind)),
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
        // `secure` only means something to webos; the other brands ignore it.
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

  // A press on the group's "Pair again" row (a new request number) pairs here, once.
  const handled = useRef(props.request?.n);
  useEffect(() => {
    const r = props.request;
    if (!r || r.n === handled.current) return;
    handled.current = r.n;
    if (r.key === 'pairAgain' && !busy && ask === null) pairAgain();
  });

  return (
    <Column gap={2}>
      {/* Mock `tvLinkBlock`: the "TV address" section label, then the address row. */}
      <Group label={t('addTv.address')}>
        <ListItem
          title={t('addTv.address')}
          trailing={
            <Txt variant="caption" color="ink2">
              {link.host}
            </Txt>
          }
        />
      </Group>
      <Row gap={2} wrap>
        <Button
          label={t('addTv.findAgain')}
          size="small"
          variant="secondary"
          onPress={findAgain}
          disabled={busy || ask !== null}
        />
        {props.repair ? null : (
          <Button
            label={t('addTv.pairAgain')}
            size="small"
            variant="secondary"
            onPress={pairAgain}
            disabled={busy || ask !== null}
          />
        )}
      </Row>
      {ask ? (
        <Column gap={2}>
          <Field
            label={t('addTv.codeTitle')}
            plainLabel
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            maxLength={codeLength}
            error={ask.wrong ? t('addTv.codeWrong') : null}
          />
          <Row gap={2} wrap>
            <Button
              label={t('addTv.codePair')}
              size="small"
              onPress={() => answer(code.toUpperCase())}
              disabled={code.length === 0}
            />
            <Button
              label={t('common.cancel')}
              size="small"
              variant="ghost"
              onPress={() => answer(null)}
            />
          </Row>
        </Column>
      ) : null}
      {busy || note ? (
        <Row gap={2} align="center">
          {busy ? <Spinner size="xs" color="ink2" /> : null}
          {note ? (
            <Txt live variant="caption" color="ink2">
              {note}
            </Txt>
          ) : null}
        </Row>
      ) : null}
    </Column>
  );
}
