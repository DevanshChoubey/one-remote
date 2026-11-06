import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BrandInfo, Device, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Screen, Txt } from '@/ui';
import { saveLastSent } from '../../appliance/useLastSent';
import { newId } from '../../shared/newId';
import { useHomeData } from '../../shared/useHomeData';
import { useMiraieStatus } from '../../settings/MiraieSection';
import { NameRoomStep } from '../NameRoomStep';
import { BrandStep } from './BrandStep';
import { ConnectViaStep } from './ConnectViaStep';
import { IrTestStep } from './IrTestStep';
import { MiraieStep } from './MiraieStep';
import { NoCodesStep } from './NoCodesStep';
import { NoIrStep } from './NoIrStep';
import { GreeStep } from './GreeStep';
import {
  afterBrand,
  afterGree,
  afterMatter,
  afterMatterSkipped,
  afterMiraie,
  canOfferIrBackup,
  offersMiraie,
  suggestedName,
  withGreeBrand,
} from './flow';
import type { FlowEnv, FlowStep } from './flow';

export interface MatterStepProps {
  brandId: string;
  /** The device has joined: hand the link over at once, so leaving during the success hold loses nothing. */
  onLink(link: Extract<Link, { kind: 'matter' }>): void;
  /** The success hold is over: move to the next step. */
  onDone(link: Extract<Link, { kind: 'matter' }>): void;
  onSkip(): void;
}

export interface AddApplianceFlowProps {
  kind: 'ac' | 'fan';
  /** The Matter lane plugs its pairing step in here. Without it, Matter is not offered. */
  renderMatterStep?: (p: MatterStepProps) => ReactNode;
  /** A device id: IR backup mode. The flow ends by putting the chosen IR link on that device. */
  replaceIrOn?: string;
}

/** Add an AC or a fan: brand, (Matter), IR test, name. Steps are inserted by `flow.ts`. */
export function AddApplianceFlow(props: AddApplianceFlowProps): ReactElement {
  const router = useRouter();
  const { ir } = useServices();
  const data = useHomeData();
  if (props.replaceIrOn === undefined) return <Flow {...props} initial={{ name: 'brand' }} />;

  const device = data.devices.find((d) => d.id === props.replaceIrOn);
  if (!data.loaded) {
    return (
      <Screen title={t('addAppliance.brandTitle')} onBack={() => router.back()}>
        <Txt color="ink2" live>
          {t('addAppliance.loading')}
        </Txt>
      </Screen>
    );
  }
  if (!device) {
    return (
      <Screen title={t('addAppliance.brandTitle')} onBack={() => router.back()}>
        <Txt color="ink2" live>
          {t('home.notFound')}
        </Txt>
      </Screen>
    );
  }
  // A known brand starts at its IR test; otherwise the brand list.
  const existing = device.links.find((l) => l.kind === 'ir');
  const brand = existing?.kind === 'ir' ? ir.brandOf(existing.remoteId) : undefined;
  const initial: FlowStep = brand
    ? { name: 'irTest', brandId: brand.id, backup: false }
    : { name: 'brand' };
  return <Flow {...props} device={device} initial={initial} />;
}

interface FlowProps extends AddApplianceFlowProps {
  initial: FlowStep;
  device?: Device;
}

function Flow(props: FlowProps): ReactElement {
  const router = useRouter();
  const { ir, drivers, store, gree, prefs } = useServices();
  const [history, setHistory] = useState<FlowStep[]>([props.initial]);
  // The remote whose test presses the user confirmed: they changed the appliance.
  const tested = useRef<string | null>(null);
  /** Remembers what the test presses left the appliance in, as a send from its screen would. */
  const rememberTest = (d: Pick<Device, 'id' | 'links'>): void => {
    const remoteId = tested.current;
    if (!remoteId || !d.links.some((l) => l.kind === 'ir' && l.remoteId === remoteId)) return;
    const outcome = ir.testOutcome(remoteId);
    if (outcome.kind === 'fan') ir.seedFan(d.id, outcome.state);
    else ir.seedAc(d.id, outcome.state);
    saveLastSent(prefs, d.id, outcome);
  };
  // The link (Matter, Gree or MirAIe) an IR backup is added to.
  const [primaryLink, setPrimaryLink] = useState<Link | null>(null);
  const miraieOn = useMiraieStatus().enabled;
  const [failed, setFailed] = useState(false);
  const step = history[history.length - 1] ?? props.initial;
  const { kind, device } = props;

  // IR backup mode never binds a Wi-Fi unit.
  const greeAvailable =
    !device &&
    kind === 'ac' &&
    gree.available() &&
    drivers.some((d) => d.kind === 'gree' && d.available());
  const brands = kind === 'ac' ? withGreeBrand(ir.brands(kind), greeAvailable) : ir.brands(kind);
  const brandOf = (id: string): BrandInfo | undefined => brands.find((b) => b.id === id);
  const env: FlowEnv = {
    kind,
    irAvailable: ir.hasEmitter(),
    // IR backup mode never pairs Matter.
    matterAvailable:
      !device &&
      props.renderMatterStep !== undefined &&
      drivers.some((d) => d.kind === 'matter' && d.available()),
    greeAvailable,
    hasIrCodes: (id) => ir.candidates(id).length > 0,
    brandName: (id) => brandOf(id)?.name ?? id,
    // IR backup mode never offers the cloud either.
    miraieOn: !device && miraieOn,
  };

  // A commissioned device is in the fabric already: if the flow is left before it is named, it is
  // saved with its suggested name in the first room rather than lost (a factory reset otherwise).
  const [commissioned, setCommissioned] = useState<{
    link: Extract<Link, { kind: 'matter' }>;
    brandId: string;
  } | null>(null);
  const saved = useRef(false);
  const rescue = useRef<() => void>(() => undefined);
  useEffect(() => {
    rescue.current = (): void => {
      const c = commissioned;
      if (!c || saved.current) return;
      saved.current = true;
      Promise.all([store.rooms(), store.devices()])
        .then(([rooms, devices]) => {
          const room = [...rooms].sort((a, b) => a.order - b.order)[0];
          if (!room) return undefined;
          const order = devices
            .filter((d) => d.roomId === room.id)
            .reduce((m, d) => Math.max(m, d.order + 1), 0);
          return store.upsertDevice({
            id: newId(),
            kind,
            links: [c.link],
            name: suggestedName(c.brandId, env),
            roomId: room.id,
            order,
          });
        })
        .catch((e: unknown) => console.error('Could not save the new device', e));
    };
  });
  useEffect(() => () => rescue.current(), []);

  const go = (next: FlowStep): void => setHistory((h) => [...h, next]);
  const back = (): void => {
    if (history.length > 1) setHistory((h) => h.slice(0, -1));
    else router.back();
  };
  const home = (): void => router.dismissAll();

  /** IR backup mode: replace the device's ir link, or add one at the end, then go back to it. */
  const saveIr = (remoteId: string): void => {
    if (!device) return;
    const link: Link = { kind: 'ir', remoteId };
    setFailed(false);
    store
      .devices()
      .then((all) => {
        const current = all.find((d) => d.id === device.id) ?? device;
        const links = current.links.some((l) => l.kind === 'ir')
          ? current.links.map((l) => (l.kind === 'ir' ? link : l))
          : [...current.links, link];
        return store.upsertDevice({ ...current, links });
      })
      .then(
        // Pops the IR test and the device sheet, back to wherever the sheet was opened from.
        () => {
          rememberTest({ id: device.id, links: [link] });
          router.dismiss(2);
        },
        () => setFailed(true),
      );
  };

  const named = (links: Link[], brandId: string): FlowStep => ({
    name: 'name',
    links,
    suggestedName: suggestedName(brandId, env),
  });

  switch (step.name) {
    case 'brand':
      return (
        <BrandStep
          brands={brands}
          kind={kind}
          cloudBrands={brands.filter((b) => offersMiraie(b.id, env)).map((b) => b.id)}
          onPick={(b) => go(afterBrand(b, env))}
          onBack={back}
        />
      );
    case 'matter':
      return (
        <>
          {props.renderMatterStep?.({
            brandId: step.brandId,
            onLink: (link) => {
              setPrimaryLink(link);
              setCommissioned({ link, brandId: step.brandId });
            },
            onDone: (link) => {
              setPrimaryLink(link);
              go(afterMatter(step.brandId, link, env));
            },
            onSkip: () => go(afterMatterSkipped(step.brandId, env)),
          })}
        </>
      );
    case 'connectVia': {
      const brand = brandOf(step.brandId);
      return (
        <ConnectViaStep
          matter={(brand?.matter ?? false) && env.matterAvailable}
          onMatter={() => go({ name: 'matter', brandId: step.brandId })}
          onMiraie={() => go({ name: 'miraie', brandId: step.brandId })}
          onIr={() => go(afterMatterSkipped(step.brandId, env))}
          onBack={back}
        />
      );
    }
    case 'miraie': {
      const { brandId } = step;
      return (
        <MiraieStep
          canBackup={canOfferIrBackup(brandId, env)}
          onBack={back}
          onDone={(link, backup) => {
            setPrimaryLink(link);
            go(backup ? afterMiraie(brandId, link, env) : named([link], brandId));
          }}
        />
      );
    }
    case 'gree':
      return (
        <GreeStep
          onBack={back}
          onSkip={() => go(afterMatterSkipped(step.brandId, env))}
          onDone={(link) => {
            setPrimaryLink(link);
            go(afterGree(step.brandId, link, env));
          }}
        />
      );
    case 'irTest': {
      const { brandId, backup } = step;
      return (
        <>
          <IrTestStep
            kind={kind}
            brandName={brandOf(brandId)?.name ?? brandId}
            candidates={ir.candidates(brandId)}
            onBack={back}
            {...(failed ? { error: t('addAppliance.saveFailed') } : {})}
            // Skip: after a Matter, Gree or MirAIe link it names the device; otherwise there are no codes to save.
            onSkip={() =>
              backup && primaryLink
                ? go(named([primaryLink], brandId))
                : go({ name: 'noCodes', brandId, backup })
            }
            onResult={(result) => {
              if (result === 'none') return go({ name: 'noCodes', brandId, backup });
              tested.current = result;
              if (device) return saveIr(result);
              const ir1: Link = { kind: 'ir', remoteId: result };
              return go(named(backup && primaryLink ? [primaryLink, ir1] : [ir1], brandId));
            }}
          />
        </>
      );
    }
    case 'noCodes': {
      const carriesOn = step.backup && primaryLink !== null;
      return (
        <NoCodesStep
          kind={kind}
          carriesOn={carriesOn}
          onBack={back}
          onContinue={() => {
            if (carriesOn && primaryLink) return go(named([primaryLink], step.brandId));
            if (device) return router.back();
            return home();
          }}
        />
      );
    }
    case 'noIr': {
      const first = ir.candidates(step.brandId)[0];
      const brand = brandOf(step.brandId);
      return (
        <NoIrStep
          canScanMatter={(brand?.matter ?? false) && env.matterAvailable}
          canAddAnyway={first !== undefined}
          onBack={back}
          onScanMatter={() => go({ name: 'matter', brandId: step.brandId })}
          onAddAnyway={() => {
            // A guess; "Redo IR backup" in the device sheet fixes it on a phone with IR.
            if (first) go(named([{ kind: 'ir', remoteId: first.remoteId }], step.brandId));
          }}
        />
      );
    }
    case 'name':
      return (
        <NameRoomStep
          draft={{ kind, links: step.links }}
          suggestedName={step.suggestedName}
          onBack={back}
          onSaving={(saving) => {
            // The named save is under way: leaving now must not add a second, rescued copy.
            // If it fails, the rescue is armed again.
            saved.current = true;
            saving.catch(() => {
              saved.current = false;
            });
          }}
          onDone={(d) => {
            saved.current = true;
            rememberTest(d);
            home();
          }}
        />
      );
  }
}
