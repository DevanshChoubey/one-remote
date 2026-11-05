import type { ReactElement } from 'react';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import type { SpaceStep } from '@/theme';

export function Spacer(props: { size?: SpaceStep }): ReactElement {
  const theme = useTheme();
  const size = theme.space(props.size ?? 2);
  return <View style={{ width: size, height: size }} />;
}
