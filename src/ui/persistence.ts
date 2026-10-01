import type { GameConfig } from '@/config';
import { hashValue, type GameState } from '@/core';
import { readJSON, removeKey, writeJSON } from '@/platform';

const SAVE_KEY = 'vibe-merge.save.v1';

interface SaveFile {
  /** Хеш конфига: сохранение от другого конфига не загружается. */
  configHash: string;
  state: GameState;
  /** Реальное время сохранения (мс) — для офлайн-прогресса. */
  savedAt: number;
}

export const configHash = (config: GameConfig) => hashValue(config);

/** Сохранённая партия для этого конфига и сколько реального времени прошло с сохранения. */
export function loadGame(config: GameConfig): { state: GameState; elapsedMs: number } | null {
  const save = readJSON<SaveFile>(SAVE_KEY);
  if (!save || save.configHash !== configHash(config) || save.state?.version !== 1) return null;
  return { state: save.state, elapsedMs: Math.max(0, Date.now() - save.savedAt) };
}

export function saveGame(config: GameConfig, state: GameState): void {
  writeJSON(SAVE_KEY, {
    configHash: configHash(config),
    state,
    savedAt: Date.now(),
  } satisfies SaveFile);
}

export function clearGame(): void {
  removeKey(SAVE_KEY);
}
