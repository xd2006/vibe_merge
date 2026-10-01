/** Игровое ядро: состояние, команды, правила, seeded RNG, логическое время, журнал событий. Без DOM и графики. */
export { createEngine, type Engine } from './engine';
export {
  ConfigError,
  compileRules,
  itemValue,
  type ChainRules,
  type GeneratorRules,
  type Rules,
} from './rules';
export {
  appendCommand,
  hashState,
  hashValue,
  replay,
  stableStringify,
  type ReplayResult,
} from './replay';
export { cellOf, entityAt, indexOf, inBoard } from './board';
export { subjectKey, subjectOf } from './context';
export { popCost } from './systems/bubbles';
export { orderStatus, type RequirementStatus } from './systems/orders';
export { availableActions, type AvailableActions } from './systems/storage';
export { reachableNow, type Reachable } from './reach';
export * from './types';
