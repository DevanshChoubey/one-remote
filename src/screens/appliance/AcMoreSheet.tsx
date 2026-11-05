import type { ReactElement } from 'react';
import { acSwingH, acSwingV } from '@/core';
import type { AcState, AcSwingH, AcSwingV, Capabilities } from '@/core';
import { t } from '@/i18n';
import { Box, Button, Chip, Column, Group, Row, SegmentedControl, Sheet, Toggle, Txt } from '@/ui';

type Strength = 'normal' | 'powerful' | 'quiet';
type SwingVKey = 'auto' | '1' | '2' | '3' | '4' | '5';

const SWING_V: readonly SwingVKey[] = ['auto', '1', '2', '3', '4', '5'];
const SWING_H: readonly AcSwingH[] = ['auto', 'fullLeft', 'left', 'middle', 'right', 'fullRight'];

/** The AC has something for the More sheet. */
export function hasAcExtras(caps: Capabilities): boolean {
  return (
    caps.powerful === true ||
    caps.quiet === true ||
    caps.swingV === true ||
    caps.swingH === true ||
    caps.ion === true
  );
}

/**
 * Mock `sheetAcMore`: Strength (Powerful and Quiet are one choice), Up and down, Left and right and
 * nanoe, each drawn only when the capabilities say so. Every change goes through `onChange`, which
 * sends the full state like the rest of the AC screen.
 */
export function AcMoreSheet(props: {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
  state: AcState;
  caps: Capabilities;
  onChange: (change: Partial<AcState>) => void;
}): ReactElement {
  const { state, caps, onChange } = props;
  const strengths: Strength[] = [
    'normal',
    ...(caps.powerful === true ? (['powerful'] as const) : []),
    ...(caps.quiet === true ? (['quiet'] as const) : []),
  ];
  const strength: Strength =
    state.powerful === true ? 'powerful' : state.quiet === true ? 'quiet' : 'normal';
  const setStrength = (v: Strength): void =>
    onChange(
      v === 'powerful'
        ? { powerful: true }
        : v === 'quiet'
          ? { quiet: true }
          : { powerful: false, quiet: false },
    );
  const swingV = String(acSwingV(state)) as SwingVKey;
  const swingH = acSwingH(state);

  return (
    <Sheet
      open={props.open}
      onClose={props.onClose}
      onClosed={props.onClosed}
      title={t('ac.moreTitle')}
      testID="ac-more"
      closeButton={false}
      footer={<Button label={t('common.done')} onPress={props.onClose} />}
    >
      {strengths.length > 1 ? (
        <Column gap={1}>
          <Section label={t('ac.strengthTitle')} />
          <SegmentedControl
            label={t('ac.strengthTitle')}
            options={strengths.map((v) => ({ value: v, label: t(`ac.strength.${v}`) }))}
            value={strength}
            onChange={setStrength}
          />
        </Column>
      ) : null}

      {caps.swingV === true ? (
        <Column gap={1}>
          <Section label={t('ac.swingVTitle')} />
          <SegmentedControl
            label={t('ac.swingVTitle')}
            options={SWING_V.map((v) => ({
              value: v,
              label: v === 'auto' ? t('ac.swingV.auto') : v,
            }))}
            value={swingV}
            onChange={(v) => onChange({ swingV: (v === 'auto' ? 'auto' : Number(v)) as AcSwingV })}
          />
          <Box px={1}>
            <Txt variant="caption" color="ink2">
              {t('ac.swingVHint')}
            </Txt>
          </Box>
        </Column>
      ) : null}

      {caps.swingH === true ? (
        <Column gap={1}>
          <Section label={t('ac.swingHTitle')} />
          <Row gap={2} wrap>
            {SWING_H.map((h) => (
              <Chip
                key={h}
                label={t(`ac.swingH.${h}`)}
                state={h === swingH ? 'selected' : 'neutral'}
                onToggle={() => onChange({ swingH: h })}
              />
            ))}
          </Row>
        </Column>
      ) : null}

      {caps.ion === true ? (
        <Group>
          <Box px={4} py={2} minH={56} justify="center">
            <Toggle
              label={t('ac.ion')}
              value={state.ion === true}
              onChange={(v) => onChange({ ion: v })}
            />
          </Box>
        </Group>
      ) : null}
    </Sheet>
  );
}

/** Mock `.sect`: 13 px bold ink2, 4 px in, 4 px above what it names. */
function Section(props: { label: string }): ReactElement {
  return (
    <Box px={1}>
      <Txt variant="captionBold" color="ink2">
        {props.label}
      </Txt>
    </Box>
  );
}
