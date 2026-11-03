import type { ReactElement } from 'react';
import { Box, Icon, Touchable, Txt } from '@/ui';
import type { IconName } from '@/ui';

export interface KeyButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** The key's diameter in px: 64 Back, 84 Home and the D-pad, 56 and 100 for the other keys. */
  size?: 64 | 84 | 56 | 100;
  tone?: 'surface' | 'accent';
  /** A text label drawn instead of the icon (the OK key). */
  text?: string;
}

/** One remote key: a round icon on a surface, spoken as `label`. */
export function KeyButton(props: KeyButtonProps): ReactElement {
  const size = props.size ?? 84;
  const accent = props.tone === 'accent';
  const ink = accent ? 'accentInk' : 'ink';
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.label}
      bg={accent ? 'accent' : 'surface'}
      border={accent ? 'accent' : 'line'}
      radius="pill"
      pressedBg={accent ? 'accentPressed' : 'surface2Pressed'}
    >
      <Box w={size} h={size} align="center" justify="center">
        {props.text ? (
          <Txt variant="heading" color={ink}>
            {props.text}
          </Txt>
        ) : (
          <Icon name={props.icon} size={size >= 84 ? 32 : 26} color={ink} />
        )}
      </Box>
    </Touchable>
  );
}
