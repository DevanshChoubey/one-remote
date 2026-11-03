import type { ReactElement } from 'react';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Icon } from '../Icon';
import { StatusDot } from '../StatusDot';
import { Row, Touchable, Txt } from '../primitives';

export type StatusKind = 'connected' | 'irOnly' | 'fellBack' | 'needsIr';

export interface LinkLineProps {
  kind: StatusKind;
  text: string;
  /** Opens the device settings. Tapping works for every kind so the sheet is always reachable. */
  onPress?: () => void;
}

/** Mock `.linkline` (and `.linkline.fell`) padding. */
const PAD = { x: 8, y: 0 };
const FELL_PAD = { x: 14, y: 8 };

/**
 * The line under an AC or fan remote: how the last press went out. Mock `.linkline.btnlike`: full
 * width, 14 px, centred; the part after the last "· " ("how it's connected") is underlined.
 */
export function LinkLine(props: LinkLineProps): ReactElement {
  const theme = useTheme();
  const fell = props.kind === 'fellBack';
  const connected = props.kind === 'connected';
  const dot = props.text.lastIndexOf('· ');
  const link = props.onPress !== undefined && dot >= 0;
  const color = fell ? 'ink' : 'ink2';
  const pad = fell ? FELL_PAD : PAD;
  const body = (
    <Animated.View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.space(2),
        minHeight: theme.touch.min,
        paddingHorizontal: pad.x,
        paddingVertical: pad.y,
        borderRadius: theme.radius.tile,
        backgroundColor: fell ? theme.color.warmSoft : undefined,
      }}
      testID="link-line"
    >
      {connected ? <StatusDot tone="ok" /> : <Icon name="ir" size={18} color={color} />}
      {/* Shrinks to wrap, but never pushes the icon away from the centred text. */}
      <Animated.View style={{ flexShrink: 1 }}>
        <Txt size="banner" color={color} align="center" live={fell}>
          {link ? props.text.slice(0, dot + 2) : props.text}
          {link ? (
            <Txt size="banner" color={color} underline>
              {props.text.slice(dot + 2)}
            </Txt>
          ) : null}
        </Txt>
      </Animated.View>
    </Animated.View>
  );
  if (!props.onPress) return <Row justify="center">{body}</Row>;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.text}
      radius="tile"
      alignSelf="stretch"
    >
      {body}
    </Touchable>
  );
}
