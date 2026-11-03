import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { lightTokens, ThemeProvider } from '@/theme';
import { LinkLine, SpeedBars, Stepper } from '@/ui/appliance';

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
}

const wrap = (node: ReactElement): ReactElement => (
  <ThemeProvider scheme="light" reducedMotion>
    {node}
  </ThemeProvider>
);

describe('LinkLine, as the mock .linkline.btnlike', () => {
  const text = "Sent over IR · point the phone at the AC · how it's connected";

  it('is a full-width 14 px line whose last part is underlined', async () => {
    const onPress = jest.fn();
    await render(wrap(<LinkLine kind="irOnly" text={text} onPress={onPress} />));
    const button = screen.getByLabelText(text);
    expect(flat(button.props.style).alignSelf).toBe('stretch');
    const tail = screen.getByText("how it's connected");
    expect(flat(tail.props.style).textDecorationLine).toBe('underline');
    expect(flat(tail.props.style).fontSize).toBe(14);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('pads the fell-back line 8 by 14 on the warm fill', async () => {
    await render(wrap(<LinkLine kind="fellBack" text={text} onPress={jest.fn()} />));
    const st = flat(screen.getByTestId('link-line').props.style);
    expect([st.paddingVertical, st.paddingHorizontal]).toEqual([8, 14]);
    expect(st.backgroundColor).toBe(lightTokens.color.warmSoft);
  });

  it('underlines nothing without a press target', async () => {
    await render(wrap(<LinkLine kind="irOnly" text={text} />));
    expect(screen.queryByText("how it's connected")).toBeNull();
  });
});

describe('Stepper', () => {
  it('dims to .35 when disabled and drops the disc shadow (an octagon on Android)', async () => {
    await render(wrap(<Stepper icon="plus" label="Raise" onPress={jest.fn()} disabled />));
    expect(flat(screen.getByLabelText('Raise').props.style).opacity).toBe(0.35);
    const disc = flat(screen.getByTestId('stepper-plus').props.style);
    expect(disc.backgroundColor).toBe(lightTokens.color.surface);
    expect(disc.elevation).toBeUndefined();
  });

  it('keeps the disc shadow when enabled', async () => {
    await render(wrap(<Stepper icon="plus" label="Raise" onPress={jest.fn()} />));
    const disc = flat(screen.getByTestId('stepper-plus').props.style);
    expect(disc.elevation).toBe(lightTokens.shadow.card.elevation);
  });
});

describe('SpeedBars, as the mock .speed', () => {
  it('spaces the bars 10 apart and drops the ring of a lit bar', async () => {
    await render(
      wrap(<SpeedBars value={2} max={5} onPick={jest.fn()} labelFor={(n) => `Speed ${n}`} />),
    );
    expect(flat(screen.getByTestId('speed-bars').props.style).gap).toBe(10);
    expect(screen.queryByTestId('speed-ring-1')).toBeNull();
    expect(screen.queryByTestId('speed-ring-2')).toBeNull();
    expect(screen.getByTestId('speed-ring-3')).toBeTruthy();
    expect(flat(screen.getByText('3').props.style).fontSize).toBe(20);
  });
});
