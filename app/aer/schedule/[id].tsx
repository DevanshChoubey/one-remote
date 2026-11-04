import { useLocalSearchParams } from 'expo-router';
import { ScheduleEditor } from '@/screens/aer/ScheduleEditor';

/** One air freshener schedule: `?index=<i>` edits that entry, none adds a new one. */
export default function AerScheduleRoute(): React.JSX.Element {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  return <ScheduleEditor deviceId={id} index={index === undefined ? undefined : Number(index)} />;
}
