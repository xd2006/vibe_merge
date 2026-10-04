import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import { baseConfig } from '@/core/test-utils';
import { getConfigJsonSchema, parseConfig } from '.';

describe('parseConfig', () => {
  it('демо-пресет проходит схему', () => {
    const res = parseConfig(demo);
    if (!res.ok) throw new Error(JSON.stringify(res.issues, null, 2));
    expect(res.config.generators[0]!.levels[0]!.cooldown).toEqual({
      charges: 12,
      seconds: 120,
      skipCost: 20,
      freeSkipSec: 15,
    });
  });

  it('подставляет значения по умолчанию', () => {
    const res = parseConfig(baseConfig());
    if (!res.ok) throw new Error(JSON.stringify(res.issues));
    const c = res.config;
    expect(c.energy.allowOverMax).toBe(true);
    expect(c.chains[0]!.value).toBe('2 ^ level');
    expect(c.storage).toEqual({ enabled: true, returnToBoard: true });
    expect(c.cheats.skipTime).toEqual({ enabled: true, minutes: [10, 60, 240] });
    expect(c.art.targetSizePx).toBe(256);
    expect(c.orders.reachability.mode).toBe('auto');
    expect(c.currencies.hard.start).toBe(0);
  });

  it('запрещает неизвестные поля и указывает путь', () => {
    const input = baseConfig() as Record<string, unknown> & ReturnType<typeof baseConfig>;
    (input.generators[0] as Record<string, unknown>).mergeCount = 2;
    const res = parseConfig(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues).toHaveLength(1);
      expect(res.issues[0]!.path).toBe('generators[0]');
      expect(res.issues[0]!.message).toContain('mergeCount');
    }
  });

  it('проверяет кулдаун генератора', () => {
    const input = baseConfig();
    input.generators[0]!.levels[0]!.cooldown = { charges: 0, seconds: 10 };
    const res = parseConfig(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]!.path).toBe('generators[0].levels[0].cooldown.charges');
  });

  it('требует ровно одно из level и levelRange', () => {
    const input = baseConfig();
    input.orders.templates[0]!.requirements = [{ chain: 'wood', level: 1, levelRange: [1, 2] }];
    const res = parseConfig(input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0]!.path).toBe('orders.templates[0].requirements[0]');
  });

  it('проверяет формат идентификаторов и шаблонов itemActions', () => {
    const input = baseConfig();
    input.chains[0]!.id = 'Wood';
    input.itemActions = [{ match: 'wood' }];
    const res = parseConfig(input);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.map((i) => i.path).sort()).toEqual([
        'chains[0].id',
        'itemActions[0].match',
      ]);
    }
  });
});

describe('getConfigJsonSchema', () => {
  it('описывает все блоки конфига', () => {
    const schema = getConfigJsonSchema() as {
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([
        'meta',
        'currencies',
        'energy',
        'chains',
        'generators',
        'board',
        'levels',
        'orders',
        'bubbles',
        'storage',
        'itemActions',
        'cheats',
        'telemetry',
        'art',
      ]),
    );
    // Блоки со значениями по умолчанию не обязательны для дизайнера.
    expect(schema.required).not.toContain('storage');
    expect(schema.required).toContain('chains');
  });
});
