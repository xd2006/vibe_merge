import { cellOf, cellState } from '@/core';
import type { GameSession } from './session';

/**
 * Отладочный хук dev-сборки: `window.__vibeMerge`. Нужен e2e-тестам и для ручной отладки
 * из консоли браузера; в production-сборку не попадает.
 */
export function exposeDebugHook(session: GameSession): () => void {
  if (!import.meta.env.DEV) return () => {};
  const hook = {
    session,
    /**
     * Содержимое доски: `{ "x,y": "wood:2" }`. Заблокированная клетка — `lock:wood:1`,
     * закрытая по уровню или «песком» — `closed:wood:1`; пузырь — `bubble:wood:2`.
     */
    cells(): Record<string, string> {
      const state = session.state;
      const out: Record<string, string> = {};
      state.board.cells.forEach((e, i) => {
        if (!e) return;
        const { x, y } = cellOf(state.board, i);
        const kind = cellState(state, i).kind;
        const prefix =
          kind === 'locked' || kind === 'group' ? 'lock:' : kind === 'open' ? '' : 'closed:';
        out[`${x},${y}`] =
          prefix +
          (e.kind === 'item'
            ? `${e.bubble ? 'bubble:' : ''}${e.chain}:${e.level}`
            : `${e.generator}:${e.level}`);
      });
      return out;
    },
  };
  (window as unknown as { __vibeMerge?: typeof hook }).__vibeMerge = hook;
  return () => {
    delete (window as unknown as { __vibeMerge?: typeof hook }).__vibeMerge;
  };
}
