import { useLocalSearchParams } from 'expo-router';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';

/** Stub until the add-an-air-freshener flow replaces it. */
export default function AddAerRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <PlaceholderRemote id={id ?? ''} />;
}
