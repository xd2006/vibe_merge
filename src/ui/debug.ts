import { cellOf } from '@/core';
import type { GameSession } from './session';

/**
 * Отладочный хук dev-сборки: `window.__vibeMerge`. Нужен e2e-тестам и для ручной отладки
 * из консоли браузера; в production-сборку не попадает.
 */
export function exposeDebugHook(session: GameSession): () => void {
  if (!import.meta.env.DEV) return () => {};
  const hook = {
    session,
    /** Содержимое доски: `{ "x,y": "wood:2" }`. */
    cells(): Record<string, string> {
      const { board } = session.state;
      const out: Record<string, string> = {};
      board.cells.forEach((e, i) => {
        if (!e) return;
        const { x, y } = cellOf(board, i);
        out[`${x},${y}`] =
          e.kind === 'item'
            ? `${e.bubble ? 'bubble:' : ''}${e.chain}:${e.level}`
            : e.kind === 'lock'
              ? `lock:${e.chain}:${e.level}`
              : `${e.generator}:${e.level}`;
      });
      return out;
    },
  };
  (window as unknown as { __vibeMerge?: typeof hook }).__vibeMerge = hook;
  return () => {
    delete (window as unknown as { __vibeMerge?: typeof hook }).__vibeMerge;
  };
}
