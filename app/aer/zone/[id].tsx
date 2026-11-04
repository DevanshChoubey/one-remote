import { useLocalSearchParams } from 'expo-router';
import { ZoneStep } from '@/screens/add/aer/ZoneStep';

/** The air freshener's home time zone, from its Device settings. */
export default function AerZoneRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ZoneStep edit deviceId={id} />;
}
