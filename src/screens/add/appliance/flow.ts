import type { BrandInfo, Link } from '@/core';
import { t } from '@/i18n';

export type FlowStep =
  | { name: 'brand' }
  | { name: 'matter'; brandId: string }
  | { name: 'irTest'; brandId: string; backup: boolean }
  | { name: 'noIr'; brandId: string }
  | { name: 'noCodes'; brandId: string; backup: boolean }
  | { name: 'name'; links: Link[]; suggestedName: string }
  // miraie lane
  | { name: 'connectVia'; brandId: string }
  | { name: 'miraie'; brandId: string };

export interface FlowEnv {
  kind: 'ac' | 'fan';
  irAvailable: boolean;
  matterAvailable: boolean;
  hasIrCodes(brandId: string): boolean;
  /** Used to suggest a name; the brand id stands in when missing. */
  brandName?(brandId: string): string;
  /** miraie lane: the opt-in MirAIe cloud connection is on (Settings). */
  miraieOn?: boolean;
}

/** miraie lane: brands whose Wi-Fi ACs MirAIe controls (Panasonic India). */
export const MIRAIE_BRANDS: readonly string[] = ['panasonic'];

/** miraie lane: the AC brand can be added through MirAIe on this phone now. */
export function offersMiraie(brandId: string, env: FlowEnv): boolean {
  return env.kind === 'ac' && env.miraieOn === true && MIRAIE_BRANDS.includes(brandId);
}

export function suggestedName(brandId: string, env: FlowEnv): string {
  const brand = env.brandName?.(brandId) ?? brandId;
  return t(env.kind === 'ac' ? 'addAppliance.suggestedAc' : 'addAppliance.suggestedFan', {
    brand,
  });
}

/** After the brand: Matter first when it has it and this build can pair, else IR, else say why not. */
export function afterBrand(b: BrandInfo, env: FlowEnv): FlowStep {
  // With the MirAIe opt-in on, a MirAIe brand asks how it connects (Matter, MirAIe or IR).
  if (offersMiraie(b.id, env)) return { name: 'connectVia', brandId: b.id };
  if (b.matter && env.matterAvailable) return { name: 'matter', brandId: b.id };
  return afterMatterSkipped(b.id, env);
}

/** Matter was not used (or skipped): IR if the phone has it, else the no-IR screen. */
export function afterMatterSkipped(brandId: string, env: FlowEnv): FlowStep {
  if (!env.irAvailable) return { name: 'noIr', brandId };
  if (!env.hasIrCodes(brandId)) return { name: 'noCodes', brandId, backup: false };
  return { name: 'irTest', brandId, backup: false };
}

/** After Matter paired (or a MirAIe AC was picked): offer an IR backup where the phone can send IR
 *  and we have codes. */
export function afterMatter(brandId: string, matterLink: Link, env: FlowEnv): FlowStep {
  if (env.irAvailable && env.hasIrCodes(brandId)) return { name: 'irTest', brandId, backup: true };
  return { name: 'name', links: [matterLink], suggestedName: suggestedName(brandId, env) };
}

/** miraie lane: an IR backup can be offered after the MirAIe AC is picked. */
export function canOfferIrBackup(brandId: string, env: FlowEnv): boolean {
  return env.irAvailable && env.hasIrCodes(brandId);
}
