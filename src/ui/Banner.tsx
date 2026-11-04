import type { ReactElement } from 'react';
import type { ColorToken } from '@/theme';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Box, Column, Row, Touchable, Txt } from './primitives';

export interface BannerProps {
  text: string;
  tone?: 'info' | 'ok' | 'error';
  icon?: IconName;
  testID?: string;
  /** A link-style button under the text ("Pair again"). */
  action?: { label: string; onPress: () => void };
}

/** Mock `.banner`: 14 px at line height 1.4; the 20 px icon sits 1 px down. */
const LINE = 1.4;
const ICON_DROP = 1;

const LOOK: Record<NonNullable<BannerProps['tone']>, { bg: ColorToken; icon: IconName }> = {
  info: { bg: 'warmSoft', icon: 'info' },
  ok: { bg: 'okSoft', icon: 'check' },
  error: { bg: 'dangerSoft', icon: 'alert' },
};

export function Banner(props: BannerProps): ReactElement {
  const look = LOOK[props.tone ?? 'info'];
  return (
    <Box
      bg={look.bg}
      radius="md"
      px={4}
      py={3}
      testID={props.testID}
      accessibilityLiveRegion={props.tone === 'error' ? 'polite' : undefined}
    >
      <Row gap={3} align="start">
        <Box h={20 + ICON_DROP} justify="end">
          <Icon name={props.icon ?? look.icon} size={20} color="ink" />
        </Box>
        <Box flex={1}>
          <Column gap={1}>
            <Txt size="banner" lineHeight={LINE}>
              {props.text}
            </Txt>
            {props.action ? (
              <Touchable
                onPress={props.action.onPress}
                accessibilityLabel={props.action.label}
                accessibilityRole="button"
                radius="pill"
                alignSelf="flex-start"
              >
                <Row align="center" minH={48}>
                  <Txt variant="label" color="accent">
                    {props.action.label}
                  </Txt>
                </Row>
              </Touchable>
            ) : null}
          </Column>
        </Box>
      </Row>
    </Box>
  );
}
