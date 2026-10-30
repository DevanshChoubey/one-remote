import { useRouter } from 'expo-router';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { BrandInfo, Device, Link } from '@/core';
import { t } from '@/i18n';
import { useServices } from '@/services';
import { Screen, Txt } from '@/ui';
import { useHomeData } from '../../shared/useHomeData';
import { NameRoomStep } from '../NameRoomStep';
import { BrandStep } from './BrandStep';
import { IrTestStep } from './IrTestStep';
import { NoCodesStep } from './NoCodesStep';
import { NoIrStep } from './NoIrStep';
import { afterBrand, afterMatter, afterMatterSkipped, suggestedName } from './flow';
import type { FlowEnv, FlowStep } from './flow';

export interface MatterStepProps {
  brandId: string;
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
      <Screen title={t('addAppliance.brandTitle')}>
        <Txt color="ink2">{t('addAppliance.loading')}</Txt>
      </Screen>
    );
  }
  if (!device) {
    return (
      <Screen title={t('addAppliance.brandTitle')} onBack={() => router.back()}>
        <Txt color="ink2">{t('home.notFound')}</Txt>
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
  const { ir, drivers, store } = useServices();
  const [history, setHistory] = useState<FlowStep[]>([props.initial]);
  const [matterLink, setMatterLink] = useState<Extract<Link, { kind: 'matter' }> | null>(null);
  const [failed, setFailed] = useState(false);
  const step = history[history.length - 1] ?? props.initial;
  const { kind, device } = props;

  const brands = ir.brands(kind);
  const brandOf = (id: string): BrandInfo | undefined => brands.find((b) => b.id === id);
  const env: FlowEnv = {
    kind,
    irAvailable: ir.hasEmitter(),
    // IR backup mode never pairs Matter.
    matterAvailable:
      !device &&
      props.renderMatterStep !== undefined &&
      drivers.some((d) => d.kind === 'matter' && d.available()),
    hasIrCodes: (id) => ir.candidates(id).length > 0,
    brandName: (id) => brandOf(id)?.name ?? id,
  };

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
        () => router.dismissTo(`/device/${device.id}`),
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
      return <BrandStep brands={brands} onPick={(b) => go(afterBrand(b, env))} onBack={back} />;
    case 'matter':
      return (
        <>
          {props.renderMatterStep?.({
            brandId: step.brandId,
            onDone: (link) => {
              setMatterLink(link);
              go(afterMatter(step.brandId, link, env));
            },
            onSkip: () => go(afterMatterSkipped(step.brandId, env)),
          })}
        </>
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
            {...(backup && matterLink ? { onSkip: () => go(named([matterLink], brandId)) } : {})}
            onResult={(result) => {
              if (result === 'none') return go({ name: 'noCodes', brandId, backup });
              if (device) return saveIr(result);
              const ir1: Link = { kind: 'ir', remoteId: result };
              return go(named(backup && matterLink ? [matterLink, ir1] : [ir1], brandId));
            }}
          />
          {failed ? <Txt live>{t('addAppliance.saveFailed')}</Txt> : null}
        </>
      );
    }
    case 'noCodes': {
      const carriesOn = step.backup && matterLink !== null;
      return (
        <NoCodesStep
          kind={kind}
          carriesOn={carriesOn}
          onBack={back}
          onContinue={() => {
            if (carriesOn && matterLink) return go(named([matterLink], step.brandId));
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
          onDone={home}
        />
      );
  }
}
