import type {} from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ThemeProvider } from '@/theme';
import { LevelTile, SprayDisc } from '@/ui/aer';

const wrap = (node: ReactElement, reducedMotion = false): ReactElement => (
  <ThemeProvider scheme="light" reducedMotion={reducedMotion}>
    {node}
  </ThemeProvider>
);

describe('SprayDisc', () => {
  it('presses with its label', async () => {
    const onPress = jest.fn();
    await render(
      wrap(<SprayDisc onPress={onPress} spraying={false} disabled={false} label="Spray now" />),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Spray now' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does nothing when disabled', async () => {
    const onPress = jest.fn();
    await render(wrap(<SprayDisc onPress={onPress} spraying={false} disabled label="Spray now" />));
    await fireEvent.press(screen.getByRole('button', { name: 'Spray now' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows two mist rings while spraying and ignores presses', async () => {
    const onPress = jest.fn();
    await render(wrap(<SprayDisc onPress={onPress} spraying disabled={false} label="Spraying…" />));
    expect(screen.getAllByTestId('spray-mist')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Spraying…' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows no rings when not spraying', async () => {
    await render(
      wrap(<SprayDisc onPress={jest.fn()} spraying={false} disabled={false} label="Spray now" />),
    );
    expect(screen.queryByTestId('spray-mist')).toBeNull();
  });

  it('shows no rings under reduced motion', async () => {
    await render(
      wrap(<SprayDisc onPress={jest.fn()} spraying disabled={false} label="Spraying…" />, true),
    );
    expect(screen.queryByTestId('spray-mist')).toBeNull();
  });
});

describe('LevelTile', () => {
  it('shows the label, the percent and a bar', async () => {
    await render(
      wrap(
        <LevelTile
          icon="battery"
          label="Battery"
          percent={71}
          tone="accent"
          loading={false}
          testID="t"
        />,
      ),
    );
    expect(screen.getByText('Battery')).toBeTruthy();
    expect(screen.getByText('71%')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Battery' })).toBeTruthy();
  });

  it('shows skeletons while loading', async () => {
    await render(
      wrap(
        <LevelTile icon="battery" label="Battery" percent={71} tone="accent" loading testID="t" />,
      ),
    );
    expect(screen.getByTestId('t-loading')).toBeTruthy();
    expect(screen.queryByText('71%')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows a dash before the first reading', async () => {
    await render(wrap(<LevelTile icon="drop" label="Refill left" tone="warm" loading={false} />));
    expect(screen.getByText('–')).toBeTruthy();
  });
});
