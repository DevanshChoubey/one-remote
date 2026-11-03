import { useLocalSearchParams } from 'expo-router';
import { useKnownDevice } from '@/screens/device';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { FanScreen } from '@/screens/appliance/FanScreen';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';
import { TvScreen } from '@/screens/tv/TvScreen';

/** One branch per kind; each lane replaces its own branch's line with its remote screen. */
export default function DeviceRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const kind = useKnownDevice(id)?.kind;
  switch (kind) {
    case 'tv':
      return <TvScreen deviceId={id} />;
    case 'ac':
      return <AcScreen deviceId={id} />;
    case 'fan':
      return <FanScreen deviceId={id} />;
    default:
      return <PlaceholderRemote id={id} />;
  }
}
