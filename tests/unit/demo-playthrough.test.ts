// Бот проходит демо-пресет: проверка, что механики этапа 2 складываются в игру
// (заказы → уровни → открытие замков), а не только работают по отдельности.
import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import { GameConfigSchema } from '@/config';
import { createEngine, type GameEvent } from '@/core';
import { botDecide } from './bot';

const engine = createEngine(GameConfigSchema.parse(demo));

describe('демо-пресет: бот проходит два уровня', () => {
  it('выполняет заказы, переходит на уровень 2, открывает замки и завершает уровень 2', () => {
    let state = engine.initialState();
    const events: GameEvent[] = [];
    let steps = 0;
    while (!state.level.completedAll && steps < 20_000) {
      const command = botDecide(engine.rules, state);
      const r = engine.apply(state, command);
      expect(r.rejected, JSON.stringify({ step: steps, command })).toBeUndefined();
      state = r.state;
      events.push(...r.events);
      steps++;
    }
    const count = (type: GameEvent['type']) => events.filter((e) => e.type === type).length;

    expect(state.level.completedAll).toBe(true);
    expect(count('level_completed')).toBe(2);
    expect(count('order_completed')).toBeGreaterThanOrEqual(13);
    // Три клетки группы zone2 и заблокированная клетка поля (0, 7).
    expect(count('lock_opened')).toBe(4);
    expect(events.some((e) => e.type === 'cheat_used')).toBe(false);
    // В процессе сработали пузыри и кулдауны генераторов — механики не простаивают.
    expect(count('generator_cooldown_started')).toBeGreaterThan(0);
    expect(count('item_spawned')).toBeGreaterThan(0);
  });
});
