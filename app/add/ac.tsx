import { AddApplianceFlow } from '@/screens/add/appliance/AddApplianceFlow';
import { MatterStep } from '@/screens/add/appliance/MatterStep';

export default function AddAcRoute(): React.JSX.Element {
  return <AddApplianceFlow kind="ac" renderMatterStep={(p) => <MatterStep {...p} />} />;
}
