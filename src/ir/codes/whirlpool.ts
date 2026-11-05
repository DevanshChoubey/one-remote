import type { Remote } from '../catalogue';
import { WHIRLPOOL_CAPS, whirlpoolAcSignal, type WhirlpoolModel } from '../lgpl/whirlpoolAc';

// Most likely first: DG11J1-3A / DG11J1-04 (the library's default model), then DG11J1-91.
const MODELS: { model: WhirlpoolModel; id: string; label: string }[] = [
  { model: 'dg11j13a', id: 'dg11j1-3a', label: 'Whirlpool AC remote DG11J1-3A / DG11J1-04' },
  { model: 'dg11j191', id: 'dg11j1-91', label: 'Whirlpool AC remote DG11J1-91' },
];

export const WHIRLPOOL_REMOTES: Remote[] = MODELS.map(({ model, id, label }) => ({
  id: `whirlpool-ac/${id}`,
  kind: 'ac',
  brandId: 'whirlpool',
  label,
  caps: WHIRLPOOL_CAPS[model],
  encode: (next, prev) => whirlpoolAcSignal(next, prev, model),
}));
