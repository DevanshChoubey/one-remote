/** The phone's time zone, as an IANA name; 'UTC' when the phone does not say. */
export function phoneZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
