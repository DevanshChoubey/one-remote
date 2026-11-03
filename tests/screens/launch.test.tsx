import { act, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { t } from '@/i18n';
import { LaunchOverlay } from '@/screens/launch/LaunchOverlay';
import { stackOptions, SHEET_ROUTE_OPTIONS } from '@/screens/navigation';
import { darkTokens, lightTokens, ThemeProvider } from '@/theme';
import { createMotion } from '@/theme/motion';

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
}));

function wrap(node: ReactElement, reducedMotion: boolean, scheme: 'light' | 'dark' = 'light') {
  return (
    <ThemeProvider scheme={scheme} reducedMotion={reducedMotion}>
      {node}
    </ThemeProvider>
  );
}

describe('navigation options', () => {
  it('fades under reduced motion', () => {
    const o = stackOptions(lightTokens, createMotion(lightTokens.motion, true));
    expect(o.animation).toBe('fade');
    expect(o.headerShown).toBe(false);
    expect(o.contentStyle).toEqual({ backgroundColor: lightTokens.color.bg });
  });

  it('slides from the right over 380 ms otherwise, on the dark background in dark', () => {
    const o = stackOptions(darkTokens, createMotion(darkTokens.motion, false));
    expect(o.animation).toBe('slide_from_right');
    expect(o.animationDuration).toBe(380);
    expect(o.contentStyle).toEqual({ backgroundColor: darkTokens.color.bg });
  });

  it('presents the sheet route as a transparent modal with no transition', () => {
    expect(SHEET_ROUTE_OPTIONS).toEqual({ presentation: 'transparentModal', animation: 'none' });
  });
});

describe('LaunchOverlay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the app name and tagline while not ready, in dark too', async () => {
    await render(wrap(<LaunchOverlay ready={false} />, false, 'dark'));
    expect(screen.getByText(t('common.tagline'))).toBeTruthy();
    expect(screen.getByText(t('common.appName'))).toBeTruthy();
    expect(screen.getByTestId('mark')).toBeTruthy();
  });

  it('stays while the mark is still drawing even when ready', async () => {
    await render(wrap(<LaunchOverlay ready />, false));
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(screen.getByTestId('launch-overlay')).toBeTruthy();
  });

  it('leaves after the mark has drawn and the data is ready', async () => {
    await render(wrap(<LaunchOverlay ready />, false));
    await act(async () => {
      jest.advanceTimersByTime(1100);
    });
    // The mark has drawn by now; the fade then runs for 160 ms.
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('launch-overlay')).toBeNull();
  });

  it('under reduced motion is gone 160 ms after ready', async () => {
    await render(wrap(<LaunchOverlay ready />, true));
    await act(async () => {
      jest.advanceTimersByTime(160);
    });
    expect(screen.queryByTestId('launch-overlay')).toBeNull();
  });

  it('forces itself away after 3 s even if never ready and the mark never reports', async () => {
    await render(wrap(<LaunchOverlay ready={false} />, false));
    await act(async () => {
      jest.advanceTimersByTime(2900);
    });
    expect(screen.getByTestId('launch-overlay')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId('launch-overlay')).toBeNull();
  });

  it('is labelled while it covers the app', async () => {
    await render(wrap(<LaunchOverlay ready={false} />, true));
    expect(screen.getByLabelText(t('common.loading'))).toBeTruthy();
  });

  it('waits for ready', async () => {
    const view = await render(wrap(<LaunchOverlay ready={false} />, true));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId('launch-overlay')).toBeTruthy();
    await view.rerender(wrap(<LaunchOverlay ready />, true));
    await act(async () => {
      jest.advanceTimersByTime(160);
    });
    expect(screen.queryByTestId('launch-overlay')).toBeNull();
  });

  it('reports once that it has gone, so the gate above it can unmount', async () => {
    const onGone = jest.fn();
    await render(wrap(<LaunchOverlay ready onGone={onGone} />, true));
    expect(onGone).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(3200);
    });
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});
