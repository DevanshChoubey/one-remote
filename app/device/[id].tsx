import { useLocalSearchParams } from 'expo-router';
import { useKnownDevice } from '@/screens/device';
import { AerScreen } from '@/screens/aer/AerScreen';
import { AcScreen } from '@/screens/appliance/AcScreen';
import { FanScreen } from '@/screens/appliance/FanScreen';
import { useHomeData } from '@/screens/shared/useHomeData';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';
import { TvScreen } from '@/screens/tv/TvScreen';

/** One branch per kind; each lane replaces its own branch's line with its remote screen. */
export default function DeviceRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const kind = useKnownDevice(id)?.kind;
  const home = useHomeData();
  switch (kind) {
    case 'tv':
      return <TvScreen deviceId={id} />;
    case 'ac':
      return <AcScreen deviceId={id} />;
    case 'fan':
      return <FanScreen deviceId={id} />;
    case 'aer':
      return <AerScreen deviceId={id} />;
    default:
      // The hub may not have the device yet: only once the store has been read is it really gone.
      if (!home.loaded) return <PlaceholderRemote id={id} loading />;
      return <PlaceholderRemote id={id} />;
  }
}
