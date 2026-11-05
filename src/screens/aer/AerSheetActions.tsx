import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { refillPercent, useServices } from '@/services';
import {
  Box,
  Button,
  Column,
  ErrorLine,
  Group,
  Icon,
  Row,
  Spinner,
  Touchable,
  Txt,
  useToast,
} from '@/ui';
import type { IconName } from '@/ui';
import type { DeviceActionProps } from '../device/linkActions';
import { offsetLabel, problemCopy, zoneLabel } from './format';
import { useAerView } from './useAerView';

/** False once the component is gone, so a late result sets no state. */
function useAlive(): { current: boolean } {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}

interface AerRowProps {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress: () => void;
  busy?: boolean;
}

/** Mirrors ListItem (ListItem has no leading-icon prop). Mock `.li` with a leading icon: a 56 px row, icon, two lines, chevron (a spinner while busy). */
function AerRow(props: AerRowProps): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.title}
      disabled={props.busy}
      noDim
      busy={props.busy}
      pressedBg="surface2"
      pressScale={1}
    >
      <Row gap={3} align="center" px={4} py={2} minH={56}>
        <Icon name={props.icon} size={24} color="ink2" />
        <Box flex={1}>
          <Txt weight="semibold">{props.title}</Txt>
          {props.subtitle ? (
            <Txt variant="caption" color="ink2">
              {props.subtitle}
            </Txt>
          ) : null}
        </Box>
        {props.busy ? <Spinner /> : <Icon name="chev" size={22} color="ink2" />}
      </Row>
    </Touchable>
  );
}

/** Mock `sheetAer` "I refilled it": asks once; Yes resets, Cancel gives the sheet back. */
function RefillConfirm(props: { deviceId: string; back: () => void }): ReactElement {
  const { aer } = useServices();
  const toast = useToast();
  const alive = useAlive();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const yes = (): void => {
    setBusy(true);
    setProblem(null);
    aer.resetRefill(props.deviceId).then(
      () => {
        toast.show(t('aer.refillDone'), { kind: 'ok' });
        if (alive.current) props.back();
      },
      (e: unknown) => {
        if (!alive.current) return;
        setBusy(false);
        setProblem(problemCopy(e).line);
      },
    );
  };
  return (
    <Column gap={4}>
      <Txt variant="heading">{t('aer.refillTitle')}</Txt>
      <Txt color="ink2">{t('aer.refillBody')}</Txt>
      {problem ? <ErrorLine text={problem} /> : null}
      <Button label={t('aer.refillYes')} loading={busy} onPress={yes} />
      <Button label={t('common.cancel')} variant="secondary" disabled={busy} onPress={props.back} />
    </Column>
  );
}

function AerSheetRows(props: DeviceActionProps): ReactElement | null {
  const { device, takeOver } = props;
  const router = useRouter();
  const { aer } = useServices();
  const toast = useToast();
  const alive = useAlive();
  const view = useAerView(device.id);
  const [finding, setFinding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const link = device.links.find((l) => l.kind === 'aer');
  if (!link) return null;

  const find = (): void => {
    setFinding(true);
    setProblem(null);
    aer.blink(device.id).then(
      () => {
        if (alive.current) setFinding(false);
        toast.show(t('aer.blinkToast'));
      },
      (e: unknown) => {
        if (!alive.current) return;
        setFinding(false);
        setProblem(problemCopy(e).line);
      },
    );
  };

  return (
    <Column gap={2}>
      <Group>
        <AerRow
          icon="drop"
          title={t('aer.refilled')}
          subtitle={
            view.status
              ? t('aer.refilledSub', { refill: refillPercent(view.status.spraysSinceRefill) })
              : undefined
          }
          onPress={() =>
            takeOver(<RefillConfirm deviceId={device.id} back={() => takeOver(null)} />)
          }
        />
        <AerRow
          icon="bulb"
          title={t('aer.findIt')}
          subtitle={t('aer.findSub')}
          busy={finding}
          onPress={find}
        />
        <AerRow
          icon="globe"
          title={t('aer.zoneRow')}
          subtitle={t('aer.zoneSub', {
            zone: zoneLabel(link.timeZone),
            offset: offsetLabel(link.timeZone, new Date()),
          })}
          onPress={() => router.push(`/aer/zone/${device.id}`)}
        />
      </Group>
      {problem ? <ErrorLine text={problem} /> : null}
    </Column>
  );
}

/** The entry for `DEVICE_ACTIONS`: the air freshener's rows, null for any other device. */
export function aerSheetAction(props: DeviceActionProps): ReactElement | null {
  return props.device.kind === 'aer' ? <AerSheetRows {...props} /> : null;
}
