// Заказы не требуют специй, которых игрок не может получить на текущем уровне:
// цепочка из закрытой клетки без генератора или другого источника в заказы не попадает.
import { describe, expect, it } from 'vitest';
import { GameConfigSchema } from '@/config';
import { cellState, createEngine } from '@/core';
import spiceCore from '../../presets/spice-core.json';

describe('заказы пресета Core Merge Config', () => {
  it('на каждом уровне все специи заказов добываются открытым генератором или лежат на доске', () => {
    const e = createEngine(GameConfigSchema.parse(spiceCore));
    let s = e.initialState();
    for (let level = 0; level < 12; level++) {
      const open = new Set<string>();
      const onBoard = new Set<string>();
      s.board.cells.forEach((c, i) => {
        if (!c || cellState(s, i).kind !== 'open') return;
        if (c.kind === 'item' && !c.bubble) onBoard.add(c.chain);
        if (c.kind === 'generator') {
          e.rules.generators
            .get(c.generator)
            ?.levels[c.level - 1]?.produces.forEach((p) => open.add(p.chain));
        }
      });
      for (const slot of s.orders.slots) {
        for (const r of slot.order?.requirements ?? []) {
          expect(
            open.has(r.chain) || onBoard.has(r.chain),
            `${r.chain}${r.level}, уровень ${level}`,
          ).toBe(true);
        }
      }
      s = e.apply(s, { type: 'cheat', cheat: 'skipLevel' }).state;
    }
  });
});
