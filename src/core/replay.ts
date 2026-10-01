import type { Engine } from './engine';
import type { Command, GameEvent, GameState } from './types';

/** JSON с отсортированными ключами: одинаковое состояние всегда даёт одинаковую строку. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Хеш значения (FNV-1a, 32 бита) по его стабильному JSON. */
export function hashValue(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Хеш состояния партии для сравнения партий в тестах и отладке. */
export function hashState(state: GameState): string {
  return hashValue(state);
}

export interface ReplayResult {
  state: GameState;
  events: GameEvent[];
  rejected: number;
}

/** Проигрывает журнал команд с начального состояния. */
export function replay(engine: Engine, commands: readonly Command[]): ReplayResult {
  let state = engine.initialState();
  const events: GameEvent[] = [];
  let rejected = 0;
  for (const command of commands) {
    const result = engine.apply(state, command);
    state = result.state;
    events.push(...result.events);
    if (result.rejected) rejected++;
  }
  return { state, events, rejected };
}

/**
 * Добавляет команду в журнал, склеивая подряд идущие `tick`: результат от этого не меняется
 * (см. `tick` в движке), а журнал не растёт с частотой кадров.
 */
export function appendCommand(log: Command[], command: Command): void {
  const last = log[log.length - 1];
  if (command.type === 'tick' && last?.type === 'tick') {
    log[log.length - 1] = { type: 'tick', dtMs: last.dtMs + command.dtMs };
  } else {
    log.push(command);
  }
}
