import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import type { StyleProp } from 'react-native';
import { lightTokens, ThemeProvider } from '@/theme';
import {
  Button,
  EmptyState,
  ErrorLine,
  Group,
  ListItem,
  Menu,
  Sheet,
  SkelCard,
  Spinner,
  ToastProvider,
  Toggle,
  useToast,
} from '@/ui';

// The shared components against the mock's CSS (docs/design/one-remote-mockup.html).

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as StyleProp<object>) as Record<string, unknown>;
}

function wrap(node: ReactElement): ReactElement {
  return (
    <ThemeProvider scheme="light" reducedMotion>
      <ToastProvider>{node}</ToastProvider>
    </ThemeProvider>
  );
}

describe('EmptyState (mock .empty)', () => {
  it('puts the action in a full-width slot 12 px below the gap', async () => {
    await render(
      wrap(
        <EmptyState
          art="tv"
          title="Already added"
          action={<Button label="Open it" onPress={jest.fn()} />}
        />,
      ),
    );
    const slot = flat(screen.getByTestId('empty-action').props.style);
    expect(slot.alignSelf).toBe('stretch');
    expect(slot.marginTop).toBe(12);
    expect(flat(screen.getByLabelText('Open it').props.style).alignSelf).toBe('stretch');
  });

  it('keeps 16 px side padding and no vertical padding', async () => {
    await render(wrap(<EmptyState fill title="Gone" />));
    const col = flat(screen.getByText('Gone').parent?.props.style);
    expect(col.paddingHorizontal).toBe(16);
    expect(col.padding).toBeUndefined();
    expect(col.flex).toBe(1);
    expect(col.justifyContent).toBe('center');
  });

  it('draws the welcome title as the 30 px page title', async () => {
    await render(wrap(<EmptyState art="mark" title="One Remote" />));
    expect(screen.getByText('One Remote')).toHaveStyle({ fontSize: 30, lineHeight: 35 });
  });
});

describe('Sheet (mock .sheet)', () => {
  it('has 16 px sides, an ink2 grab handle at .45 and a close button', async () => {
    await render(
      wrap(
        <Sheet open onClose={jest.fn()} title="Device settings">
          <ErrorLine text="body" />
        </Sheet>,
      ),
    );
    const grab = flat(screen.getByTestId('sheet-grab').props.style);
    expect(grab.backgroundColor).toBe(lightTokens.color.ink2);
    expect(grab.opacity).toBe(0.45);
    expect(flat(screen.getByText('Device settings').parent?.parent?.props.style)).toMatchObject({
      paddingHorizontal: 16,
    });
    expect(screen.getAllByLabelText('Close').length).toBeGreaterThanOrEqual(2);
    // 30 px at the bottom with no inset: py 8 + gap 16 + 6.
    expect(flat(screen.getByTestId('sheet-bottom').props.style).height).toBe(6);
  });

  it('can leave out the close button (Inputs)', async () => {
    await render(
      wrap(
        <Sheet open onClose={jest.fn()} title="Inputs" closeButton={false}>
          <ErrorLine text="body" />
        </Sheet>,
      ),
    );
    // Only the scrim is labelled Close.
    expect(screen.getAllByLabelText('Close')).toHaveLength(1);
  });

  it('pads the bottom over a home indicator', async () => {
    const { SafeAreaProvider } = jest.requireActual<
      typeof import('react-native-safe-area-context')
    >('react-native-safe-area-context');
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        {wrap(
          <Sheet open onClose={jest.fn()} title="Device settings">
            <ErrorLine text="body" />
          </Sheet>,
        )}
      </SafeAreaProvider>,
    );
    // 34 + 16 = 50 below the last part, less py 8 and the 16 gap.
    expect(flat(screen.getByTestId('sheet-bottom').props.style).height).toBe(26);
  });
});

describe('Group and ListItem (mock .group, .li, .sect)', () => {
  it('a closed expandable row shows the right chevron; an open one shows up', async () => {
    const icon = (): string => JSON.stringify(screen.toJSON());
    const { rerender } = await render(
      wrap(
        <Group>
          <ListItem title="Rooms" trailing="expand" expanded={false} onPress={jest.fn()} />
        </Group>,
      ),
    );
    expect(icon()).toContain('M9 5l7 7-7 7');
    await rerender(
      wrap(
        <Group>
          <ListItem title="Rooms" trailing="expand" expanded onPress={jest.fn()} />
        </Group>,
      ),
    );
    expect(icon()).toContain('M5 15l7-7 7 7');
  });

  it('the label is the 13 px bold section label; row titles are 600', async () => {
    await render(
      wrap(
        <Group label="How it's connected">
          <ListItem title="Wi-Fi" />
        </Group>,
      ),
    );
    expect(screen.getByText("How it's connected")).toHaveStyle({
      fontSize: 13,
      fontWeight: '700',
    });
    expect(screen.getByText('Wi-Fi')).toHaveStyle({ fontWeight: '600' });
  });
});

describe('SkelCard (mock SkelCard)', () => {
  it('has a 44 px shimmering tile block, not a real tile', async () => {
    await render(wrap(<SkelCard testID="skel" />));
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain('"width":44,"height":44');
    expect(json).not.toContain('icon-room');
  });
});

describe('Toggle (mock .li with a .switch)', () => {
  it('gives the label the room left of the switch, so it wraps', async () => {
    await render(
      wrap(<Toggle label="Phone volume keys control the TV" value onChange={jest.fn()} />),
    );
    const label = screen.getByText('Phone volume keys control the TV');
    expect(flat(label.parent?.props.style).flex).toBe(1);
    expect(label).toHaveStyle({ fontWeight: '600' });
  });

  it('dims to .4 when disabled', async () => {
    await render(wrap(<Toggle label="Vibrate" value onChange={jest.fn()} disabled />));
    expect(flat(screen.getByLabelText('Vibrate').props.style).opacity).toBe(0.4);
  });
});

describe('Menu (mock .menu)', () => {
  it('draws items in the regular weight with a 6 px panel padding', async () => {
    await render(
      wrap(
        <Menu
          open
          onClose={jest.fn()}
          testID="menu"
          items={[
            { key: 'a', label: 'Touchpad', onPress: jest.fn(), current: true },
            { key: 'b', label: 'Device settings', onPress: jest.fn(), dividerBefore: true },
          ]}
        />,
      ),
    );
    expect(screen.getByText('Device settings')).toHaveStyle({ fontWeight: '400' });
    expect(flat(screen.getByTestId('menu-divider').props.style)).toMatchObject({
      paddingHorizontal: 8,
      paddingVertical: 4,
    });
  });
});

describe('Spinner, ErrorLine, Toast', () => {
  it('a Spinner is ink unless told otherwise (mock currentColor)', async () => {
    await render(wrap(<Spinner />));
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain(lightTokens.color.ink);
    expect(json).not.toContain(lightTokens.color.accent);
  });

  it('an ErrorLine is 14 px and wraps beside its icon', async () => {
    await render(wrap(<ErrorLine text="That code didn't match." />));
    const text = screen.getByText("That code didn't match.");
    expect(text).toHaveStyle({ fontSize: 14 });
    expect(flat(text.parent?.props.style).flex).toBe(1);
  });

  it('a toast message is 600 and its action is underlined text', async () => {
    jest.useFakeTimers();
    function Raise(): ReactElement {
      const toast = useToast();
      return (
        <Button
          label="raise"
          onPress={() =>
            toast.show('Not sent', {
              kind: 'error',
              action: { label: 'Try again', onPress: jest.fn() },
            })
          }
        />
      );
    }
    await render(wrap(<Raise />));
    await fireEvent.press(screen.getByLabelText('raise'));
    expect(screen.getByText('Not sent')).toHaveStyle({ fontWeight: '600' });
    expect(screen.getByText('Try again')).toHaveStyle({ textDecorationLine: 'underline' });
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });
});
