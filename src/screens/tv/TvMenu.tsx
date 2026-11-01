import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Box, Column, Touchable, Txt } from '@/ui';

export type Pad = 'touchpad' | 'dpad';

function Item(props: { label: string; onPress: () => void; current?: boolean }): ReactElement {
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      {...(props.current === undefined ? {} : { selected: props.current })}
    >
      <Box px={4} py={2}>
        <Txt color={props.current ? 'ink2' : 'ink'}>{props.label}</Txt>
      </Box>
    </Touchable>
  );
}

/** The ⋮ menu, a dropdown under the bar: the pad style (the current one dimmed) and the TV's
 *  inputs while the TV is live, and always the device settings. Every pick is reported once; the
 *  screen closes the menu. */
export function TvMenu(props: {
  /** Pad and input items show only while the TV is live. */
  live: boolean;
  pad: Pad;
  onPad: (pad: Pad) => void;
  onInput: () => void;
  onSettings: () => void;
}): ReactElement {
  return (
    <Box
      float={{ top: 52, right: 0 }}
      bg="surface"
      border="line"
      radius="sm"
      shadow="card"
      testID="tv-menu"
    >
      <Column>
        {props.live ? (
          <>
            <Item
              label={t('tv.touchpad')}
              current={props.pad === 'touchpad'}
              onPress={() => props.onPad('touchpad')}
            />
            <Item
              label={t('tv.dpad')}
              current={props.pad === 'dpad'}
              onPress={() => props.onPad('dpad')}
            />
            <Item label={t('tv.input')} onPress={props.onInput} />
          </>
        ) : null}
        <Item label={t('device.open')} onPress={props.onSettings} />
      </Column>
    </Box>
  );
}
