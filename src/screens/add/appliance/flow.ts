import type { BrandInfo, Link } from '@/core';
import { t } from '@/i18n';

export type FlowStep =
  | { name: 'brand' }
  | { name: 'matter'; brandId: string }
  | { name: 'gree'; brandId: string }
  | { name: 'irTest'; brandId: string; backup: boolean }
  | { name: 'noIr'; brandId: string }
  | { name: 'noCodes'; brandId: string; backup: boolean }
  | { name: 'name'; links: Link[]; suggestedName: string };

export interface FlowEnv {
  kind: 'ac' | 'fan';
  irAvailable: boolean;
  matterAvailable: boolean;
  /** A Gree Wi-Fi AC can be found and bound from this phone. */
  greeAvailable?: boolean;
  hasIrCodes(brandId: string): boolean;
  /** Used to suggest a name; the brand id stands in when missing. */
  brandName?(brandId: string): string;
}

export function suggestedName(brandId: string, env: FlowEnv): string {
  const brand = env.brandName?.(brandId) ?? brandId;
  return t(env.kind === 'ac' ? 'addAppliance.suggestedAc' : 'addAppliance.suggestedFan', {
    brand,
  });
}

/** After the brand: Matter (or Gree Wi-Fi) first when it has it and this build can pair, else IR, else say why not. */
export function afterBrand(b: BrandInfo, env: FlowEnv): FlowStep {
  if (b.matter && env.matterAvailable) return { name: 'matter', brandId: b.id };
  if (b.wifi === 'gree' && env.greeAvailable) return { name: 'gree', brandId: b.id };
  return afterMatterSkipped(b.id, env);
}

/** Matter was not used (or skipped): IR if the phone has it, else the no-IR screen. */
export function afterMatterSkipped(brandId: string, env: FlowEnv): FlowStep {
  if (!env.irAvailable) return { name: 'noIr', brandId };
  if (!env.hasIrCodes(brandId)) return { name: 'noCodes', brandId, backup: false };
  return { name: 'irTest', brandId, backup: false };
}

/** After Matter paired: offer an IR backup where the phone can send IR and we have codes. */
export function afterMatter(brandId: string, matterLink: Link, env: FlowEnv): FlowStep {
  if (env.irAvailable && env.hasIrCodes(brandId)) return { name: 'irTest', brandId, backup: true };
  return { name: 'name', links: [matterLink], suggestedName: suggestedName(brandId, env) };
}

/** After a Gree unit was bound: the same as after Matter (an IR backup where possible, then Name). */
export function afterGree(brandId: string, greeLink: Link, env: FlowEnv): FlowStep {
  return afterMatter(brandId, greeLink, env);
}

export const GREE_BRAND_ID = 'gree';

/**
 * The AC brand list with Gree's Wi-Fi path: the IR brand `gree` is marked Wi-Fi when it exists,
 * else a Wi-Fi-only Gree row is added at the end. Unchanged when Gree cannot be used.
 */
export function withGreeBrand(brands: BrandInfo[], greeAvailable: boolean): BrandInfo[] {
  if (!greeAvailable) return brands;
  if (brands.some((b) => b.id === GREE_BRAND_ID)) {
    return brands.map((b) => (b.id === GREE_BRAND_ID ? { ...b, wifi: 'gree' } : b));
  }
  return [
    ...brands,
    { id: GREE_BRAND_ID, name: t('gree.brandName'), kind: 'ac', matter: false, wifi: 'gree' },
  ];
}
