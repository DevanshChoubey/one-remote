import { render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { lightTokens, ThemeProvider } from '@/theme';
import { Chip, Field, Screen, Spinner, Txt } from '@/ui';

// Shared fixes that crossed the screen lanes, checked against docs/design/one-remote-mockup.html.

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
}

function wrap(node: ReactElement): ReactElement {
  return (
    <ThemeProvider scheme="light" reducedMotion>
      {node}
    </ThemeProvider>
  );
}

describe('Txt lineHeight', () => {
  it('sets the line height as a multiple of the font size', async () => {
    await render(
      wrap(
        <Txt size="banner" lineHeight={1.4}>
          Heads up
        </Txt>,
      ),
    );
    expect(screen.getByText('Heads up')).toHaveStyle({ fontSize: 14 });
    expect(flat(screen.getByText('Heads up').props.style).lineHeight).toBeCloseTo(19.6);
  });
});

describe('Screen largeTitle', () => {
  it('keeps the empty 48 px bar row without a back button', async () => {
    await render(
      wrap(
        <Screen title="Connecting" subtitle="Keep this phone near." largeTitle>
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.queryByTestId('screen-back')).toBeNull();
    expect(flat(screen.getByTestId('screen-bar').props.style).minHeight).toBe(48);
    expect(screen.getByText('Connecting')).toHaveStyle({ fontSize: 30 });
    expect(flat(screen.getByTestId('screen-subline').props.style).marginTop).toBe(6);
  });

  it('a paragraph subtitle sits 8 px under the title (the mock IP hint)', async () => {
    await render(
      wrap(
        <Screen title="IP" subtitle="On the TV" subtitleParagraph largeTitle onBack={jest.fn()}>
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(flat(screen.getByTestId('screen-subline').props.style).marginTop).toBe(8);
    expect(screen.getByText('On the TV')).toHaveStyle({ fontSize: 16 });
  });
});

describe('Field shake', () => {
  it('moves the label, the input and the error line together', async () => {
    await render(wrap(<Field label="Name" value="" onChangeText={jest.fn()} error="Bad" />));
    const shaking = within(screen.getByTestId('field-shake'));
    expect(shaking.getByText('Name')).toBeTruthy();
    expect(shaking.getByLabelText('Name')).toBeTruthy();
    expect(shaking.getByText('Bad')).toBeTruthy();
  });
});

describe('Chip label', () => {
  it('drops the font padding so a fallback glyph does not push the label down', async () => {
    await render(wrap(<Chip label="＋ New room" state="neutral" onPress={jest.fn()} />));
    const style = flat(screen.getByText('＋ New room').props.style);
    expect(style.includeFontPadding).toBe(false);
    expect(style.textAlignVertical).toBe('center');
  });
});

describe('Spinner xs', () => {
  it('is 14 px with a 2 px ring (the mock inline caption spinner)', async () => {
    await render(wrap(<Spinner size="xs" />));
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"width":14');
    expect(json).toContain('"height":14');
    expect(json).toContain('"borderWidth":2');
  });

  it('keeps 20 px by default', async () => {
    await render(wrap(<Spinner />));
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"width":20');
    expect(json).toContain('"borderWidth":2.5');
  });
});

describe('radius tokens', () => {
  it('has the fan skeleton hero radius', () => {
    expect(lightTokens.radius.hero).toBe(36);
  });
});
