import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { getAnimatedStyle } from 'react-native-reanimated';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Button, Chip, Field, IconButton, SegmentedControl, Toggle } from '@/ui';

type El = { props: Record<string, unknown> };

/** Lets Reanimated apply its pending style updates (they land on the next frame). */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

/** The style a Reanimated view shows right now, animated values included. */
function anim(el: El): Record<string, unknown> {
  return flat((getAnimatedStyle as (c: El) => unknown)(el));
}

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
}

function wrap(
  node: ReactElement,
  scheme: 'light' | 'dark' = 'light',
  reducedMotion = false,
): ReactElement {
  return (
    <ThemeProvider scheme={scheme} reducedMotion={reducedMotion}>
      {node}
    </ThemeProvider>
  );
}

/** The Touchable's painted surface: the only child of its Pressable. */
function surface(label: string): El {
  const node = screen.getByLabelText(label).children[0];
  if (typeof node === 'string' || !node) throw new Error('surface expected');
  return node;
}

const SEGMENTS = [
  { value: 'a', label: 'Auto' },
  { value: 'b', label: 'Cool' },
] as const;

describe('Button', () => {
  it('danger is a soft red fill with the danger ink, 56 px tall', async () => {
    await render(wrap(<Button label="Remove" variant="danger" onPress={jest.fn()} />));
    expect(anim(surface('Remove')).backgroundColor).toBe(lightTokens.color.dangerSoft);
    expect(anim(surface('Remove')).borderColor).toBe(lightTokens.color.dangerLine);
    expect(screen.getByText('Remove')).toHaveStyle({ color: lightTokens.color.dangerInk });
    const row = screen.getByText('Remove').parent;
    expect(flat(row?.props.style).minHeight).toBe(56);
  });

  it.each(['primary', 'ghost'] as const)(
    'small %s is 48 px and as wide as its label',
    async (v) => {
      await render(wrap(<Button label="Go" variant={v} size="small" onPress={jest.fn()} />));
      expect(flat(screen.getByText('Go').parent?.props.style).minHeight).toBe(48);
      expect(flat(screen.getByLabelText('Go').props.style).alignSelf).toBe('flex-start');
    },
  );

  it('a ghost button is auto-width without asking for size small', async () => {
    await render(wrap(<Button label="Skip" variant="ghost" onPress={jest.fn()} />));
    expect(flat(screen.getByLabelText('Skip').props.style).alignSelf).toBe('flex-start');
  });

  it('loading is busy and blocked but not dimmed; disabled dims to .42', async () => {
    await render(wrap(<Button label="Save" loading onPress={jest.fn()} />));
    expect(screen.getByLabelText('Save').props.accessibilityState.busy).toBe(true);
    expect(flat(screen.getByLabelText('Save').props.style).opacity).toBe(1);
    await render(wrap(<Button label="Off" disabled onPress={jest.fn()} />));
    expect(flat(screen.getByLabelText('Off').props.style).opacity).toBe(0.42);
  });

  it('under reduced motion a press leaves the scale at 1', async () => {
    await render(wrap(<Button label="Press" onPress={jest.fn()} />, 'light', true));
    await fireEvent(screen.getByLabelText('Press'), 'pressIn');
    const transform = anim(surface('Press')).transform as { scale: number }[];
    expect(transform[0]?.scale).toBe(1);
  });
});

describe('IconButton', () => {
  it('dims to .4 when disabled', async () => {
    await render(wrap(<IconButton icon="more" label="More" onPress={jest.fn()} disabled />));
    expect(flat(screen.getByLabelText('More').props.style).opacity).toBe(0.4);
  });
});

describe('Chip', () => {
  it('is at least 48 px tall and toggles', async () => {
    const onToggle = jest.fn();
    await render(wrap(<Chip label="Cool" state="neutral" onToggle={onToggle} />));
    expect(flat(screen.getByText('Cool').parent?.props.style).minHeight).toBe(48);
    await fireEvent.press(screen.getByLabelText('Cool'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('recolours at once when the theme changes', async () => {
    const chip = <Chip label="Cool" state="selected" onToggle={jest.fn()} />;
    const { rerender } = await render(wrap(chip));
    const fill = (): unknown => {
      const box = screen.getByText('Cool').parent?.parent;
      if (!box) throw new Error('chip fill expected');
      return anim(box).backgroundColor;
    };
    expect(fill()).toBe(lightTokens.color.accent);
    await rerender(wrap(chip, 'dark'));
    await settle();
    expect(fill()).toBe(darkTokens.color.accent);
  });
});

describe('Toggle', () => {
  it('has a custom track and thumb and keeps the switch role', async () => {
    const onChange = jest.fn();
    await render(wrap(<Toggle label="Power" value={false} onChange={onChange} />));
    expect(screen.getByTestId('toggle-track')).toBeTruthy();
    expect(screen.getByTestId('toggle-thumb')).toBeTruthy();
    const t = screen.getByLabelText('Power');
    expect(t.props.accessibilityRole).toBe('switch');
    expect(t.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(t);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('is 52x32 with a 26 thumb', async () => {
    await render(wrap(<Toggle label="Power" value onChange={jest.fn()} />));
    const track = anim(screen.getByTestId('toggle-track'));
    expect([track.width, track.height]).toEqual([52, 32]);
    expect(anim(screen.getByTestId('toggle-thumb')).width).toBe(26);
  });

  it('recolours the track at once when the theme changes to dark', async () => {
    const toggle = <Toggle label="Power" value onChange={jest.fn()} />;
    const { rerender } = await render(wrap(toggle));
    expect(anim(screen.getByTestId('toggle-track')).backgroundColor).toBe(lightTokens.color.accent);
    await rerender(wrap(toggle, 'dark'));
    await settle();
    expect(anim(screen.getByTestId('toggle-track')).backgroundColor).toBe(darkTokens.color.accent);
  });

  it('an off track is ink2', async () => {
    await render(wrap(<Toggle label="Power" value={false} onChange={jest.fn()} />, 'dark'));
    expect(anim(screen.getByTestId('toggle-track')).backgroundColor).toBe(darkTokens.color.ink2);
  });
});

describe('SegmentedControl', () => {
  it('is a labelled group with a sliding thumb', async () => {
    const onChange = jest.fn();
    await render(
      wrap(<SegmentedControl label="Mode" options={SEGMENTS} value="a" onChange={onChange} />),
    );
    expect(screen.getByLabelText('Mode').props.accessibilityRole).toBe('radiogroup');
    expect(screen.getByTestId('segment-thumb')).toBeTruthy();
    expect(screen.getByLabelText('Auto').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByLabelText('Cool'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('recolours the thumb at once when the theme changes to dark', async () => {
    const seg = <SegmentedControl label="Mode" options={SEGMENTS} value="a" onChange={jest.fn()} />;
    const { rerender } = await render(wrap(seg));
    expect(anim(screen.getByTestId('segment-thumb')).backgroundColor).toBe(
      lightTokens.color.surface,
    );
    await rerender(wrap(seg, 'dark'));
    await settle();
    expect(anim(screen.getByTestId('segment-thumb')).backgroundColor).toBe(
      darkTokens.color.surface,
    );
  });
});

describe('Field', () => {
  it('shakes when shakeKey changes, not on mount', async () => {
    jest.useFakeTimers();
    try {
      const field = (k: number): ReactElement =>
        wrap(<Field label="Name" value="" onChangeText={jest.fn()} error="Bad" shakeKey={k} />);
      const { rerender } = await render(field(0));
      const x = (): number =>
        (anim(screen.getByTestId('field-shake')).transform as { translateX: number }[])[0]
          ?.translateX ?? 0;
      expect(x()).toBe(0);
      await rerender(field(1));
      await act(async () => {
        jest.advanceTimersByTime(40);
      });
      expect(x()).not.toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not shake under reduced motion', async () => {
    jest.useFakeTimers();
    try {
      const field = (k: number): ReactElement =>
        wrap(<Field label="Name" value="" onChangeText={jest.fn()} shakeKey={k} />, 'light', true);
      const { rerender } = await render(field(0));
      await rerender(field(1));
      await act(async () => {
        jest.advanceTimersByTime(40);
      });
      const x = (anim(screen.getByTestId('field-shake')).transform as { translateX: number }[])[0];
      expect(x?.translateX ?? 0).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('the input grows with the font instead of clipping', async () => {
    await render(wrap(<Field label="Name" value="" onChangeText={jest.fn()} />));
    const style = flat(screen.getByLabelText('Name').props.style);
    expect(style.minHeight).toBe(56);
    expect(style.height).toBeUndefined();
  });
});
