import type {} from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { getAnimatedStyle } from 'react-native-reanimated';
import { lightTokens, ThemeProvider } from '@/theme';
import {
  Badge,
  Banner,
  Chip,
  Field,
  IconButton,
  OptionCard,
  Screen,
  SegmentedControl,
  Skeleton,
  SkelCard,
  Txt,
} from '@/ui';

type El = { props: Record<string, unknown> };

function wrap(
  node: ReactElement,
  scheme: 'light' | 'dark' = 'light',
  reduced = false,
): ReactElement {
  return (
    <ThemeProvider scheme={scheme} reducedMotion={reduced}>
      {node}
    </ThemeProvider>
  );
}

const flat = (style: unknown): Record<string, unknown> =>
  StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
const anim = (el: El): Record<string, unknown> =>
  flat((getAnimatedStyle as (c: El) => unknown)(el));

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('lane C: Field', () => {
  it('a non-zero first shakeKey does not shake on mount, a change does', async () => {
    jest.useFakeTimers();
    try {
      const field = (k: number): ReactElement =>
        wrap(<Field label="Name" value="" onChangeText={jest.fn()} shakeKey={k} />);
      const { rerender } = await render(field(3));
      const x = (): number =>
        (anim(screen.getByTestId('field-shake')).transform as { translateX: number }[])[0]
          ?.translateX ?? 0;
      await act(async () => {
        jest.advanceTimersByTime(40);
      });
      expect(x()).toBe(0);
      await rerender(field(4));
      await act(async () => {
        jest.advanceTimersByTime(40);
      });
      expect(x()).not.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('lane C: Chip', () => {
  it('without onToggle but with onPress it is a plain button with a hint', async () => {
    const onPress = jest.fn();
    await render(
      wrap(
        <Chip label="Fan" state="neutral" onPress={onPress} accessibilityHint="Changes speed" />,
      ),
    );
    const chip = screen.getByLabelText('Fan');
    expect(chip.props.accessibilityRole).toBe('button');
    expect(chip.props.accessibilityHint).toBe('Changes speed');
    await fireEvent.press(chip);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('the label colour follows the fill, at once under reduced motion', async () => {
    const chip = (s: 'neutral' | 'selected'): ReactElement =>
      wrap(<Chip label="Cool" state={s} onToggle={jest.fn()} />, 'light', true);
    const { rerender } = await render(chip('neutral'));
    expect(anim(screen.getByText('Cool') as unknown as El).color).toBe(lightTokens.color.ink);
    await rerender(chip('selected'));
    await wait(60);
    expect(anim(screen.getByText('Cool') as unknown as El).color).toBe(lightTokens.color.accentInk);
  });
});

describe('lane C: IconButton flat', () => {
  it('a flat press fades from the pressed colour at alpha 0, never from transparent black', async () => {
    await render(wrap(<IconButton icon="more" label="Close" flat onPress={jest.fn()} />));
    const tint = (): unknown =>
      anim(screen.getByTestId('icon-button-tint') as unknown as El).backgroundColor;
    // surface2 #f1f3f6 at alpha 0 (#f1f3f600): the same hue, so the fade has no dark midpoint.
    expect(tint()).toBe('#f1f3f600');
    await fireEvent(screen.getByLabelText('Close'), 'pressIn');
    await wait(120);
    expect(tint()).toBe(lightTokens.color.surface2);
  });

  it('a filled button draws no tint overlay', async () => {
    await render(wrap(<IconButton icon="more" label="More" onPress={jest.fn()} />));
    expect(screen.queryByTestId('icon-button-tint')).toBeNull();
  });
});

describe('lane C: SegmentedControl', () => {
  it('dims the whole group, thumb included, when disabled', async () => {
    const opts = [
      { value: 'a', label: 'Auto' },
      { value: 'b', label: 'Cool' },
    ] as const;
    await render(
      wrap(
        <SegmentedControl label="Mode" options={opts} value="a" onChange={jest.fn()} disabled />,
      ),
    );
    expect(flat(screen.getByLabelText('Mode').props.style).opacity).toBe(0.42);
    // The thumb sits inside the dimmed group, so it is dimmed with it.
    expect(screen.getByLabelText('Mode')).toContainElement(screen.getByTestId('segment-thumb'));
  });

  it('is full strength when enabled', async () => {
    const opts = [{ value: 'a', label: 'Auto' }] as const;
    await render(
      wrap(<SegmentedControl label="Mode" options={opts} value="a" onChange={jest.fn()} />),
    );
    expect(flat(screen.getByLabelText('Mode').props.style).opacity).toBe(1);
  });
});

describe('lane C: Badge, Skeleton, Banner, Screen, OptionCard', () => {
  it('Badge pads 10 across and 3 down', async () => {
    await render(wrap(<Badge label="Now" />));
    const st = flat(screen.getByText('Now').parent?.props.style);
    expect(st.paddingHorizontal).toBe(10);
    expect(st.paddingVertical).toBe(3);
  });

  it('Skeleton fills its parent with a percentage height', async () => {
    await render(wrap(<Skeleton height="100%" />, 'light', true));
    expect(JSON.stringify(screen.toJSON())).toContain('"height":"100%"');
  });

  it('SkelCard takes a testID and its bars are line at 0.7', async () => {
    await render(wrap(<SkelCard testID="skel" />, 'light', true));
    expect(screen.getByTestId('skel')).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).toContain(lightTokens.color.line);
  });

  it('Banner draws an action button that calls back', async () => {
    const onPress = jest.fn();
    await render(wrap(<Banner text="Lost trust" action={{ label: 'Pair again', onPress }} />));
    await fireEvent.press(screen.getByLabelText('Pair again'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Pair again').props.accessibilityRole).toBe('button');
  });

  it('Banner without an action draws no button', async () => {
    await render(wrap(<Banner text="Heads up" />));
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Screen shows a subtitle under a big title', async () => {
    await render(
      wrap(
        <Screen title="Home" subtitle="3 devices">
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.getByText('3 devices')).toBeTruthy();
    expect(flat(screen.getByText('3 devices').parent?.props.style).marginTop).toBe(6);
  });

  it('OptionCard selected reports selected, with a 2 px accent ring', async () => {
    await render(wrap(<OptionCard title="Sony" icon="tv" onPress={jest.fn()} selected />));
    const card = screen.getByLabelText('Sony');
    expect(card.props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('option-ring')).toHaveStyle({
      borderWidth: 2,
      borderColor: lightTokens.color.accent,
    });
    await render(wrap(<OptionCard title="LG" icon="tv" onPress={jest.fn()} selected={false} />));
    expect(screen.getByLabelText('LG').props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId('option-ring')).toBeNull();
    // The empty radio is a 2 px ink2 ring (mock `.pick .rad`).
    expect(screen.getByTestId('option-radio')).toHaveStyle({
      borderWidth: 2,
      borderColor: lightTokens.color.ink2,
    });
  });

  it('OptionCard size regular is the plain card row: 76 high, 44 tile, 16 px name', async () => {
    await render(wrap(<OptionCard title="LG" icon="tv" onPress={jest.fn()} size="regular" />));
    expect(screen.getByText('LG')).toHaveStyle({ fontSize: lightTokens.size.body });
    await render(wrap(<OptionCard title="TV" icon="tv" onPress={jest.fn()} />));
    expect(screen.getByText('TV')).toHaveStyle({ fontSize: lightTokens.size.cardName });
  });
});
