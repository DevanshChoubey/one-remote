import { Stack } from 'expo-router';
import { AppProviders } from '@/screens/AppProviders';

export default function RootLayout(): React.JSX.Element {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false }} />
    </AppProviders>
  );
}
