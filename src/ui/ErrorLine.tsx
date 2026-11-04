import type { ReactElement } from 'react';
import { Icon } from './Icon';
import { Box, Row, Txt } from './primitives';

const ICON_GAP = 6;

export interface ErrorLineProps {
  text: string;
}

/** An inline error: the text is announced when it appears. */
export function ErrorLine(props: ErrorLineProps): ReactElement {
  return (
    // The mock's `.errline`: 14 px, 4 px in from the sides, icon on the first line, 6 px gap.
    <Row align="start" px={1}>
      <Icon name="alert" size={18} color="dangerInk" />
      <Box w={ICON_GAP} />
      <Box flex={1}>
        <Txt size="banner" color="dangerInk" live>
          {props.text}
        </Txt>
      </Box>
    </Row>
  );
}
