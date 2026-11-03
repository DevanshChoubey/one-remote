import type { ReactElement } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Row, Touchable, Txt } from './primitives';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<V extends string> {
  /** Names the group (kept for the screen reader grouping added with the motion). */
  label: string;
  options: readonly SegmentOption<V>[];
  value: V;
  onChange: (v: V) => void;
  disabled?: boolean;
}

export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>): ReactElement {
  return (
    <Row bg="surface2" border="line" radius="pill" p={1} gap={1}>
      {props.options.map((o) => {
        const selected = o.value === props.value;
        return (
          <Touchable
            key={o.value}
            onPress={() => props.onChange(o.value)}
            accessibilityRole="togglebutton"
            accessibilityLabel={o.label}
            selected={selected}
            disabled={props.disabled}
            bg={selected ? 'surface' : undefined}
            radius="pill"
            pressScale={1}
            fill
          >
            <Row gap={2} align="center" justify="center" px={2}>
              {o.icon ? <Icon name={o.icon} size={18} color={selected ? 'ink' : 'ink2'} /> : null}
              <Txt variant="label" color={selected ? 'ink' : 'ink2'}>
                {o.label}
              </Txt>
            </Row>
          </Touchable>
        );
      })}
    </Row>
  );
}
