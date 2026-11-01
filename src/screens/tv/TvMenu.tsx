import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { Chip, Row } from '@/ui';

export type Pad = 'touchpad' | 'dpad';

/** The ⋮ menu: the pad style (the current one shown selected) and the TV's inputs. Every pick
 *  is reported once; the screen closes the menu. */
export function TvMenu(props: {
  pad: Pad;
  onPad: (pad: Pad) => void;
  onInput: () => void;
}): ReactElement {
  return (
    <Row gap={2} justify="center" testID="tv-menu">
      <Chip
        label={t('tv.touchpad')}
        state={props.pad === 'touchpad' ? 'selected' : 'neutral'}
        onToggle={() => props.onPad('touchpad')}
      />
      <Chip
        label={t('tv.dpad')}
        state={props.pad === 'dpad' ? 'selected' : 'neutral'}
        onToggle={() => props.onPad('dpad')}
      />
      <Chip label={t('tv.input')} state="neutral" onToggle={props.onInput} />
    </Row>
  );
}
