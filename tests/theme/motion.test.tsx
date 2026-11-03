import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { ThemeProvider, useMotion } from '@/theme';

function Probe(): ReactElement {
  const m = useMotion();
  return (
    <Text testID="p">
      {JSON.stringify({
        reduced: m.reduced,
        lift: m.lift,
        stagger: m.stagger,
        base: m.timing('base').duration,
        slow: m.timing('slow', 'enter').duration,
      })}
    </Text>
  );
}

function read(): Record<string, unknown> {
  return JSON.parse(String(screen.getByTestId('p').props.children)) as Record<string, unknown>;
}

describe('useMotion', () => {
  it('collapses lift and stagger when reduced motion is forced', async () => {
    await render(
      <ThemeProvider reducedMotion>
        <Probe />
      </ThemeProvider>,
    );
    expect(read()).toMatchObject({ reduced: true, lift: 0, stagger: 0 });
  });

  it('uses the full motion otherwise', async () => {
    await render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(read()).toMatchObject({ reduced: false, lift: 14, stagger: 45, base: 260, slow: 380 });
  });

  it('forces full motion when reducedMotion is false', async () => {
    await render(
      <ThemeProvider reducedMotion={false}>
        <Probe />
      </ThemeProvider>,
    );
    expect(read()).toMatchObject({ reduced: false, lift: 14 });
  });
});
