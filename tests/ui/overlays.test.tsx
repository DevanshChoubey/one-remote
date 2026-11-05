import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { Button, Mark, Menu, Sheet, ToastProvider, useToast } from '@/ui';

function wrap(
  node: ReactElement,
  opts: { scheme?: 'light' | 'dark'; reducedMotion?: boolean } = {},
): ReactElement {
  return (
    <ThemeProvider scheme={opts.scheme ?? 'light'} reducedMotion={opts.reducedMotion ?? true}>
      <ToastProvider>{node}</ToastProvider>
    </ThemeProvider>
  );
}

function Raise(props: {
  message: string;
  opts?: Parameters<ReturnType<typeof useToast>['show']>[1];
}): ReactElement {
  const toast = useToast();
  return <Button label="raise" onPress={() => toast.show(props.message, props.opts)} />;
}

describe('overlays', () => {
  describe('Toast', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('draws an error toast on the dark error colour with a line border', async () => {
      await render(wrap(<Raise message="Nope" opts={{ kind: 'error' }} />, { scheme: 'dark' }));
      await fireEvent.press(screen.getByLabelText('raise'));
      const style = StyleSheet.flatten(screen.getByTestId('toast').props.style);
      expect(style.backgroundColor).toBe(darkTokens.color.toastErrorBg);
      expect(style.borderWidth).toBe(1);
      expect(style.borderColor).toBe(darkTokens.color.line);
    });

    it('has no border in the light theme', async () => {
      await render(wrap(<Raise message="Hi" />));
      await fireEvent.press(screen.getByLabelText('raise'));
      const style = StyleSheet.flatten(screen.getByTestId('toast').props.style);
      expect(style.borderWidth).toBeUndefined();
      expect(style.backgroundColor).toBe(lightTokens.color.ink);
    });

    it('shows an action, calls it and dismisses', async () => {
      const onPress = jest.fn();
      await render(
        wrap(
          <Raise
            message="Failed"
            opts={{ kind: 'error', action: { label: 'Try again', onPress } }}
          />,
        ),
      );
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getByText('Try again')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Try again'));
      expect(onPress).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Failed')).toBeNull();
    });

    it.each([
      [20, 30],
      [34, 42],
    ])(
      'sits 30 px from the bottom edge, and 8 px above a bottom inset of %i (bottom %i)',
      async (inset, bottom) => {
        const { SafeAreaProvider } = jest.requireActual<
          typeof import('react-native-safe-area-context')
        >('react-native-safe-area-context');
        await render(
          <SafeAreaProvider
            initialMetrics={{
              frame: { x: 0, y: 0, width: 360, height: 800 },
              insets: { top: 24, left: 0, right: 0, bottom: inset },
            }}
          >
            {wrap(<Raise message="Hi" />)}
          </SafeAreaProvider>,
        );
        await fireEvent.press(screen.getByLabelText('raise'));
        expect(StyleSheet.flatten(screen.getByTestId('toast').props.style).bottom).toBe(bottom);
      },
    );

    it('speaks an error toast: assertive live region and a screen-reader announcement', async () => {
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      await render(wrap(<Raise message="Nope" opts={{ kind: 'error' }} />));
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getByTestId('toast').props.accessibilityLiveRegion).toBe('assertive');
      expect(announce).toHaveBeenCalledWith('Nope');
      announce.mockRestore();
    });

    it('on Android leaves an error toast to the live region, so it is spoken once', async () => {
      jest.replaceProperty(Platform, 'OS', 'android');
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      await render(wrap(<Raise message="Nope" opts={{ kind: 'error' }} />));
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getByTestId('toast').props.accessibilityLiveRegion).toBe('assertive');
      expect(announce).not.toHaveBeenCalled();
      announce.mockRestore();
      jest.restoreAllMocks();
    });

    it('is not taken by a mounted but closed Sheet', async () => {
      await render(
        wrap(
          <>
            <Raise message="Saved" />
            <Sheet open={false} onClose={jest.fn()} title="Inputs" testID="sheet">
              <Button label="x" onPress={jest.fn()} />
            </Sheet>
          </>,
        ),
      );
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getAllByTestId('toast')).toHaveLength(1);
      expect(screen.queryByTestId('sheet')).toBeNull();
    });

    it('is drawn once, inside the Sheet window while a Sheet is open', async () => {
      const make = (open: boolean) =>
        wrap(
          <>
            <Raise message="Saved" />
            <Sheet open={open} onClose={jest.fn()} title="Inputs" testID="sheet">
              <Button label="x" onPress={jest.fn()} />
            </Sheet>
          </>,
        );
      const view = await render(make(true));
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getAllByTestId('toast')).toHaveLength(1);
      expect(within(screen.getByTestId('sheet')).getByTestId('toast')).toBeTruthy();
      // The Sheet goes: the root host takes the same toast over.
      await view.rerender(make(false));
      expect(screen.getAllByTestId('toast')).toHaveLength(1);
      expect(screen.getByText('Saved')).toBeTruthy();
    });

    it('plays its exit inside the last fast of its time and is gone at the end', async () => {
      await render(wrap(<Raise message="Bye" />, { reducedMotion: false }));
      await fireEvent.press(screen.getByLabelText('raise'));
      expect(screen.getByText('Bye')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(3900);
      });
      expect(screen.getByText('Bye')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
      expect(screen.queryByText('Bye')).toBeNull();
    });
  });

  describe('Sheet', () => {
    it('draws its panel above the scrim', async () => {
      await render(
        wrap(
          <Sheet open onClose={jest.fn()} title="Inputs" testID="sheet">
            <Button label="x" onPress={jest.fn()} />
          </Sheet>,
        ),
      );
      // The scrim is the floating box holding the full-screen close target; the panel holds the title.
      const scrim = screen.getAllByLabelText('Close')[0]?.parent?.parent;
      const panel = screen.getByText('Inputs').parent?.parent?.parent;
      const z = (n: typeof scrim): number => StyleSheet.flatten(n?.props.style)?.zIndex ?? 0;
      expect(z(panel)).toBeGreaterThanOrEqual(z(scrim));
      expect(StyleSheet.flatten(panel?.props.style)?.position).toBe('absolute');
    });

    it('closes from Android back exactly once, even when back is pressed again during the exit', async () => {
      jest.useFakeTimers();
      const onClose = jest.fn();
      const make = (open: boolean) =>
        wrap(
          <Sheet open={open} onClose={onClose} title="Inputs" testID="sheet">
            <Button label="x" onPress={jest.fn()} />
          </Sheet>,
          { reducedMotion: false },
        );
      const view = await render(make(true));
      await act(async () => {
        screen.getByTestId('sheet').props.onRequestClose();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      await view.rerender(make(false));
      await act(async () => {
        screen.getByTestId('sheet').props.onRequestClose();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('ignores the scrim, close button and back while its exit plays', async () => {
      jest.useFakeTimers();
      const onClose = jest.fn();
      const make = (open: boolean) =>
        wrap(
          <Sheet open={open} onClose={onClose} title="Inputs" testID="sheet">
            <Button label="x" onPress={jest.fn()} />
          </Sheet>,
          { reducedMotion: false },
        );
      const view = await render(make(true));
      await view.rerender(make(false));
      await act(async () => {
        screen.getByTestId('sheet').props.onRequestClose();
        screen.getByTestId('sheet').props.onRequestClose();
      });
      await fireEvent.press(screen.getAllByLabelText('Close')[0]!);
      await fireEvent.press(screen.getAllByLabelText('Close')[1]!);
      expect(onClose).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('puts its body in a scroll view and keeps the title, footer and body', async () => {
      await render(
        wrap(
          <Sheet
            open
            onClose={jest.fn()}
            title="Inputs"
            footer={<Button label="Done" onPress={jest.fn()} />}
          >
            <Button label="body" onPress={jest.fn()} />
          </Sheet>,
          { scheme: 'dark' },
        ),
      );
      expect(screen.getByText('Inputs')).toBeTruthy();
      expect(screen.getByLabelText('Done')).toBeTruthy();
      expect(screen.getByLabelText('body')).toBeTruthy();
      expect(JSON.stringify(screen.toJSON())).toContain('RCTScrollView');
    });

    it('keeps playing its exit before unmounting when closed with full motion', async () => {
      jest.useFakeTimers();
      const view = await render(
        wrap(
          <Sheet open onClose={jest.fn()} title="Inputs">
            <Button label="body" onPress={jest.fn()} />
          </Sheet>,
          { reducedMotion: false },
        ),
      );
      await view.rerender(
        wrap(
          <Sheet open={false} onClose={jest.fn()} title="Inputs">
            <Button label="body" onPress={jest.fn()} />
          </Sheet>,
          { reducedMotion: false },
        ),
      );
      expect(screen.getByText('Inputs')).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(screen.queryByText('Inputs')).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('Sheet onClosed', () => {
    const body = <Button label="body" onPress={jest.fn()} />;
    it('fires after the exit animation with full motion, not before', async () => {
      jest.useFakeTimers();
      const onClosed = jest.fn();
      const make = (open: boolean) =>
        wrap(
          <Sheet open={open} onClose={jest.fn()} onClosed={onClosed} title="Inputs">
            {body}
          </Sheet>,
          { reducedMotion: false },
        );
      const view = await render(make(true));
      await view.rerender(make(false));
      expect(onClosed).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(onClosed).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('does not fire for a sheet that never opened, nor on a motion change while shut', async () => {
      jest.useFakeTimers();
      const onClosed = jest.fn();
      const make = (reducedMotion: boolean) =>
        wrap(
          <Sheet open={false} onClose={jest.fn()} onClosed={onClosed} title="Inputs">
            {body}
          </Sheet>,
          { reducedMotion },
        );
      const view = await render(make(false));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      await view.rerender(make(true));
      await view.rerender(make(false));
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      expect(onClosed).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('fires at once under reduced motion, and not when it never opened', async () => {
      const onClosed = jest.fn();
      const make = (open: boolean) =>
        wrap(
          <Sheet open={open} onClose={jest.fn()} onClosed={onClosed} title="Inputs">
            {body}
          </Sheet>,
        );
      const view = await render(make(false));
      expect(onClosed).not.toHaveBeenCalled();
      await view.rerender(make(true));
      await view.rerender(make(false));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Menu', () => {
    const items = [
      { key: 'a', label: 'Light', onPress: jest.fn() },
      { key: 'b', label: 'Dark', onPress: jest.fn(), current: true },
    ];

    it('opens 4 px under the bar and grows past 220 px for a long label, within the gutters', async () => {
      await render(wrap(<Menu open onClose={jest.fn()} items={items} testID="menu" />));
      const style = StyleSheet.flatten(screen.getByTestId('menu').props.style);
      expect(style.top).toBe(68);
      expect(style.width).toBeUndefined();
      expect(style.maxWidth).toBeGreaterThanOrEqual(220);
    });

    it('under reduced motion renders its items with no transform', async () => {
      await render(wrap(<Menu open onClose={jest.fn()} items={items} testID="menu" />));
      expect(screen.getByLabelText('Light')).toBeTruthy();
      expect(StyleSheet.flatten(screen.getByTestId('menu').props.style).transform).toBeUndefined();
    });

    it('under full motion starts at scale 0.9 and closes from Android back once', async () => {
      const onClose = jest.fn();
      await render(
        wrap(<Menu open onClose={onClose} items={items} testID="menu" />, { reducedMotion: false }),
      );
      const style = StyleSheet.flatten(screen.getByTestId('menu').props.style);
      expect(style.transform).toEqual(expect.arrayContaining([{ scale: 0.9 }]));
      await act(async () => {
        screen.getByTestId('menu-modal').props.onRequestClose();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('fires onClosed after its exit, and ignores a pick made during the exit', async () => {
      jest.useFakeTimers();
      const onClosed = jest.fn();
      const pick = jest.fn();
      const its = [{ key: 'a', label: 'Light', onPress: pick }];
      const make = (open: boolean) =>
        wrap(
          <Menu open={open} onClose={jest.fn()} onClosed={onClosed} items={its} testID="menu" />,
          {
            reducedMotion: false,
          },
        );
      const view = await render(make(true));
      await view.rerender(make(false));
      expect(onClosed).not.toHaveBeenCalled();
      await fireEvent.press(screen.getByLabelText('Light'));
      expect(pick).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(onClosed).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it('fires onClosed at once under reduced motion', async () => {
      const onClosed = jest.fn();
      const make = (open: boolean) =>
        wrap(<Menu open={open} onClose={jest.fn()} onClosed={onClosed} items={items} />);
      const view = await render(make(true));
      await view.rerender(make(false));
      expect(onClosed).toHaveBeenCalledTimes(1);
    });

    it('ignores back while its exit plays, then unmounts', async () => {
      jest.useFakeTimers();
      const onClose = jest.fn();
      const view = await render(
        wrap(<Menu open onClose={onClose} items={items} testID="menu" />, { reducedMotion: false }),
      );
      await view.rerender(
        wrap(<Menu open={false} onClose={onClose} items={items} testID="menu" />, {
          reducedMotion: false,
        }),
      );
      expect(screen.getByTestId('menu')).toBeTruthy();
      await act(async () => {
        screen.getByTestId('menu-modal').props.onRequestClose();
      });
      await act(async () => {
        jest.advanceTimersByTime(400);
      });
      expect(screen.queryByTestId('menu')).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('Mark', () => {
    it('glows with the accent at 40%, as the mock', async () => {
      await render(wrap(<Mark />));
      const style = StyleSheet.flatten(screen.getByTestId('mark').props.style);
      expect(style.boxShadow).toBe(`0px 14px 34px ${lightTokens.color.accent}66`);
      expect(style.borderRadius).toBe(lightTokens.radius.art);
    });

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('takes a testID and defaults to "mark"', async () => {
      await render(
        wrap(
          <>
            <Mark />
            <Mark testID="other" />
          </>,
        ),
      );
      expect(screen.getByTestId('mark')).toBeTruthy();
      expect(screen.getByTestId('other')).toBeTruthy();
    });

    it('calls onDone at once under reduced motion', async () => {
      const onDone = jest.fn();
      await render(wrap(<Mark animate onDone={onDone} />));
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it('calls onDone once after about 960 ms with full motion', async () => {
      const onDone = jest.fn();
      await render(wrap(<Mark animate onDone={onDone} />, { reducedMotion: false }));
      expect(onDone).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1200);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });
});
