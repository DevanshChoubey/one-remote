import type { ReactElement, ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Box, Column, Row, Txt } from './primitives';

export interface ScreenProps {
  title?: string;
  children: ReactNode;
  scroll?: boolean;
  /** Shows a round back button beside the title. */
  onBack?: () => void;
  /** Stays pinned below the content, within thumb reach. */
  footer?: ReactNode;
  /** No title or back button: the screen draws its own bar and fills the height (no scrolling). */
  bare?: boolean;
  /** A caption row under a bar title (status text and a StatusDot). */
  subtitle?: ReactNode;
  /** IconButtons at the right of the bar, or of the big title. */
  actions?: ReactNode;
}

const ONE_PAGE = [0];

export function Screen(props: ScreenProps): ReactElement {
  const theme = useTheme();
  const header = props.bare ? null : props.onBack ? (
    <Row gap={2} align="center" minH={theme.touch.min}>
      <IconButton
        icon="back"
        label={t('common.back')}
        onPress={props.onBack}
        testID="screen-back"
      />
      <Box flex={1}>
        {props.title ? (
          <Txt variant="heading" numberOfLines={1}>
            {props.title}
          </Txt>
        ) : null}
        {props.subtitle === undefined || props.subtitle === null ? null : (
          <Row gap={2} align="center">
            {typeof props.subtitle === 'string' ? (
              <Txt variant="caption" color="ink2" numberOfLines={1}>
                {props.subtitle}
              </Txt>
            ) : (
              props.subtitle
            )}
          </Row>
        )}
      </Box>
      {props.actions}
    </Row>
  ) : props.title || props.actions ? (
    <Row gap={2} align="center">
      <Box flex={1}>
        {props.title ? (
          <Txt variant="title" numberOfLines={1}>
            {props.title}
          </Txt>
        ) : null}
        {props.title && typeof props.subtitle === 'string' && props.subtitle ? (
          <Animated.View style={{ marginTop: 6 }}>
            <Txt variant="caption" color="ink2">
              {props.subtitle}
            </Txt>
          </Animated.View>
        ) : null}
      </Box>
      {props.actions}
    </Row>
  ) : null;
  const content = props.bare ? (
    <Column flex={1} gap={4} px={4} py={4}>
      {props.children}
    </Column>
  ) : (
    <Column gap={4} px={4} py={4}>
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
          <Box px={4} py={3}>
            {props.footer}
          </Box>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
