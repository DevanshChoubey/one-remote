import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import {
  Badge,
  Banner,
  Card,
  EmptyState,
  OptionCard,
  ProgressBar,
  ResultDisc,
  Rise,
  Screen,
  Skeleton,
  Spinner,
  StatusDot,
  Txt,
} from '@/ui';
import { AnimatedBox } from '@/ui/primitives';

function wrap(
  node: ReactElement,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): ReactElement {
  return (
    <ThemeProvider scheme={opts.scheme ?? 'light'} reducedMotion={opts.reducedMotion}>
      {node}
    </ThemeProvider>
  );
}

const flat = (id: string): Record<string, unknown> =>
  StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

describe('surfaces', () => {
  it('Card off is 0.6 opaque and rows are at least 76 high', async () => {
    await render(
      wrap(
        <Card off row testID="c">
          <Txt>x</Txt>
        </Card>,
      ),
    );
    expect(flat('c').opacity).toBe(0.6);
    expect(flat('c').minHeight).toBe(76);
  });

  it('Card index wraps the card in a Rise', async () => {
    await render(
      wrap(
        <Card index={2} testID="c">
          <Txt>x</Txt>
        </Card>,
        { reducedMotion: true },
      ),
    );
    expect(screen.getByTestId('c')).toBeTruthy();
    expect(screen.getByText('x')).toBeTruthy();
  });

  it('Badge ok uses the soft ok colours, in dark too', async () => {
    await render(wrap(<Badge label="Paired" tone="ok" />));
    expect(StyleSheet.flatten(screen.getByText('Paired').props.style).color).toBe(
      lightTokens.color.okInk,
    );
    expect(StyleSheet.flatten(screen.getByText('Paired').parent?.props.style).backgroundColor).toBe(
      lightTokens.color.okSoft,
    );
    await render(wrap(<Badge label="Dark one" tone="ok" />, { scheme: 'dark' }));
    expect(
      StyleSheet.flatten(screen.getByText('Dark one').parent?.props.style).backgroundColor,
    ).toBe(darkTokens.color.okSoft);
  });

  it('Banner shows its text on the warm soft colour', async () => {
    await render(wrap(<Banner text="Heads up" testID="b" />));
    expect(screen.getByText('Heads up')).toBeTruthy();
    expect(flat('b').backgroundColor).toBe(lightTokens.color.warmSoft);
  });

  it('EmptyState with an icon shows the art tile; the mark has no art tile', async () => {
    await render(wrap(<EmptyState title="None" body="Nothing here" art="alert" tone="warm" />));
    expect(screen.getByTestId('empty-art')).toBeTruthy();
    expect(screen.getByText('None').props.accessibilityRole).toBe('header');
    await render(wrap(<EmptyState title="Hi" body="Welcome" art="mark" />));
    expect(screen.getByTestId('mark')).toBeTruthy();
  });

  it('OptionCard is pressable by label and rises with an index', async () => {
    const onPress = jest.fn();
    await render(
      wrap(<OptionCard title="TV" icon="tv" onPress={onPress} index={1} testID="opt" />, {
        reducedMotion: true,
      }),
    );
    expect(screen.getByLabelText('TV')).toBeTruthy();
  });

  it('Skeleton shows its sweep band', async () => {
    await render(wrap(<Skeleton height={14} />));
    expect(screen.getByTestId('skeleton-band')).toBeTruthy();
  });

  it('Skeleton drops its band at once when reduced motion is switched on', async () => {
    const view = await render(wrap(<Skeleton height={14} />));
    expect(screen.getByTestId('skeleton-band')).toBeTruthy();
    await view.rerender(wrap(<Skeleton height={14} />, { reducedMotion: true }));
    expect(screen.queryByTestId('skeleton-band')).toBeNull();
  });

  it('Skeleton under reduced motion renders no band', async () => {
    await render(wrap(<Skeleton height={14} />, { reducedMotion: true }));
    expect(screen.queryByTestId('skeleton-band')).toBeNull();
  });

  it('StatusDot live rests at full opacity under reduced motion', async () => {
    await render(wrap(<StatusDot tone="ok" live testID="dot" />, { reducedMotion: true }));
    expect(flat('dot').opacity).toBe(1);
    expect(flat('dot').backgroundColor).toBe(lightTokens.color.ok);
  });

  it('Spinner and ProgressBar render and the bar reports its value', async () => {
    await render(
      wrap(
        <>
          <Spinner size="lg" />
          <ProgressBar value={0.4} label="Pairing" />
        </>,
        { reducedMotion: true },
      ),
    );
    const bar = screen.getByLabelText('Pairing');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 40 });
  });

  it('Screen with a back button keeps a long title to one line', async () => {
    const long = 'A very long room name that goes on and on and on forever';
    await render(
      wrap(
        <Screen onBack={jest.fn()} title={long} subtitle="Connected">
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.getByText(long).props.numberOfLines).toBe(1);
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByTestId('screen-back')).toBeTruthy();
  });

  it('ResultDisc is soft-coloured in light and dark', async () => {
    await render(wrap(<ResultDisc kind="bad" label="Failed" />, { scheme: 'dark' }));
    expect(StyleSheet.flatten(screen.getByLabelText('Failed').props.style).backgroundColor).toBe(
      darkTokens.color.dangerSoft,
    );
    await render(wrap(<ResultDisc kind="ok" label="Done" />, { reducedMotion: true }));
    expect(StyleSheet.flatten(screen.getByLabelText('Done').props.style).backgroundColor).toBe(
      lightTokens.color.okSoft,
    );
  });

  it('AnimatedBox forwards selected and accessibilityValue like Box', async () => {
    await render(
      wrap(
        <AnimatedBox
          accessibilityLabel="Bar"
          selected
          accessibilityValue={{ min: 0, max: 10, now: 3 }}
        />,
      ),
    );
    const el = screen.getByLabelText('Bar');
    expect(el.props.accessibilityState).toEqual({ selected: true });
    expect(el.props.accessibilityValue).toEqual({ min: 0, max: 10, now: 3 });
  });

  it('Rise renders its children', async () => {
    await render(
      wrap(
        <Rise index={3}>
          <Txt>risen</Txt>
        </Rise>,
      ),
    );
    expect(screen.getByText('risen')).toBeTruthy();
  });
});
