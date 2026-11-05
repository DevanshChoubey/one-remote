// Ported from aer-remote src/screens/settings/zones.ts (2026-11-04). The phone's own zone is
// phoneZone.ts here, and the labels live in src/screens/aer/format.ts.
const FALLBACK = [
  'UTC',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Africa/Johannesburg',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

// Engines often list the old name of a zone; people look for the current one.
const MODERN_NAMES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
};

function withModernNames(zones: string[]): string[] {
  const out = zones.includes('UTC') ? [...zones] : ['UTC', ...zones];
  for (const [old, modern] of Object.entries(MODERN_NAMES)) {
    if (out.includes(old) && !out.includes(modern)) out.push(modern);
  }
  return out.sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

/** Every IANA zone the phone knows, or a short list when the engine cannot enumerate them. */
export function listTimeZones(): string[] {
  if (typeof Intl.supportedValuesOf === 'function') {
    try {
      const zones = Intl.supportedValuesOf('timeZone');
      if (zones.length > 0) return withModernNames(zones);
    } catch {
      // Fall through to the short list.
    }
  }
  return FALLBACK;
}

/** Zones containing the query, ignoring case; spaces match underscores. An empty query keeps all. */
export function filterZones(zones: string[], query: string): string[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, '_');
  return q === '' ? zones : zones.filter((z) => z.toLowerCase().includes(q));
}

/** The zones with the given ones first (when they exist), then the rest in their order. */
export function zonesFirst(zones: string[], first: string[]): string[] {
  const head = first.filter((z, i) => z !== '' && first.indexOf(z) === i && zones.includes(z));
  return [...head, ...zones.filter((z) => !head.includes(z))];
}
