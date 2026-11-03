import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppProviders } from '@/screens/AppProviders';
import { LaunchOverlay } from '@/screens/launch/LaunchOverlay';
import { SHEET_ROUTE_OPTIONS, stackOptions } from '@/screens/navigation';
import { useHomeData } from '@/screens/shared/useHomeData';
import { useMotion, useTheme } from '@/theme';
import { Box } from '@/ui';

// Keep the native splash up until the launch overlay is on screen (it hides it).
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootStack(): React.JSX.Element {
  const theme = useTheme();
  const motion = useMotion();
  const { loaded } = useHomeData();
  return (
    <Box flex={1} bg="bg">
      <Stack screenOptions={stackOptions(theme, motion)}>
        <Stack.Screen name="device-sheet/[id]" options={SHEET_ROUTE_OPTIONS} />
      </Stack>
      <LaunchOverlay ready={loaded} />
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
