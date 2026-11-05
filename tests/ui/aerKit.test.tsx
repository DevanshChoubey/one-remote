import type {} from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Icon, ICON_NAMES, IconButton, OptionCard, ProgressBar } from '@/ui';
import type { IconName } from '@/ui';
import { Radar } from '@/ui/addtv';
import { LinkLine } from '@/ui/appliance';

const wrap = (node: ReactElement, scheme: 'light' | 'dark' = 'light'): ReactElement => (
  <ThemeProvider scheme={scheme} reducedMotion>
    {node}
  </ThemeProvider>
);
const flat = (style: unknown): Record<string, unknown> =>
  StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;

const AER_ICONS = [
  'aer',
  'spray',
  'bt',
  'btoff',
  'battery',
  'clock',
  'globe',
  'bell',
] as const satisfies readonly IconName[];

describe('aer kit', () => {
  it('draws every aer icon', async () => {
    for (const name of AER_ICONS) {
      expect(ICON_NAMES).toContain(name);
      await render(wrap(<Icon name={name} testID={`icon-${name}`} />));
      expect(screen.getByTestId(`icon-${name}`)).toBeTruthy();
    }
  });

  it('IconButton accent tone and busy', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(
      wrap(<IconButton icon="spray" label="Spray" tone="accent" onPress={onPress} testID="b" />),
    );
    expect(flat(screen.getByTestId('b-surface').props.style).backgroundColor).toBe(
      lightTokens.color.accentSoft,
    );
    expect(screen.queryByTestId('b-spinner')).toBeNull();
    await rerender(
      wrap(
        <IconButton icon="spray" label="Spray" tone="accent" busy onPress={onPress} testID="b" />,
      ),
    );
    expect(screen.getByTestId('b-spinner')).toBeTruthy();
    expect(screen.getByTestId('b').props.accessibilityState.busy).toBe(true);
    await fireEvent.press(screen.getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ProgressBar tone colours the fill', async () => {
    const fill = (): unknown =>
      flat(screen.getByTestId('progress-fill').props.style).backgroundColor;
    const bar = (tone?: 'accent' | 'warm' | 'danger'): ReactElement => (
      <ProgressBar value={0.5} label="Level" tone={tone} />
    );
    const { rerender } = await render(wrap(bar()));
    expect(fill()).toBe(lightTokens.color.accent);
    await rerender(wrap(bar('warm')));
    expect(fill()).toBe(lightTokens.color.warm);
    await rerender(wrap(bar('danger')));
    expect(fill()).toBe(lightTokens.color.danger);
    await rerender(wrap(bar('danger'), 'dark'));
    expect(fill()).toBe(darkTokens.color.danger);
  });

  it('Radar and LinkLine take an icon', async () => {
    await render(wrap(<Radar searching={false} icon="bt" />));
    expect(screen.getByTestId('radar-core')).toBeTruthy();
    await render(wrap(<LinkLine kind="connected" text="Connected" icon="bt" />));
    expect(screen.getByTestId('link-line')).toBeTruthy();
  });

  it('OptionCard can be disabled and carry a subtitle', async () => {
    const onPress = jest.fn();
    await render(
      wrap(
        <OptionCard
          icon="aer"
          title="Godrej aer"
          subtitle="Needs Android 12"
          disabled
          onPress={onPress}
          testID="opt"
        />,
      ),
    );
    expect(screen.getByText('Needs Android 12')).toBeTruthy();
    expect(screen.getByTestId('opt').props.accessibilityState.disabled).toBe(true);
    expect(flat(screen.getByTestId('opt').props.style).opacity).toBeLessThan(1);
    await fireEvent.press(screen.getByTestId('opt'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
