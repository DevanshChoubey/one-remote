import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme';
import { Button, Card, Chip, EmptyState, Screen, Toggle, Txt } from '@/ui';

// Stand-in that shows its behavior, so the tests can see where the keyboard handling sits.
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ behavior, children }: { behavior?: string; children: React.ReactNode }) => (
      <View testID={`keyboard-avoiding-${behavior ?? 'none'}`}>{children}</View>
    ),
  };
});

function wrap(node: React.ReactElement): React.ReactElement {
  return <ThemeProvider scheme="light">{node}</ThemeProvider>;
}

describe('ui kit', () => {
  it.each([false, true])(
    'Screen (scroll %s) keeps its content above the keyboard',
    async (scroll) => {
      await render(
        wrap(
          <Screen title="Name" scroll={scroll}>
            <Txt>body</Txt>
          </Screen>,
        ),
      );
      expect(screen.getAllByTestId('keyboard-avoiding-padding')).toHaveLength(1); // Jest runs as iOS
      expect(screen.getByText('body')).toBeTruthy();
    },
  );

  it('Screen shows a round Back button beside the title only when given onBack', async () => {
    const onBack = jest.fn();
    const { rerender } = await render(
      wrap(
        <Screen title="Name">
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.queryByLabelText('Back')).toBeNull();
    await rerender(
      wrap(
        <Screen title="Name" onBack={onBack}>
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.getByText('Name')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('Screen renders its footer outside the scrolling content', async () => {
    await render(
      wrap(
        <Screen title="Name" scroll footer={<Txt>pinned</Txt>}>
          <Txt>body</Txt>
        </Screen>,
      ),
    );
    expect(screen.getByText('pinned')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('Button fires onPress and is blocked while loading', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(wrap(<Button label="Power" onPress={onPress} />));
    await fireEvent.press(screen.getByLabelText('Power'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await rerender(wrap(<Button label="Power" onPress={onPress} loading />));
    await fireEvent.press(screen.getByLabelText('Power'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Toggle is a labelled switch that reports changes', async () => {
    const onChange = jest.fn();
    await render(wrap(<Toggle label="Mute" value={false} onChange={onChange} />));
    const el = screen.getByLabelText('Mute');
    expect(el.props.accessibilityRole).toBe('switch');
    expect(el.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(el);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getAllByLabelText('Mute')).toHaveLength(1);
  });

  it('Chip toggles and exposes selected through accessibility state', async () => {
    const onToggle = jest.fn();
    await render(wrap(<Chip label="Mon" state="selected" onToggle={onToggle} />));
    const el = screen.getByLabelText('Mon');
    expect(el.props.accessibilityRole).toBe('togglebutton');
    expect(el.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(el);
    expect(onToggle).toHaveBeenCalled();
  });

  it('Chip can be disabled: no press, and the state says so', async () => {
    const onToggle = jest.fn();
    await render(wrap(<Chip label="Wed" state="neutral" onToggle={onToggle} disabled />));
    await fireEvent.press(screen.getByLabelText('Wed'));
    expect(onToggle).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Wed').props.accessibilityState.disabled).toBe(true);
  });

  it('Chip without onToggle still exposes selected', async () => {
    await render(wrap(<Chip label="Tue" state="neutral" />));
    expect(screen.getByLabelText('Tue').props.accessibilityState.selected).toBe(false);
  });

  it('Button loading is busy', async () => {
    await render(wrap(<Button label="Save" onPress={() => undefined} loading />));
    expect(screen.getByLabelText('Save').props.accessibilityState.busy).toBe(true);
  });

  it('Card and EmptyState render their content', async () => {
    await render(
      wrap(
        <Card>
          <EmptyState title="Add your first device" body="Nothing here yet." />
        </Card>,
      ),
    );
    expect(screen.getByText('Add your first device')).toBeTruthy();
  });
});
