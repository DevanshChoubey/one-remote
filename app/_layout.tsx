import { Stack } from 'expo-router';
import { useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { AppProviders } from '@/screens/AppProviders';
import { LaunchOverlay } from '@/screens/launch/LaunchOverlay';
import { useAerAlertOpen } from '@/screens/aer/useAerAlertOpen';
import { SHEET_ROUTE_OPTIONS, stackOptions } from '@/screens/navigation';
import { useHomeData } from '@/screens/shared/useHomeData';
import { useMotion, useTheme } from '@/theme';
import { Box } from '@/ui';

// Keep the native splash up until the launch overlay is on screen (it hides it).
SplashScreen.preventAutoHideAsync().catch(() => undefined);

/** Reads the home data here so a store change re-renders only the overlay, not the stack. */
function LaunchGate(): React.JSX.Element | null {
  const { loaded } = useHomeData();
  const [gone, setGone] = useState(false);
  // Once the overlay has gone the gate unmounts, so it stops re-reading the store.
  if (gone) return null;
  return <LaunchOverlay ready={loaded} onGone={() => setGone(true)} />;
}

function RootStack(): React.JSX.Element {
  const theme = useTheme();
  const motion = useMotion();
  useAerAlertOpen();
  return (
    <Box flex={1} bg="bg">
      <Stack screenOptions={stackOptions(theme, motion)}>
        <Stack.Screen name="device-sheet/[id]" options={SHEET_ROUTE_OPTIONS} />
      </Stack>
      <LaunchGate />
    </Box>
  );
}

export default function RootLayout(): React.JSX.Element {
  return (
    <AppProviders>
      <RootStack />
    </AppProviders>
  );
}
