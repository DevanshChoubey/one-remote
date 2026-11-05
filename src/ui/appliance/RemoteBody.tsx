import type { ReactElement, ReactNode } from 'react';
import { FlatList } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { Box, Txt } from '../primitives';

export interface RemoteBodyProps {
  children: ReactNode;
  testID?: string;
}

const NONE: readonly number[] = [];

/**
 * The body of the AC and fan remotes (mock `.screen`, gap 16): at least the height left under the
 * bar, so a `RemoteGrow` pushes what follows it to the bottom; it scrolls when it does not fit (a
 * short phone, a large font). Use it in a `Screen` without `scroll`.
 */
export function RemoteBody(props: RemoteBodyProps): ReactElement {
  const theme = useTheme();
  return (
    <FlatList
      testID={props.testID ?? 'remote-body'}
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1 }}
      data={NONE}
      renderItem={() => null}
      ListHeaderComponent={
        // flexGrow, not flex: a 0 basis would collapse in the content's auto height.
        <Animated.View style={{ flexGrow: 1, gap: theme.space(4) }}>{props.children}</Animated.View>
      }
      ListHeaderComponentStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

/** Mock `.grow`: takes the free height in a `RemoteBody` (none when it scrolls). */
export function RemoteGrow(): ReactElement {
  return <Box flex={1} testID="remote-grow" />;
}

export interface RemoteSectionProps {
  label: string;
  /** Space between the label and the content: 8 above the speed bars, 4 above the timer chips. */
  gap: 1 | 2;
  children: ReactNode;
}

/**
 * A labelled part of the fan remote (mock `.sect`: 13 px bold ink2, 8 px above it and 4 px in from
 * the sides; its -4 px bottom margin is folded into `gap`).
 */
export function RemoteSection(props: RemoteSectionProps): ReactElement {
  const theme = useTheme();
  return (
    <Animated.View style={{ marginTop: theme.space(2), gap: theme.space(props.gap) }}>
      <Box px={1}>
        <Txt variant="captionBold" color="ink2">
          {props.label}
        </Txt>
      </Box>
      {props.children}
    </Animated.View>
  );
}
