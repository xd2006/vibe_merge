import type { FormulaVariable } from '@/expr';

/** Какие переменные доступны формулам в каждом месте конфига. */
export const FORMULA_CONTEXTS = {
  /** `chains[].value` — ценность предмета. */
  chainValue: ['level'],
  /** `orders.templates[].rewards[].amount`, `levels[].reward[].amount`. */
  reward: ['totalValue', 'boardLevel', 'ordersDone'],
  /** `bubbles.popCost.formula`. */
  popCost: ['itemValue', 'level', 'boardLevel', 'ordersDone', 'baseCost'],
  /** `itemActions[].sell.amount`. */
  sell: ['itemValue', 'level', 'boardLevel', 'ordersDone'],
} as const satisfies Record<string, readonly FormulaVariable[]>;
