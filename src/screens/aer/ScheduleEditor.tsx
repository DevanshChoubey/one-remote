import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { MAX_SCHEDULES } from '@/services';
import type { AerInterval, TimeOfDay } from '@/services';
import { Banner, Button, Chip, Column, ErrorLine, Row, Screen, Box, Txt, useToast } from '@/ui';
import { StepList } from '@/ui/add';
import { openTimePicker, TimeCard, TimePickerSheet } from '@/ui/aer';
import { formatTime } from './format';
import { useScheduleDraft, WEEKDAYS } from './useScheduleDraft';

export interface ScheduleEditorProps {
  deviceId: string;
  /** The entry on the dispenser's list to edit; none adds a new one. */
  index?: number;
}

const INTERVALS: readonly AerInterval[] = [10, 20, 40];

/** The mock's `.sect`: 13 px bold ink2, 4 px in. */
function Section(props: { label: string }): ReactElement {
  return (
    <Box px={1}>
      <Txt variant="captionBold" color="ink2">
        {props.label}
      </Txt>
    </Box>
  );
}

export function ScheduleEditor(props: ScheduleEditorProps): ReactElement {
  const router = useRouter();
  const toast = useToast();
  const { deviceId, index } = props;
  const valid = index === undefined || (Number.isInteger(index) && index >= 0);
  const d = useScheduleDraft(deviceId, valid ? index : undefined);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // The list was never read: read it, once, before anything can be saved over it.
  const asked = useRef(false);
  const { unknown, refresh } = d;
  useEffect(() => {
    if (unknown && !asked.current) {
      asked.current = true;
      void refresh();
    }
  }, [unknown, refresh]);

  const title = t(d.isNew ? 'aer.titleNew' : 'aer.titleEdit');
  const back = (): void => router.back();

  if (!valid || d.stale) {
    return (
      <Screen title={title} onBack={back}>
        <ErrorLine text={t('aer.probFailed')} />
      </Screen>
    );
  }
  if (d.unknown) {
    return (
      <Screen title={title} onBack={back}>
        {d.errorKey ? (
          <Column gap={3}>
            <Banner tone="error" text={t(d.errorKey)} />
            <Button label={t('aer.tryAgain')} onPress={() => void d.refresh()} />
          </Column>
        ) : (
          <Txt color="ink2">{t('aer.subConnecting')}</Txt>
        )}
      </Screen>
    );
  }

  const { draft, problems } = d;
  const has = (p: (typeof problems)[number]): boolean => problems.includes(p);
  const tooMany = has('tooMany');
  const endErr = has('endNotAfterStart');

  const pick = async (which: 'start' | 'end'): Promise<void> => {
    const current = which === 'start' ? draft.start : draft.end;
    const time: TimeOfDay | null = await openTimePicker(
      current,
      t(which === 'start' ? 'aer.start' : 'aer.end'),
    );
    if (!time || !alive.current) return;
    if (which === 'start') d.setStart(time);
    else d.setEnd(time);
  };

  const onSave = async (): Promise<void> => {
    setFailed(false);
    const outcome = await d.save();
    if (!alive.current) return;
    if (outcome === 'failed') {
      setFailed(true);
      return;
    }
    const end = d.lastRoundedEnd();
    toast.show(
      outcome === 'rounded' && end ? t('aer.rounded', { time: formatTime(end) }) : t('aer.saved'),
      { kind: 'ok' },
    );
    back();
  };

  const onDelete = async (): Promise<void> => {
    setDeleteFailed(false);
    setDeleting(true);
    const done = await d.remove();
    if (!alive.current) return;
    setDeleting(false);
    if (!done) {
      setDeleteFailed(true);
      return;
    }
    toast.show(t('aer.deleted'), { kind: 'ok' });
    back();
  };

  // Two plain steps while the save runs; after a failed read-back the second one fails.
  const stepsShown = (d.saving && !deleting) || failed;
  const kept = d.errorKey === 'aer.notKept';
  const steps = [
    { label: t('aer.stepSaving'), state: d.saving || kept ? ('done' as const) : ('fail' as const) },
    {
      label: t('aer.stepReading'),
      state: d.saving ? ('active' as const) : kept ? ('fail' as const) : ('idle' as const),
    },
  ];

  return (
    <Screen
      title={title}
      onBack={back}
      scroll
      footer={
        <Column gap={3}>
          {stepsShown ? <StepList steps={steps} /> : null}
          {failed && !d.saving && d.errorKey ? <ErrorLine text={t(d.errorKey)} /> : null}
          <Button
            label={failed && !d.saving ? t('aer.tryAgain') : t('aer.saveSchedule')}
            onPress={() => void onSave()}
            disabled={!d.canSave}
            loading={d.saving}
          />
        </Column>
      }
    >
      {tooMany ? (
        <Banner tone="error" icon="alert" text={t('aer.scheduleFull', { max: MAX_SCHEDULES })} />
      ) : null}

      <Row gap={3}>
        <Box flex={1}>
          <TimeCard
            label={t('aer.start')}
            time={draft.start}
            onPress={() => void pick('start')}
            testID="aer-start"
          />
        </Box>
        <Box flex={1}>
          <TimeCard
            label={t('aer.end')}
            time={draft.end}
            error={endErr}
            onPress={() => void pick('end')}
            testID="aer-end"
          />
        </Box>
      </Row>
      {endErr ? <ErrorLine text={t('aer.endBeforeStart')} /> : null}

      <Column gap={2}>
        <Section label={t('aer.days')} />
        <Row gap={2} wrap>
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              label={t(`aer.${day}`)}
              state={draft.days.includes(day) ? 'selected' : 'neutral'}
              onToggle={() => d.toggleDay(day)}
            />
          ))}
        </Row>
        {has('noDays') ? <ErrorLine text={t('aer.noDays')} /> : null}
      </Column>

      <Column gap={2}>
        <Section label={t('aer.sprayEvery')} />
        <Row gap={2} wrap>
          {INTERVALS.map((m) => (
            <Chip
              key={m}
              label={t('aer.intervalChip', { minutes: m })}
              state={draft.interval === m ? 'selected' : 'neutral'}
              onToggle={() => d.setInterval(m)}
            />
          ))}
        </Row>
      </Column>

      {has('noSprays') ? (
        <ErrorLine text={t('aer.tooShort')} />
      ) : has('tooManySprays') ? (
        <ErrorLine text={t('aer.tooManySprays')} />
      ) : endErr ? null : (
        <Box px={1}>
          <Txt weight="semibold">{t('aer.estimate', { count: d.sprays })}</Txt>
        </Box>
      )}

      {!d.isNew && (!d.saving || deleting) ? (
        confirming ? (
          <Column gap={3}>
            <Txt variant="heading">{t('aer.deleteTitle')}</Txt>
            <Txt color="ink2">{t('aer.deleteBody')}</Txt>
            {deleteFailed && d.errorKey ? <ErrorLine text={t(d.errorKey)} /> : null}
            <Button
              variant="danger"
              label={deleteFailed ? t('aer.tryAgain') : t('aer.yesDelete')}
              onPress={() => void onDelete()}
              loading={deleting}
            />
            <Button
              variant="secondary"
              label={t('aer.cancel')}
              disabled={deleting}
              onPress={() => {
                setConfirming(false);
                setDeleteFailed(false);
              }}
            />
          </Column>
        ) : (
          <Button
            variant="danger"
            icon="trash"
            label={t('aer.deleteSchedule')}
            onPress={() => setConfirming(true)}
          />
        )
      ) : null}
      <TimePickerSheet />
    </Screen>
  );
}
