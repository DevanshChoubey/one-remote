import { fireEvent, render, screen } from '@testing-library/react-native';
import type { StyleProp } from 'react-native';
import * as RN from 'react-native';
import { StyleSheet } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Box, Touchable, Txt } from '@/ui/primitives';

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

  it('Box follows the dark scheme', async () => {
    await render(wrap(<Box bg="bg" testID="b" />, 'dark'));
    expect(flat(screen.getByTestId('b').props.style).backgroundColor).toBe(darkTokens.color.bg);
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
