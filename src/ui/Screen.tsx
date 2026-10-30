import type { ReactElement, ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { Box, Column, Row, Touchable, Txt } from './primitives';

export interface ScreenProps {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  /** Shows a round back button beside the title. */
  onBack?: () => void;
  /** Stays pinned below the content, within thumb reach. */
  footer?: ReactNode;
}

const ONE_PAGE = [0];

export function Screen(props: ScreenProps): ReactElement {
  const theme = useTheme();
  const title = props.title ? <Txt variant="title">{props.title}</Txt> : null;
  const header = props.onBack ? (
    <Row gap={2} align="center">
      <Touchable onPress={props.onBack} accessibilityLabel={t('common.back')}>
        <Box bg="surface2" radius="pill" align="center" justify="center" testID="screen-back">
          <Box px={3} py={2}>
            <Txt variant="heading" color="ink">
              ‹
            </Txt>
          </Box>
        </Box>
      </Touchable>
      <Box flex={1}>{title}</Box>
    </Row>
  ) : (
    title
  );
  const content = (
    <Column gap={4} px={5} py={4}>
      {header}
      {props.children}
    </Column>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/* Keeps inputs (rename, zone search, name) above the keyboard; Android resizes by itself. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {props.scroll ? (
          // A one-row FlatList is the scroll container available outside the primitives.
          <FlatList
            data={ONE_PAGE}
            keyExtractor={(n) => String(n)}
            renderItem={() => content}
            keyboardShouldPersistTaps="handled"
          />
        ) : (
          <Box flex={1}>{content}</Box>
        )}
        {props.footer ? (
          <Box px={5} py={3}>
            {props.footer}
          </Box>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
