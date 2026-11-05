import { useLocalSearchParams } from 'expo-router';
import { DeviceSheet } from '@/screens/device/DeviceSheet';

export default function DeviceSheetRoute(): React.JSX.Element {
  const { id, repair } = useLocalSearchParams<{ id: string; repair?: string }>();
  return <DeviceSheet deviceId={id} repair={repair === '1'} />;
}
