import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { DeviceError } from '@/core';
import type { GreeUnit, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import {
  Box,
  Button,
  Card,
  Column,
  ErrorLine,
  Icon,
  Rise,
  Row,
  Screen,
  Spinner,
  Tile,
  Touchable,
  Txt,
} from '@/ui';
import { Radar } from '@/ui/addtv';

export interface GreeStepProps {
  /** The unit handed over its key: the link to save. */
  onDone(link: Extract<Link, { kind: 'gree' }>): void;
  /** Not on Wi-Fi, or not found: carry on with IR. */
  onSkip(): void;
  onBack(): void;
}

type Phase =
  | { name: 'searching' }
  | { name: 'found'; units: GreeUnit[]; binding?: string; error?: string }
  | { name: 'none'; offWifi: boolean };

/** Scans the home Wi-Fi for Gree units, lists them, and binds the one picked. Nothing leaves the LAN. */
export function GreeStep(props: GreeStepProps): ReactElement {
  const { gree } = useServices();
  const [phase, setPhase] = useState<Phase>({ name: 'searching' });
  const run = useRef(0);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  /** Starts a scan; the phase is 'searching' already (first render, or set by `search`). */
  const scan = (): void => {
    const mine = ++run.current;
    gree.scan().then(
      (units) => {
        if (!alive.current || mine !== run.current) return;
        setPhase(units.length > 0 ? { name: 'found', units } : { name: 'none', offWifi: false });
      },
      (e: unknown) => {
        if (!alive.current || mine !== run.current) return;
        setPhase({ name: 'none', offWifi: e instanceof DeviceError && e.code === 'notSent' });
      },
    );
  };
  const search = (): void => {
    setPhase({ name: 'searching' });
    scan();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(scan, []);

  const pick = (unit: GreeUnit, units: GreeUnit[]): void => {
    const mine = ++run.current;
    setPhase({ name: 'found', units, binding: unit.mac });
    gree.bind(unit).then(
      (link) => {
        if (alive.current && mine === run.current) props.onDone(link);
      },
      () => {
        if (!alive.current || mine !== run.current) return;
        setPhase({ name: 'found', units, error: t('gree.bindFailed') });
      },
    );
  };

  const searching = phase.name === 'searching';
  return (
    <Screen
      title={t('gree.findTitle')}
      subtitle={t('gree.findSub')}
      largeTitle
      onBack={props.onBack}
      scroll
      footer={
        <Column gap={3}>
          {searching ? (
            <Row gap={2} align="center" justify="center">
              <Spinner size="xs" color="ink2" />
              <Txt variant="caption" color="ink2" live>
                {t('gree.stillLooking')}
              </Txt>
            </Row>
          ) : (
            <Button label={t('gree.searchAgain')} variant="secondary" onPress={search} />
          )}
          <Button label={t('gree.useIr')} variant="ghost" onPress={props.onSkip} />
        </Column>
      }
    >
      <Box align="center" py={2}>
        <Radar searching={searching} />
      </Box>
      {phase.name === 'found' ? (
        <Column gap={2}>
          {phase.units.map((u) => {
            const name = u.name.trim() || t('gree.unitName');
            const busy = phase.binding === u.mac;
            return (
              <Rise key={u.mac}>
                <Touchable
                  onPress={() => {
                    if (phase.binding === undefined) pick(u, phase.units);
                  }}
                  accessibilityLabel={`${name}, ${u.host}`}
                  pressScale={0.985}
                  radius="md"
                >
                  <Card row>
                    <Tile icon="ac" />
                    <Box flex={1}>
                      <Column gap={1}>
                        <Txt variant="bodyBold">{name}</Txt>
                        <Txt variant="caption" color="ink2">
                          {busy ? t('gree.connecting') : u.host}
                        </Txt>
                      </Column>
                    </Box>
                    {busy ? (
                      <Spinner size="xs" color="ink2" />
                    ) : (
                      <Icon name="chev" size={22} color="ink2" />
                    )}
                  </Card>
                </Touchable>
              </Rise>
            );
          })}
          {phase.error ? <ErrorLine text={phase.error} /> : null}
        </Column>
      ) : (
        <Txt color="ink2" align="center" live={phase.name === 'none'}>
          {phase.name === 'none'
            ? t(phase.offWifi ? 'gree.offWifi' : 'gree.none')
            : t('gree.findBody')}
        </Txt>
      )}
    </Screen>
  );
}
