// Ported from aer-remote src/screens/add/useScan.ts (2026-11-04). Adapted: the `aer` service scans
// (it already hides the added devices), rows are keyed by bleId, and there is no label number.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useServices } from '@/services';
import type { FoundAer } from '@/services';

export type ScanStatus = 'scanning' | 'done' | 'error';

export interface AerScanState {
  /** Devices in range, in the order they were first found. */
  devices: FoundAer[];
  status: ScanStatus;
  error: unknown;
  /** True once the scan ran long enough with nothing found to suggest what to check. */
  showHelp: boolean;
  start: () => void;
  stop: () => void;
}

export const SCAN_MS = 15000;

/**
 * Scans for air fresheners that are not added yet; starts on mount, stops on unmount. Every
 * device is listed: a real dispenser does not advertise its service, and picking one checks it.
 */
export function useAerScan(): AerScanState {
  const { aer } = useServices();
  const [devices, setDevices] = useState<FoundAer[]>([]);
  const [status, setStatus] = useState<ScanStatus>('scanning');
  const [error, setError] = useState<unknown>(null);
  const [waited, setWaited] = useState(false);
  const active = useRef<{ stop(): void } | null>(null);
  const run = useRef(0);

  /** Ends the running scan without touching state (safe in cleanup). */
  const halt = useCallback((): void => {
    run.current += 1;
    active.current?.stop();
    active.current = null;
  }, []);

  /** Stops scanning and keeps the list on screen. */
  const stop = useCallback((): void => {
    halt();
    setStatus((s) => (s === 'scanning' ? 'done' : s));
  }, [halt]);

  /** Starts a scan; state is already in its "scanning, nothing found" shape. */
  const begin = useCallback((): void => {
    halt();
    const mine = run.current;
    const current = (): boolean => run.current === mine;
    const fail = (e: unknown): void => {
      if (!current()) return;
      setError(e);
      setStatus('error');
    };
    try {
      const handle = aer.scan((found) => {
        if (!current()) return;
        setDevices((list) =>
          list.some((d) => d.bleId === found.bleId)
            ? list.map((d) => (d.bleId === found.bleId ? found : d))
            : [...list, found],
        );
      }, SCAN_MS);
      active.current = handle;
      handle.done.then(() => {
        if (current()) setStatus('done');
      }, fail);
    } catch (e) {
      fail(e);
    }
  }, [aer, halt]);

  const start = useCallback((): void => {
    setDevices([]);
    setError(null);
    setWaited(false);
    setStatus('scanning');
    begin();
  }, [begin]);

  useEffect(() => {
    begin();
    return halt;
  }, [begin, halt]);

  useEffect(() => {
    if (status !== 'scanning') return undefined;
    const timer = setTimeout(() => setWaited(true), SCAN_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const showHelp = devices.length === 0 && status !== 'error' && (waited || status === 'done');
  return { devices, status, error, showHelp, start, stop };
}
