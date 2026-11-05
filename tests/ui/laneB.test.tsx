import type {} from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { lightTokens, ThemeProvider } from '@/theme';
import { Badge, Banner, EmptyState, Field, OptionCard } from '@/ui';
import { OtpCells, PairRing } from '@/ui/addtv';
import { Dial } from '@/ui/appliance';

const wrap = (node: ReactElement): ReactElement => (
  <ThemeProvider scheme="light">{node}</ThemeProvider>
);
const flat = (style: unknown): Record<string, unknown> =>
  StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
const styleOf = (text: string): Record<string, unknown> => flat(screen.getByText(text).props.style);

describe('lane B: type sizes', () => {
  it('Badge text is 12 bold', async () => {
    await render(wrap(<Badge label="Matter" />));
    const s = styleOf('Matter');
    expect(s.fontSize).toBe(lightTokens.size.badge);
    expect(s.fontWeight).toBe('700');
  });

  it('Banner text is 14', async () => {
    await render(wrap(<Banner text="Heads up" />));
    expect(styleOf('Heads up').fontSize).toBe(lightTokens.size.banner);
    // Mock `.banner { line-height: 1.4 }`: 19.6 px.
    expect(styleOf('Heads up').lineHeight).toBeCloseTo(19.6);
  });

  it('an error Banner is a polite live region and an info one is not', async () => {
    const { rerender } = await render(wrap(<Banner text="Bad" tone="error" testID="b" />));
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBe('polite');
    await rerender(wrap(<Banner text="Fine" testID="b" />));
    expect(screen.getByTestId('b').props.accessibilityLiveRegion).toBeUndefined();
  });

  it('the dial digit boxes grow with the system font scale', async () => {
    // Jest's window has a font scale of 2.
    await render(
      wrap(
        <Dial value={24} min={16} max={30} on tone="cool" caption="Cool" accessibilityLabel="AC" />,
      ),
    );
    let node = screen.getByText('2').parent;
    while (node && flat(node.props.style).width === undefined) node = node.parent;
    const style = flat(node?.props.style);
    expect(style.width).toBe(43 * 2);
    expect(style.height).toBe(80 * 2);
  });

  it('OptionCard name is 18', async () => {
    await render(wrap(<OptionCard title="LG" icon="tv" onPress={jest.fn()} />));
    expect(styleOf('LG').fontSize).toBe(lightTokens.size.cardName);
  });

  it('EmptyState body is centred and 300 wide at most; a welcome title is 30', async () => {
    await render(wrap(<EmptyState title="Hi" body="Some body" art="mark" />));
    const body = styleOf('Some body');
    expect(body.textAlign).toBe('center');
    expect(styleOf('Hi').fontSize).toBe(lightTokens.size.welcome);
    expect(screen.getByTestId('empty-body').props.style).toBeDefined();
  });

  it('EmptyState without a body draws no body', async () => {
    await render(wrap(<EmptyState title="Hi" />));
    expect(screen.queryByTestId('empty-body')).toBeNull();
  });

  it('Field label is bold caption', async () => {
    await render(wrap(<Field label="Name" value="" onChangeText={jest.fn()} />));
    const s = styleOf('Name');
    expect(s.fontSize).toBe(lightTokens.size.caption);
    expect(s.fontWeight).toBe('700');
  });

  it('OTP digits are 26', async () => {
    await render(
      wrap(
        <OtpCells
          value="A"
          length={6}
          invalid={false}
          onChange={jest.fn()}
          accessibilityLabel="Code"
        />,
      ),
    );
    expect(styleOf('A').fontSize).toBe(lightTokens.size.otp);
  });

  it('the pair ring number is 32', async () => {
    await render(wrap(<PairRing secondsLeft={42} total={60} phase="wait" />));
    expect(styleOf('42').fontSize).toBe(lightTokens.size.ring);
  });

  it('the dial degree sign is 28 and Off has its own size', async () => {
    const dial = (on: boolean): ReactElement =>
      wrap(
        <Dial
          value={24}
          min={16}
          max={30}
          on={on}
          tone="cool"
          caption="Cool"
          accessibilityLabel="AC"
        />,
      );
    const { rerender } = await render(dial(true));
    expect(styleOf('°').fontSize).toBe(lightTokens.size.displaySup);
    await rerender(dial(false));
    expect(styleOf('Off').fontSize).toBe(lightTokens.size.dialOff);
  });

  it('OptionCard in a list draws a radio, ticked only when selected', async () => {
    const { rerender } = await render(
      wrap(<OptionCard title="LG" icon="tv" onPress={jest.fn()} selected={false} />),
    );
    expect(screen.getByTestId('option-radio')).toBeTruthy();
    expect(screen.queryByTestId('icon-check')).toBeNull();
    await rerender(wrap(<OptionCard title="LG" icon="tv" onPress={jest.fn()} selected />));
    expect(screen.getByTestId('option-radio').children.length).toBe(1);
  });
});
