/** Игровое ядро: состояние, команды, правила, seeded RNG, логическое время, журнал событий. Без DOM и графики. */
export { createEngine, type Engine } from './engine';
export {
  ConfigError,
  compileRules,
  type ChainRules,
  type GeneratorRules,
  type Rules,
} from './rules';
export { appendCommand, hashState, replay, stableStringify, type ReplayResult } from './replay';
export { cellOf, entityAt, indexOf, inBoard } from './board';
export * from './types';
