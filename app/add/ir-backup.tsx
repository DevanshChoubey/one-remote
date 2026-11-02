import { useLocalSearchParams } from 'expo-router';
import { useKnownDevice } from '@/screens/device';
import { PlaceholderRemote } from '@/screens/device/PlaceholderRemote';
import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';

/** Runs the add flow from the brand step and puts the chosen IR link on the device `id`. */
export default function IrBackupRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const kind = useKnownDevice(id)?.kind;
  if (kind !== 'ac' && kind !== 'fan') return <PlaceholderRemote id={id} />;
  return <AddApplianceFlow kind={kind} replaceIrOn={id} />;
}
