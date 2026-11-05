import type { Remote } from '../catalogue';
import { LG_CAPS, lgAcFrames, type LgModel } from '../lgpl/lgAc';

// Most likely first: current Indian LG splits ship LG2 remotes (AKB74955603 and its siblings);
// the plain LG2 form and the old 6711A remote follow.
const MODELS: { model: LgModel; label: string }[] = [
  { model: 'akb74955603', label: 'LG AC remote AKB7495 / AKB7331 (newer)' },
  { model: 'akb75215403', label: 'LG AC remote AKB7521' },
  { model: 'lg6711a20083v', label: 'LG AC remote 6711A (older)' },
];

export const LG_REMOTES: Remote[] = MODELS.map(({ model, label }) => ({
  id: `lg-ac/${model}`,
  kind: 'ac',
  brandId: 'lg',
  label,
  caps: LG_CAPS[model],
  encode: (next, prev) => lgAcFrames(next, prev, model),
}));
