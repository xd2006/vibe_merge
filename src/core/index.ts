/** Игровое ядро: состояние, команды, правила, seeded RNG, логическое время, журнал событий. Без DOM и графики. */
export { createEngine, type Engine } from './engine';
export {
  ConfigError,
  chainLevel,
  compileRules,
  generatorLevel,
  isFinalItem,
  itemValue,
  type ChainLevelRules,
  type ChainRules,
  type CollectRules,
  type GeneratorLevelRules,
  type GeneratorRules,
  type RewardRules,
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
export { cellOf, cellState, entityAt, indexOf, inBoard, isFreeCell, isOpenCell } from './board';
export { subjectKey, subjectOf } from './context';
export { popCost } from './systems/bubbles';
export { skipCooldownCost } from './systems/generators';
export { orderStatus, type RequirementStatus } from './systems/orders';
export { availableActions, type AvailableActions } from './systems/storage';
export { reachableNow, type Reachable } from './reach';
export * from './types';
