import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { t } from '@/i18n';
import { darkTokens, ThemeProvider } from '@/theme';
import {
  Banner,
  Button,
  Chip,
  Field,
  Icon,
  ICON_NAMES,
  IconButton,
  Menu,
  ProgressBar,
  Screen,
  SegmentedControl,
  Sheet,
  ToastProvider,
  Toggle,
  useToast,
} from '@/ui';
import type { IconName } from '@/ui';

function wrap(node: ReactElement, scheme: 'light' | 'dark' = 'light'): ReactElement {
  return (
    <ThemeProvider scheme={scheme} reducedMotion>
      <ToastProvider>{node}</ToastProvider>
    </ThemeProvider>
  );
}

describe('shared component contracts', () => {
  it('has 41 icons and every one renders', async () => {
    expect(ICON_NAMES).toHaveLength(41);
    for (const name of ICON_NAMES) {
      await render(wrap(<Icon name={name as IconName} testID={`icon-${name}`} />));
      expect(screen.getByTestId(`icon-${name}`)).toBeTruthy();
    }
  });

  it('IconButton is a labelled button and reports expanded', async () => {
    await render(wrap(<IconButton icon="more" label="More" onPress={jest.fn()} expanded />));
    const b = screen.getByLabelText('More');
    expect(b.props.accessibilityRole).toBe('button');
    expect(b.props.accessibilityState.expanded).toBe(true);
  });

  it('Button danger renders; loading is busy and does not press', async () => {
    const onPress = jest.fn();
    await render(wrap(<Button label="Remove" variant="danger" onPress={onPress} />));
    expect(screen.getByLabelText('Remove')).toBeTruthy();
    await render(wrap(<Button label="Save it" loading onPress={onPress} />));
    const busy = screen.getByLabelText('Save it');
    expect(busy.props.accessibilityState.busy).toBe(true);
    await fireEvent.press(busy);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Chip with onToggle is a togglebutton and reports selected', async () => {
    await render(wrap(<Chip label="Living" state="selected" onToggle={jest.fn()} />));
    const c = screen.getByLabelText('Living');
    expect(c.props.accessibilityRole).toBe('togglebutton');
    expect(c.props.accessibilityState.selected).toBe(true);
  });

  it('Toggle is a switch mirroring value and flips on press', async () => {
    const onChange = jest.fn();
    await render(wrap(<Toggle label="Power" value onChange={onChange} />));
    const s = screen.getByLabelText('Power');
    expect(s.props.accessibilityRole).toBe('switch');
    expect(s.props.accessibilityState.checked).toBe(true);
    await fireEvent.press(s);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('SegmentedControl marks only the current option and reports changes', async () => {
    const onChange = jest.fn();
    await render(
      wrap(
        <SegmentedControl
          label="Mode"
          value="a"
          onChange={onChange}
          options={[
            { value: 'a', label: 'Cool' },
            { value: 'b', label: 'Dry' },
          ]}
        />,
      ),
    );
    expect(screen.getByLabelText('Cool').props.accessibilityRole).toBe('togglebutton');
    expect(screen.getByLabelText('Cool').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Dry').props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByLabelText('Dry'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('Field shows its error in a live region and labels the input', async () => {
    await render(wrap(<Field label="Name" value="" onChangeText={jest.fn()} error="Too short" />));
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByText('Too short').props.accessibilityLiveRegion).toBeTruthy();
  });

  it('ProgressBar is a progressbar with its value', async () => {
    await render(wrap(<ProgressBar value={0.5} label="Sending" />));
    const bar = screen.getByLabelText('Sending');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
  });

  describe('Toast', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    function Trigger(props: { first: string; second?: string }): ReactElement {
      const toast = useToast();
      return (
        <>
          <Button label="one" onPress={() => toast.show(props.first, { kind: 'ok' })} />
          {props.second ? (
            <Button label="two" onPress={() => toast.show(props.second ?? '')} />
          ) : null}
        </>
      );
    }

    it('shows, is replaced by the newest and disappears after 4 s', async () => {
      await render(wrap(<Trigger first="Saved" second="Moved up" />));
      await fireEvent.press(screen.getByLabelText('one'));
      expect(screen.getByText('Saved')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('two'));
      expect(screen.queryByText('Saved')).toBeNull();
      expect(screen.getByText('Moved up')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(4000);
      });
      expect(screen.queryByText('Moved up')).toBeNull();
    });

    it('clears its dismiss timer when the provider unmounts with a toast pending', async () => {
      const { unmount } = await render(wrap(<Trigger first="Saved" />));
      const set = jest.spyOn(global, 'setTimeout');
      const clear = jest.spyOn(global, 'clearTimeout');
      await fireEvent.press(screen.getByLabelText('one'));
      const dismiss = set.mock.results.find((_, i) => set.mock.calls[i]?.[1] === 4000)?.value;
      expect(dismiss).toBeDefined();
      await unmount();
      expect(clear).toHaveBeenCalledWith(dismiss);
      set.mockRestore();
      clear.mockRestore();
    });

    it('useToast throws outside the provider', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      await expect(renderHook(() => useToast())).rejects.toThrow(/ToastProvider/);
      error.mockRestore();
    });
  });

  describe('Sheet', () => {
    it('shows the title and closes from the close control and from Android back', async () => {
      const onClose = jest.fn();
      await render(
        wrap(
          <Sheet open onClose={onClose} title="Input" testID="sheet">
            <Button label="x" onPress={jest.fn()} />
          </Sheet>,
        ),
      );
      expect(screen.getByText('Input')).toBeTruthy();
      const closers = screen.getAllByLabelText(t('common.close'));
      expect(closers.length).toBeGreaterThanOrEqual(1);
      for (const closer of closers) await fireEvent.press(closer);
      expect(onClose).toHaveBeenCalledTimes(closers.length);
      await act(async () => {
        screen.getByTestId('sheet').props.onRequestClose();
      });
      expect(onClose).toHaveBeenCalledTimes(closers.length + 1);
    });

    it('renders nothing when closed', async () => {
      await render(
        wrap(
          <Sheet open={false} onClose={jest.fn()} title="Input">
            <Button label="x" onPress={jest.fn()} />
          </Sheet>,
        ),
      );
      expect(screen.queryByText('Input')).toBeNull();
      expect(screen.queryByLabelText(t('common.close'))).toBeNull();
    });
  });

  it('Menu lists items in order, marks the current one and closes from outside', async () => {
    const onClose = jest.fn();
    await render(
      wrap(
        <Menu
          open
          onClose={onClose}
          items={[
            { key: 'a', label: 'First', onPress: jest.fn(), current: true },
            { key: 'b', label: 'Second', onPress: jest.fn(), dividerBefore: true },
          ]}
        />,
      ),
    );
    const labels = screen.getAllByRole('button').map((b) => b.props.accessibilityLabel);
    expect(labels.indexOf('First')).toBeLessThan(labels.indexOf('Second'));
    expect(screen.getByLabelText('First').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Second').props.accessibilityState.selected).toBeUndefined();
    await fireEvent.press(screen.getByLabelText(t('common.close')));
    expect(onClose).toHaveBeenCalled();
  });

  it('Screen onBack keeps the screen-back control and its label', async () => {
    const onBack = jest.fn();
    await render(
      wrap(
        <Screen title="Name" onBack={onBack}>
          <Banner text="hi" />
        </Screen>,
      ),
    );
    const back = screen.getByTestId('screen-back');
    expect(back.props.accessibilityLabel).toBe(t('common.back'));
    await fireEvent.press(back);
    expect(onBack).toHaveBeenCalled();
  });

  it('Banner error uses the dark dangerSoft background in the dark theme', async () => {
    await render(wrap(<Banner tone="error" text="Broken" testID="b" />, 'dark'));
    expect(StyleSheet.flatten(screen.getByTestId('b').props.style).backgroundColor).toBe(
      darkTokens.color.dangerSoft,
    );
  });

  it('Chip without onToggle is a plain labelled label', async () => {
    function Probe(): ReactElement {
      const [n] = useState(1);
      return <Chip label={`n${n}`} state="neutral" />;
    }
    await render(wrap(<Probe />));
    expect(screen.getByLabelText('n1').props.accessibilityState.selected).toBe(false);
  });
});
