import { useCallback, useEffect, useRef, useState } from 'react';
import { aerProblem, useServices } from '@/services';
import type { AerInterval, AerProblem, AerView } from '@/services';
import { t } from '@/i18n';
import { useToast } from '@/ui';
import { isFreshFlat } from './cardLine';
import { problemCopy } from './format';
import { aerScreenState, isRefillLow } from './screenState';
import type { AerScreenState } from './screenState';
import { useAerView } from './useAerView';

/** The problems the screen holds as a banner; any other failure is a toast. */
const BANNER: readonly AerProblem[] = ['btoff', 'denied', 'away', 'busy', 'flat'];

export interface AerDevice {
  view: AerView;
  state: AerScreenState;
  problem: AerProblem | null;
  /** The last refresh in this visit succeeded, so the reading is what the dispenser said just now. */
  read: boolean;
  spray(): Promise<void>;
  setAuto(interval: AerInterval | null): Promise<void>;
  retry(): Promise<void>;
}

/**
 * One air freshener: the cached reading at once, a refresh on open (op `connecting`), then what
 * each action does. Results that arrive after unmount are ignored.
 */
export function useAerDevice(deviceId: string): AerDevice {
  const { aer } = useServices();
  const toast = useToast();
  const view = useAerView(deviceId);
  const [op, setOp] = useState<'connecting' | 'spraying' | null>('connecting');
  const [problem, setProblem] = useState<AerProblem | null>(null);
  const [read, setRead] = useState(false);
  // A different device starts over, connecting again (state adjusted during render, not in an effect).
  const [forId, setForId] = useState(deviceId);
  if (forId !== deviceId) {
    setForId(deviceId);
    setOp('connecting');
    setRead(false);
    setProblem(null);
  }
  const alive = useRef(true);
  /** True while a call runs; a second press is ignored, not queued. */
  const running = useRef(false);

  const fail = useCallback(
    (e: unknown): void => {
      if (!alive.current) return;
      const p = aerProblem(e);
      // The newest failure replaces the old banner: a toast-only problem leaves none behind.
      if (BANNER.includes(p)) {
        setProblem(p);
      } else {
        setProblem(null);
        toast.show(problemCopy(e).line, { kind: 'error' });
      }
    },
    [toast],
  );

  const run = useCallback(
    async (
      during: 'connecting' | 'spraying' | null,
      call: () => Promise<unknown>,
      onDone?: () => void,
      isRead = false,
    ): Promise<void> => {
      if (running.current) return;
      running.current = true;
      if (during) setOp(during);
      try {
        await call();
        if (alive.current) {
          setProblem(null);
          if (isRead) setRead(true);
          onDone?.();
        }
      } catch (e) {
        if (isRead && alive.current) setRead(false);
        fail(e);
      } finally {
        running.current = false;
        if (alive.current) setOp(null);
      }
    },
    [fail],
  );

  const retry = useCallback(
    () => run('connecting', () => aer.refresh(deviceId), undefined, true),
    [aer, deviceId, run],
  );

  useEffect(() => {
    alive.current = true;
    running.current = true;
    aer
      .refresh(deviceId)
      .then(
        () => {
          if (!alive.current) return;
          setProblem(null);
          setRead(true);
        },
        (e: unknown) => {
          if (alive.current) setRead(false);
          fail(e);
        },
      )
      .finally(() => {
        running.current = false;
        if (alive.current) setOp(null);
      });
    return () => {
      alive.current = false;
    };
  }, [aer, deviceId, fail]);

  const spray = useCallback(
    () =>
      run(
        'spraying',
        () => aer.sprayNow(deviceId),
        () => toast.show(t('aer.sprayed'), { kind: 'ok' }),
      ),
    [aer, deviceId, run, toast],
  );
  const setAuto = useCallback(
    (interval: AerInterval | null) => run(null, () => aer.setAutoSpray(deviceId, interval)),
    [aer, deviceId, run],
  );

  let state = aerScreenState(view, op, problem);
  // A flat reading stops Spray only while it is fresh; an old one is shown as when it was read.
  if (state === 'flat' && problem !== 'flat' && !isFreshFlat(view, new Date())) {
    state = isRefillLow(view) ? 'low' : 'ready';
  }
  return { view, state, problem, read, spray, setAuto, retry };
}
