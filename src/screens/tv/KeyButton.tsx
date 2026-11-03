import { useState } from 'react';
import type { ReactElement } from 'react';
import { Box, Icon, Touchable, Txt } from '@/ui';
import type { IconName } from '@/ui';
import { SentRing } from '@/ui/tv';

export interface KeyButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** The key's diameter in px: 64 Back, 84 Home and the D-pad, 56 and 100 for the other keys. */
  size?: 64 | 84 | 56 | 100;
  tone?: 'surface' | 'accent';
  /** A text label drawn instead of the icon (the OK key). */
  text?: string;
  /** No surface of its own: a D-pad arrow sitting on the ring. */
  flat?: boolean;
}

/** One remote key: a round icon on a surface, spoken as `label`. */
export function KeyButton(props: KeyButtonProps): ReactElement {
  const size = props.size ?? 84;
  const accent = props.tone === 'accent';
  const flat = props.flat === true && !accent;
  const ink = accent ? 'accentInk' : 'ink';
  const iconSize = flat ? 30 : size >= 84 ? 34 : 28;
  const [sent, setSent] = useState(0);
  const key = (
    <Touchable
      onPress={() => {
        props.onPress();
        setSent((n) => n + 1);
      }}
      accessibilityLabel={props.label}
      bg={accent ? 'accent' : flat ? undefined : 'surface'}
      border={accent ? 'accent' : flat ? undefined : 'line'}
      circle={size}
      pressedBg={accent ? 'accentPressed' : 'surface2'}
      pressScale={accent ? 0.94 : 0.92}
    >
      <Box w={size} h={size} align="center" justify="center">
        {props.text ? (
          <Txt variant="heading" color={ink}>
            {props.text}
          </Txt>
        ) : (
          <Icon name={props.icon} size={iconSize} color={ink} />
        )}
      </Box>
    </Touchable>
  );
  // The shadow needs a surface to sit on, so the card shadow goes on a wrapper behind the key.
  return flat || accent ? (
    key
  ) : (
    <Box bg="surface" circle={size} shadow="card" testID="tv-key-shadow">
      {key}
      <SentRing trigger={sent} />
    </Box>
  );
}
