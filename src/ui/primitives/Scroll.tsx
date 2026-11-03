import type { ReactElement, ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useTheme } from '@/theme';
import type { SpaceStep } from '@/theme';
import { boxStyle } from './Box';
import type { BoxProps } from './Box';

export interface ScrollProps extends Pick<
  BoxProps,
  'p' | 'px' | 'py' | 'm' | 'bg' | 'flex' | 'testID'
> {
  /** Gap between the children, inside the scrolled content. */
  contentGap?: SpaceStep;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
  children?: ReactNode;
}

/**
 * A vertical ScrollView that shrinks to fit (so a sheet body scrolls under its footer). Padding
 * and gap apply to the scrolled content, not the viewport.
 */
export function Scroll(props: ScrollProps): ReactElement {
  const theme = useTheme();
  const { p, px, py, m, bg, flex, contentGap } = props;
  return (
    <ScrollView
      testID={props.testID}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
      style={{ flexShrink: 1, ...boxStyle({ bg, flex, m }, theme) }}
      contentContainerStyle={boxStyle({ p, px, py, gap: contentGap }, theme)}
    >
      {props.children}
    </ScrollView>
  );
}
