import { useLocalSearchParams } from 'expo-router';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';

/** Stub until the air freshener schedule screen replaces it. */
export default function AerScheduleRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderRemote id={id} />;
}
