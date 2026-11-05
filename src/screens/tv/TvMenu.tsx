import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Menu } from '@/ui';
import type { MenuItem } from '@/ui';

export type Pad = 'touchpad' | 'dpad';

/** The ⋮ menu: the pad style (the one in use marked) and the TV's inputs while the TV is live, and
 *  always the device settings. Every pick is reported once; the screen closes the menu. */
export function TvMenu(props: {
  open: boolean;
  onClose: () => void;
  onClosed?: () => void;
  /** Pad and input items show only while the TV is live. */
  live: boolean;
  pad: Pad;
  onPad: (pad: Pad) => void;
  onInput: () => void;
  onSettings: () => void;
}): ReactElement {
  const items: MenuItem[] = props.live
    ? [
        {
          key: 'touchpad',
          label: t('tv.touchpad'),
          current: props.pad === 'touchpad',
          onPress: () => props.onPad('touchpad'),
        },
        {
          key: 'dpad',
          label: t('tv.dpad'),
          current: props.pad === 'dpad',
          onPress: () => props.onPad('dpad'),
        },
        { key: 'input', label: t('tv.input'), onPress: props.onInput },
        {
          key: 'settings',
          label: t('device.open'),
          onPress: props.onSettings,
          dividerBefore: true,
        },
      ]
    : [{ key: 'settings', label: t('device.open'), onPress: props.onSettings }];
  return (
    <Menu
      open={props.open}
      onClose={props.onClose}
      {...(props.onClosed ? { onClosed: props.onClosed } : {})}
      items={items}
      testID="tv-menu"
    />
  );
}
