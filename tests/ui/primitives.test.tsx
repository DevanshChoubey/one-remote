import { fireEvent, render, screen } from '@testing-library/react-native';
import type { StyleProp } from 'react-native';
import * as RN from 'react-native';
import { StyleSheet } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Box, Scroll, Touchable, Txt } from '@/ui/primitives';

function flat(style: unknown, state = { pressed: false }): Record<string, unknown> {
  const resolved =
    typeof style === 'function' ? (style as (s: typeof state) => unknown)(state) : style;
  return StyleSheet.flatten(resolved as StyleProp<object>) as Record<string, unknown>;
}

function wrap(node: React.ReactElement, scheme: 'light' | 'dark' = 'light'): React.ReactElement {
  return <ThemeProvider scheme={scheme}>{node}</ThemeProvider>;
}

describe('primitives', () => {
  it('Box bg="surface" resolves to the token color', async () => {
    await render(wrap(<Box bg="surface" testID="b" />));
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(
      lightTokens.color.surface,
    );
  });

  it('Box p={4} resolves to space(4)', async () => {
    await render(wrap(<Box p={4} testID="b" />));
    expect(flat(screen.getByTestId('b').props.style).padding).toBe(lightTokens.space(4));
  });

  it('a see-through Box fades as one layer, so child shadows do not show through on Android', async () => {
    await render(wrap(<Box opacity={0.45} testID="b" />));
    expect(screen.getByTestId('b').props.needsOffscreenAlphaCompositing).toBe(true);
    await render(wrap(<Box opacity={1} testID="c" />));
    expect(screen.getByTestId('c').props.needsOffscreenAlphaCompositing).toBe(false);
  });

  it('Box follows the dark scheme', async () => {
    await render(wrap(<Box bg="bg" testID="b" />, 'dark'));
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(darkTokens.color.bg);
  });

  it('Touchable forwards a long press', async () => {
    const onLongPress = jest.fn();
    await render(
      <ThemeProvider scheme="light">
        <Touchable onPress={jest.fn()} onLongPress={onLongPress} accessibilityLabel="Hold me">
          <Txt>x</Txt>
        </Touchable>
      </ThemeProvider>,
    );
    await fireEvent(screen.getByLabelText('Hold me'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('Touchable has min 48 hit area and the given role and label', async () => {
    const onPress = jest.fn();
    await render(
      wrap(
        <Touchable onPress={onPress} accessibilityLabel="Spray now" accessibilityRole="link">
          <Txt>Spray</Txt>
        </Touchable>,
      ),
    );
    const el = screen.getByLabelText('Spray now');
    expect(el.props.accessibilityRole).toBe('link');
    const style = flat(el.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
    await fireEvent.press(el);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Txt uses the body font and the ink colour by default', async () => {
    await render(wrap(<Txt>hello</Txt>));
    const style = flat(screen.getByText('hello').props.style);
    expect(style.fontWeight).toBe(lightTokens.font.body.fontWeight);
    expect(style.fontFamily).toBeUndefined();
    expect(style.color).toBe(lightTokens.color.ink);
  });
});

describe('Txt roles', () => {
  it('title and heading are headers, body is not', async () => {
    await render(
      wrap(
        <>
          <Txt variant="title">T</Txt>
          <Txt variant="heading">H</Txt>
          <Txt>B</Txt>
        </>,
      ),
    );
    expect(screen.getByText('T').props.accessibilityRole).toBe('header');
    expect(screen.getByText('H').props.accessibilityRole).toBe('header');
    expect(screen.getByText('B').props.accessibilityRole).toBeUndefined();
  });
});

describe('theme preference', () => {
  it('follows the system scheme by default (light in Jest)', async () => {
    await render(
      <ThemeProvider>
        <Box bg="bg" testID="b" />
      </ThemeProvider>,
    );
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(lightTokens.color.bg);
  });

  it('lets an explicit preference override the system scheme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Box bg="bg" testID="b" />
      </ThemeProvider>,
    );
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(darkTokens.color.bg);
  });

  it('resolves system with the OS dark scheme', async () => {
    const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    await render(
      <ThemeProvider preference="system">
        <Box bg="bg" testID="b" />
      </ThemeProvider>,
    );
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(darkTokens.color.bg);
    spy.mockRestore();
  });
});

describe('primitives type scale and Scroll', () => {
  it('Txt size, weight, align and underline override the variant', async () => {
    await render(
      wrap(
        <Txt size="otp" weight="semibold" align="center" underline>
          7
        </Txt>,
      ),
    );
    const s = flat(screen.getByText('7').props.style);
    expect(s.fontSize).toBe(lightTokens.size.otp);
    expect(s.fontWeight).toBe('600');
    expect(s.textAlign).toBe('center');
    expect(s.textDecorationLine).toBe('underline');
  });

  it('Txt size tokens match the mock scale', () => {
    expect(lightTokens.size).toMatchObject({
      badge: 12,
      banner: 14,
      cardName: 18,
      otp: 26,
      displaySup: 28,
      welcome: 30,
      ring: 32,
    });
    expect(lightTokens.font.semibold.fontWeight).toBe('600');
  });

  it('Txt captionBold is 13 bold', async () => {
    await render(wrap(<Txt variant="captionBold">c</Txt>));
    const s = flat(screen.getByText('c').props.style);
    expect(s.fontSize).toBe(13);
    expect(s.fontWeight).toBe('700');
  });

  it('Txt keeps its variant when no override is given', async () => {
    await render(wrap(<Txt variant="heading">h</Txt>));
    const s = flat(screen.getByText('h').props.style);
    expect(s.fontSize).toBe(lightTokens.size.heading);
    expect(s.textAlign).toBeUndefined();
  });

  it('Box maxW, overflow and busy', async () => {
    await render(wrap(<Box testID="b" maxW={300} overflow="hidden" busy />));
    const el = screen.getByTestId('b');
    const s = flat(el.props.style);
    expect(s.maxWidth).toBe(300);
    expect(s.overflow).toBe('hidden');
    expect(el.props.accessibilityState).toEqual({ busy: true });
  });

  it('Box merges selected and busy', async () => {
    await render(wrap(<Box testID="b" selected busy={false} />));
    expect(screen.getByTestId('b').props.accessibilityState).toEqual({
      selected: true,
      busy: false,
    });
  });

  it('Scroll takes spacing props and a content gap', async () => {
    await render(
      wrap(
        <Scroll testID="s" px={5} py={3} contentGap={3} keyboardShouldPersistTaps="handled">
          <Txt>in</Txt>
        </Scroll>,
      ),
    );
    const sv = screen.getByTestId('s');
    expect(sv.props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByText('in')).toBeTruthy();
    const content = sv.props.contentContainerStyle;
    const c = flat(content);
    expect(c.paddingHorizontal).toBe(lightTokens.space(5));
    expect(c.paddingVertical).toBe(lightTokens.space(3));
    expect(c.gap).toBe(lightTokens.space(3));
  });
});
