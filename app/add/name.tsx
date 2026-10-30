import { useLocalSearchParams, useRouter } from 'expo-router';
import { NameRoomStep } from '@/screens/add/NameRoomStep';

/**
 * The shared last step. Lane add flows can render NameRoomStep themselves, or push here with
 * `kind` and `name`; the links to save are then set by the caller's own screen, so this route
 * only serves as the placeholder entry.
 */
export default function NameRoute(): React.JSX.Element {
  const { kind, name } = useLocalSearchParams<{ kind?: string; name?: string }>();
  const router = useRouter();
  return (
    <NameRoomStep
      draft={{ kind: kind === 'tv' || kind === 'fan' ? kind : 'ac', links: [] }}
      suggestedName={name ?? ''}
      onBack={() => router.back()}
      onDone={() => router.dismissAll()}
    />
  );
}
