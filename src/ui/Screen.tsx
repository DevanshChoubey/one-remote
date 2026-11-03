import type { ReactElement, ReactNode } from 'react';
import { FlatList, KeyboardAvoidingView } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Box, Column, Row, Txt } from './primitives';

export interface ScreenProps {
  title?: string;
  children: ReactNode;
  /**
   * The content scrolls under a fixed header: the bar (or the big title, or `header`) stays put,
   * as the mock's `.scroll` under `.bar`.
   */
  scroll?: boolean;
  /** Shows a round back button beside the title. */
  onBack?: () => void;
  /** Stays pinned below the content, within thumb reach. */
  footer?: ReactNode;
  /** No title or back button: the screen draws its own bar and fills the height (no scrolling). */
  bare?: boolean;
  /**
   * Under a bar title: a string is a one-line 13 px ink2 caption (mock `.bar .bt p`); a node (a
   * status line with a StatusDot) is drawn as is. Under a big or large title: a string only, shown
   * as the mock's sub line (13 px caption for a big title, 16 px ink2 body for `largeTitle`).
   */
  subtitle?: ReactNode;
  /** IconButtons at the right of the bar, or of the big title. */
  actions?: ReactNode;
  /**
   * The add-flow page head (mock `Bar({title:''})` + `Head(title, sub)`): with `onBack`, the bar
   * holds only the back button (and `actions`), and the title is drawn under it at 30 px, with a
   * string `subtitle` as a 16 px ink2 line 6 px below. Without `onBack` it is the big title.
   */
  largeTitle?: boolean;
  /**
   * A custom header (Home: title, count and buttons). It replaces the title row and, like it,
   * stays fixed while `scroll` content moves.
   */
  header?: ReactNode;
}

const ONE_PAGE = [0];
/** The mock's `Head` gap between the title and its sub line. */
const HEAD_GAP = 6;

function Subline(props: { text: string; body: boolean }): ReactElement {
  return (
    <Animated.View style={{ marginTop: HEAD_GAP }}>
      <Txt variant={props.body ? 'body' : 'caption'} color="ink2">
        {props.text}
      </Txt>
    </Animated.View>
  );
}

function BigTitle(props: {
  title?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  body: boolean;
}): ReactElement {
  return (
    <Row gap={2} align="center">
      <Box flex={1}>
        {props.title ? <Txt variant="title">{props.title}</Txt> : null}
        {props.title && typeof props.subtitle === 'string' && props.subtitle ? (
          <Subline text={props.subtitle} body={props.body} />
        ) : null}
      </Box>
      {props.actions}
    </Row>
  );
}

/** The fixed part above the content; null when the screen has none. */
function headerOf(props: ScreenProps, minBar: number): ReactElement | null {
  if (props.bare) return null;
  if (props.header !== undefined && props.header !== null) return <>{props.header}</>;
  if (!props.onBack) {
    return props.title || props.actions ? (
      <BigTitle
        title={props.title}
        subtitle={props.subtitle}
        actions={props.actions}
        body={props.largeTitle === true}
      />
    ) : null;
  }
  const back = (
    <IconButton icon="back" label={t('common.back')} onPress={props.onBack} testID="screen-back" />
  );
  if (props.largeTitle) {
    return (
      <Column gap={4}>
        <Row gap={2} align="center" justify="between" minH={minBar}>
          {back}
          {props.actions}
        </Row>
        {props.title ? <BigTitle title={props.title} subtitle={props.subtitle} body /> : null}
      </Column>
    );
  }
  return (
    <Row gap={2} align="center" minH={minBar}>
      {back}
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
  );
}

export function Screen(props: ScreenProps): ReactElement {
  const theme = useTheme();
  const header = headerOf(props, theme.touch.min);
  const gutter = theme.space(4);
  let content: ReactElement;
  if (props.bare) {
    content = (
      <Column flex={1} gap={4} px={4} py={4}>
        {props.children}
      </Column>
    );
  } else {
    content = (
      <Column flex={1} gap={4} py={4}>
        {header ? <Box px={4}>{header}</Box> : null}
        {props.scroll ? (
          // A one-row FlatList is the scroll container available outside the primitives. Only
          // the content scrolls; the header above it stays fixed.
          <FlatList
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: theme.space(2) }}
            data={ONE_PAGE}
            keyExtractor={(n) => String(n)}
            renderItem={() => <Column gap={4}>{props.children}</Column>}
            keyboardShouldPersistTaps="handled"
            testID="screen-scroll"
          />
        ) : (
          // flex 1, so a `fill` EmptyState centres in the height left under the bar.
          <Column flex={1} gap={4} px={4} testID="screen-body">
            {props.children}
          </Column>
        )}
      </Column>
    );
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.color.bg }}>
      {/*
        Lifts the content and the pinned footer above the keyboard on both platforms. Android is
        edge-to-edge (SDK 58), so the window no longer resizes for the keyboard by itself.
      */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {content}
        {props.footer ? (
          <Box px={4} py={3}>
            {props.footer}
          </Box>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
