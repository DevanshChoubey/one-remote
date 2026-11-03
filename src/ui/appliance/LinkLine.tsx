import type { ReactElement } from 'react';
import { Icon } from '../Icon';
import { StatusDot } from '../StatusDot';
import { Box, Column, Row, Touchable, Txt } from '../primitives';

export type StatusKind = 'connected' | 'irOnly' | 'fellBack' | 'needsIr';

export interface LinkLineProps {
  kind: StatusKind;
  text: string;
  /** Opens the device settings. Tapping works for every kind so the sheet is always reachable. */
  onPress?: () => void;
}

/** The line under an AC or fan remote: how the last press went out. */
export function LinkLine(props: LinkLineProps): ReactElement {
  const fell = props.kind === 'fellBack';
  const connected = props.kind === 'connected';
  // "Connected · how it's connected": the part after the dot is the (underlined) link.
  const dot = props.text.indexOf('· ');
  const link = connected && props.onPress !== undefined && dot >= 0;
  const color = fell ? 'ink' : 'ink2';
  const body = (
    <Row
      gap={2}
      align="center"
      justify="center"
      minH={48}
      px={fell ? 3 : 2}
      py={fell ? 2 : 0}
      bg={fell ? 'warmSoft' : undefined}
      radius="tile"
    >
      {connected ? <StatusDot tone="ok" /> : <Icon name="ir" size={18} color={color} />}
      {link ? (
        <Row align="center">
          <Txt color={color}>{props.text.slice(0, dot + 2)}</Txt>
          <Column>
            <Txt color={color}>{props.text.slice(dot + 2)}</Txt>
            <Box h={1} bg={color} />
          </Column>
        </Row>
      ) : (
        <Box flex={1}>
          <Txt color={color} live={fell}>
            {props.text}
          </Txt>
        </Box>
      )}
    </Row>
  );
  if (!props.onPress) return <Row justify="center">{body}</Row>;
  return (
    <Touchable
      onPress={props.onPress}
      accessibilityLabel={props.text}
      radius="tile"
      alignSelf="center"
    >
      {body}
    </Touchable>
  );
}
