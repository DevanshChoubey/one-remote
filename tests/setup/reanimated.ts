import { setUpTests } from 'react-native-reanimated';

setUpTests();

// Gesture Handler asks the Worklets UI runtime for a holder on a microtask; the web build used in
// Jest throws there, after the test finished. Nothing in Jest needs the binding.
jest.mock(
  'react-native-gesture-handler/lib/module/handlers/gestures/installUIRuntimeBindings',
  () => ({
    installUIRuntimeBindings: (): void => undefined,
  }),
);
