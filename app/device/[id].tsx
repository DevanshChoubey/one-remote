import { useLocalSearchParams } from 'expo-router';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';

export default function DeviceRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderRemote id={id} />;
}
