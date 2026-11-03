import type { ReactElement } from 'react';
import { Icon } from './Icon';
import { Row, Txt } from './primitives';

export interface ErrorLineProps {
  text: string;
}

/** An inline error: the text is announced when it appears. */
export function ErrorLine(props: ErrorLineProps): ReactElement {
  return (
    <Row gap={2} align="center">
      <Icon name="alert" size={18} color="dangerInk" />
      <Txt variant="caption" color="dangerInk" live>
        {props.text}
      </Txt>
    </Row>
  );
}
