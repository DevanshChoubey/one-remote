import { useLocalSearchParams } from 'expo-router';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';

/** Stub until the air freshener zone screen replaces it. */
export default function AerZoneRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderRemote id={id} />;
}
