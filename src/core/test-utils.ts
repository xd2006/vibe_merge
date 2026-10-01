// Общие заготовки для тестов ядра.
import { GameConfigSchema, type GameConfigInput } from '@/config';
import { createEngine } from './engine';
import { entityAt } from './board';
import type { Command, GameState } from './types';

/** Минимальный корректный конфиг: доска 3×3, лесопилка в левом верхнем углу. */
export function baseConfig(): GameConfigInput {
  return {
    meta: { name: 'test', seed: 1 },
    energy: { max: 10, start: 10, regen: { amount: 1, intervalSec: 10 } },
    chains: [
      { id: 'wood', name: 'Дерево', levels: [{ name: 'w1' }, { name: 'w2' }, { name: 'w3' }] },
    ],
    generators: [
      {
        id: 'saw',
        name: 'Лесопилка',
        levels: [
          { energyCost: 1, produces: [{ chain: 'wood', level: 1, weight: 1 }] },
          { energyCost: 2, produces: [{ chain: 'wood', level: 2, weight: 1 }] },
        ],
      },
    ],
    board: {
      width: 3,
      height: 3,
      legend: {
        '.': null,
        S: { generator: 'saw', level: 1 },
        w: { item: 'wood', level: 1 },
        W: { item: 'wood', level: 2 },
        X: { item: 'wood', level: 3 },
      },
      layout: ['S..', '...', '...'],
    },
    levels: [{ id: 1, ordersRequired: 1 }],
    orders: {
      slots: 1,
      templates: [
        {
          id: 't',
          weight: 1,
          boardLevels: [1, 1],
          maxRequirements: 1,
          requirements: [{ chain: 'wood', level: 1 }],
        },
      ],
    },
  };
}

export function makeEngine(patch?: (c: GameConfigInput) => void) {
  const input = baseConfig();
  patch?.(input);
  return createEngine(GameConfigSchema.parse(input));
}

/** Применяет команды подряд; падает, если какая-то отклонена (кроме разрешённых через `allowReject`). */
export function run(engine: ReturnType<typeof makeEngine>, state: GameState, commands: Command[]) {
  const events = [];
  for (const c of commands) {
    const r = engine.apply(state, c);
    if (r.rejected) throw new Error(`Команда ${JSON.stringify(c)} отклонена: ${r.rejected}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Короткая запись содержимого клетки для проверок: `wood:2`, `saw:1`, `.`. */
export function at(state: GameState, x: number, y: number): string {
  const e = entityAt(state.board, { x, y });
  if (!e) return '.';
  return e.kind === 'item' ? `${e.chain}:${e.level}` : `${e.generator}:${e.level}`;
}
