import type { Remote } from '../catalogue';
import { panasonicAcSignal, panasonicCaps, type PanasonicModel } from '../lgpl/panasonicAc';

const MODELS: PanasonicModel[] = ['dke', 'jke', 'nke', 'lke', 'rkr'];

export const PANASONIC_REMOTES: Remote[] = MODELS.map((model) => ({
  id: `panasonic-ac/${model}`,
  kind: 'ac',
  brandId: 'panasonic',
  label: `Panasonic ${model.toUpperCase()}`,
  caps: panasonicCaps(model),
  encode: (s) => panasonicAcSignal(s, model),
}));
