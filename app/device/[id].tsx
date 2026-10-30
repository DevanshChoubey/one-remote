import { useLocalSearchParams } from 'expo-router';
import { useKnownDevice } from '@/screens/device';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';

/** One branch per kind; each lane replaces its own branch's line with its remote screen. */
export default function DeviceRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const kind = useKnownDevice(id)?.kind;
  switch (kind) {
    case 'tv':
      return <PlaceholderRemote id={id} kind="tv" />;
    case 'ac':
      return <AcScreen deviceId={id} />;
    case 'fan':
      return <PlaceholderRemote id={id} kind="fan" />;
    default:
      return <PlaceholderRemote id={id} />;
  }
}
