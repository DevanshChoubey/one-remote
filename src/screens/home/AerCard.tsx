import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { useMotion, useTheme } from '@/theme';
import {
  AnimatedBox,
  Box,
  IconButton,
  Rise,
  Row,
  Spacer,
  Tile,
  Touchable,
  Txt,
  useToast,
} from '@/ui';
import { mixColor } from '@/ui/primitives/Touchable';
import { SentRing } from '@/ui/tv/SentRing';
import { cardLine } from '@/screens/aer/cardLine';
import { problemCopy } from '@/screens/aer/format';
import { isFlat, levels } from '@/screens/aer/screenState';
import { useAerView } from '@/screens/aer/useAerView';
import type { HomeCard } from './useHome';

export interface AerCardProps {
  card: HomeCard;
  /** Position on Home, for the staggered rise. */
  index?: number;
  onOpen: (id: string) => void;
  onSettings: (id: string) => void;
}

/** The mock's `.card:has(.opn:active)`: the whole card scales and darkens one step. */
const PRESS_SCALE = 0.985;
const FALLBACK_ZONE = 'UTC';

export function AerCard(props: AerCardProps): ReactElement {
  const theme = useTheme();
  const motion = useMotion();
  const toast = useToast();
  const { aer } = useServices();
  const { device } = props.card.view;
  const view = useAerView(device.id);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const link = device.links.find((l) => l.kind === 'aer');
  const zone = link?.kind === 'aer' ? link.timeZone : FALLBACK_ZONE;
  const line = cardLine(view, zone, new Date());
  const lv = levels(view);
  const levelsLine = lv ? t('aer.levels', { battery: lv.battery, refill: lv.refill }) : '';
  const flat = isFlat(view);

  const spray = (): void => {
    if (busy) return;
    setBusy(true);
    aer.sprayNow(device.id).then(
      () => {
        if (!alive.current) return;
        setBusy(false);
        setSent((n) => n + 1);
        toast.show(t('aer.sprayed'), { kind: 'ok' });
      },
      (e: unknown) => {
        if (!alive.current) return;
        setBusy(false);
        toast.show(problemCopy(e).line, { kind: 'error' });
      },
    );
  };

  const press = useSharedValue(0);
  const target = motion.reduced ? 1 : PRESS_SCALE;
  const rest = theme.color.surface;
  const held = theme.color.surface2;
  const pressed = useAnimatedStyle(
    () => ({
      backgroundColor: mixColor(press.value, rest, held),
      transform: [{ scale: 1 + (target - 1) * press.value }],
    }),
    [rest, held, target],
  );

  const label = [device.name, line.text, levelsLine].filter(Boolean).join(', ');
  return (
    <Rise index={props.index}>
      <AnimatedBox
        bg="surface"
        border="line"
        radius="md"
        shadow="card"
        direction="row"
        align="stretch"
        minH={76}
        animatedStyle={pressed}
        testID={`device-card-${device.id}`}
      >
        <Touchable
          onPress={() => props.onOpen(device.id)}
          onLongPress={() => props.onSettings(device.id)}
          onPressIn={() => {
            press.set(withTiming(1, motion.timing('instant')));
          }}
          onPressOut={() => {
            press.set(withTiming(0, motion.timing('fast', 'spring')));
          }}
          pressScale={1}
          radius="md"
          flex={1}
          accessibilityHint={t('home.longPressHint')}
          accessibilityLabel={label}
          testID={`device-open-${device.id}`}
        >
          <Box py={4} px={4}>
            <Row gap={3} align="center">
              <Tile icon="aer" tone="ink" />
              <Box flex={1}>
                <Txt variant="bodyBold">{device.name}</Txt>
                <Txt
                  variant={line.tone === 'bad' ? 'captionBold' : 'caption'}
                  color={line.tone === 'bad' ? 'dangerInk' : line.tone === 'warn' ? 'ink' : 'ink2'}
                >
                  {line.text}
                </Txt>
                {levelsLine ? (
                  <Txt variant="caption" color="ink2" tabular>
                    {levelsLine}
                  </Txt>
                ) : null}
              </Box>
            </Row>
          </Box>
        </Touchable>
        <Row align="center">
          <Spacer size={1} />
          <Box>
            <IconButton
              icon="spray"
              tone="accent"
              label={t('aer.sprayLabel', { name: device.name })}
              onPress={spray}
              busy={busy}
              disabled={flat}
              testID={`aer-spray-${device.id}`}
            />
            <SentRing trigger={sent} />
          </Box>
          <Spacer size={3} />
        </Row>
      </AnimatedBox>
    </Rise>
  );
}
