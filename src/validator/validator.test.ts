import { describe, expect, it } from 'vitest';
import demo from '../../presets/demo.json';
import empty from '../../presets/empty.json';
import type { GameConfigInput } from '@/config';
import { baseConfig } from '@/core/test-utils';
import { parseJsonText, validateConfig, validateText, type Issue } from '.';

/** Проблемы конфига, полученного правкой базового. */
function issuesOf(patch: (c: GameConfigInput) => void): Issue[] {
  const c = baseConfig();
  patch(c);
  return validateConfig(c).issues;
}
const brief = (issues: Issue[]) => issues.map((i) => `${i.level}:${i.code}@${i.path}`);

describe('пресеты', () => {
  it('демо и пустой шаблон проходят без ошибок и предупреждений', () => {
    expect(validateConfig(demo).issues).toEqual([]);
    expect(validateConfig(empty).issues).toEqual([]);
  });
});

describe('синтаксис JSON', () => {
  it('сообщает место ошибки и подсказку', () => {
    const r = validateText('{\n  "meta": { "name": "x", }\n}');
    expect(r.ok).toBe(false);
    expect(r.syntaxError).toMatchObject({ line: 2, column: 26 });
    expect(r.issues[0]).toMatchObject({ code: 'syntax', level: 'error' });
    expect(r.issues[0]!.message).toContain('строке 2');
    expect(r.issues[0]!.hint).not.toBe('');
  });

  it('обрыв текста', () => {
    const r = parseJsonText('{"a": ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('обрывается');
  });
});

describe('ошибки схемы', () => {
  it('неизвестное поле, тип, нарушение минимума', () => {
    expect(
      brief(
        issuesOf((c) => {
          (c.energy as Record<string, unknown>).maxx = 5;
          (c.meta as Record<string, unknown>).seed = 'x';
          c.levels[0]!.ordersRequired = 0;
          c.energy.regen.intervalSec = 0;
        }),
      ).sort(),
    ).toEqual(
      [
        'error:schema.unrecognized_keys@energy',
        'error:schema.invalid_type@meta.seed',
        'error:schema.too_small@levels[0].ordersRequired',
        'error:schema.too_small@energy.regen.intervalSec',
      ].sort(),
    );
  });

  it('у каждой ошибки есть текст и подсказка', () => {
    const [issue] = issuesOf((c) => {
      (c.energy as Record<string, unknown>).maxx = 5;
    });
    expect(issue!.message).toContain('maxx');
    expect(issue!.hint).toContain('опечатку');
  });
});

describe('логические ошибки', () => {
  it.each<[string, (c: GameConfigInput) => void, string]>([
    [
      'дубликат id цепочки',
      (c) => c.chains.push({ ...c.chains[0]! }),
      'error:duplicateId@chains[1].id',
    ],
    [
      'дубликат id шаблона',
      (c) => c.orders.templates.push({ ...c.orders.templates[0]! }),
      'error:duplicateId@orders.templates[1].id',
    ],
    [
      'несуществующая цепочка в генераторе',
      (c) => (c.generators[0]!.levels[0]!.produces[0]!.chain = 'iron'),
      'error:unknownChain@generators[0].levels[0].produces[0].chain',
    ],
    [
      'уровень выше максимального',
      (c) => (c.generators[0]!.levels[0]!.produces[0]!.level = 9),
      'error:levelTooHigh@generators[0].levels[0].produces[0].level',
    ],
    [
      'несуществующий генератор в легенде',
      (c) => (c.board.legend.S = { generator: 'mill', level: 1 }),
      'error:unknownGenerator@board.legend.S.generator',
    ],
    [
      'уровень генератора выше максимального',
      (c) => (c.board.legend.S = { generator: 'saw', level: 3 }),
      'error:levelTooHigh@board.legend.S.level',
    ],
    [
      'несуществующая группа замков',
      (c) => (c.levels[0]!.unlocks = ['zone9']),
      'error:unknownLockGroup@levels[0].unlocks[0]',
    ],
    [
      'несуществующий fallbackTemplate',
      (c) => (c.orders.fallbackTemplate = 'nope'),
      'error:unknownTemplate@orders.fallbackTemplate',
    ],
    [
      'нулевая сумма весов',
      (c) => (c.generators[0]!.levels[0]!.produces[0]!.weight = 0),
      'error:zeroWeights@generators[0].levels[0].produces',
    ],
    [
      'формула с неизвестной переменной',
      (c) => (c.chains[0]!.value = '2 ^ lvl'),
      'error:formula@chains[0].value',
    ],
    [
      'формула награды не разбирается',
      (c) => (c.orders.templates[0]!.rewards = [{ type: 'energy', amount: 'ceil(totalValue' }]),
      'error:formula@orders.templates[0].rewards[0].amount',
    ],
    [
      'раскладка не совпадает с высотой',
      (c) => (c.board.layout = ['S..', '...']),
      'error:layout@board.layout',
    ],
    [
      'раскладка не совпадает с шириной',
      (c) => (c.board.layout = ['S..', '....', '...']),
      'error:layout@board.layout[1]',
    ],
    [
      'символ не из легенды',
      (c) => (c.board.layout = ['S..', '.?.', '...']),
      'error:unknownSymbol@board.layout[1]',
    ],
    [
      'клетка замка вне доски',
      (c) => {
        c.board.locks = [{ group: 'z', cells: [[5, 0]], content: { item: 'wood', level: 1 } }];
        c.levels[0]!.unlocks = ['z'];
      },
      'error:lockCell@board.locks[0].cells[0]',
    ],
    [
      'клетка замка пересекается с раскладкой',
      (c) => {
        c.board.locks = [{ group: 'z', cells: [[0, 0]], content: { item: 'wood', level: 1 } }];
        c.levels[0]!.unlocks = ['z'];
      },
      'error:lockCell@board.locks[0].cells[0]',
    ],
    [
      'шаблон itemActions на несуществующую цепочку',
      (c) => (c.itemActions = [{ match: 'iron.*', pickUp: true }]),
      'error:unknownPattern@itemActions[0].match',
    ],
    [
      'пустой список минут при включённом skipTime',
      (c) => (c.cheats = { skipTime: { minutes: [] } }),
      'error:emptySkipTime@cheats.skipTime.minutes',
    ],
    [
      'ключ арта на несуществующий предмет',
      (c) => (c.art = { overrides: { 'wood:7': 'a.png' } }),
      'error:artKey@art.overrides.wood:7',
    ],
    [
      'счётчик на несуществующую цепочку',
      (c) =>
        (c.telemetry = {
          counters: [
            { id: 'x', name: 'X', match: { chain: 'iron', level: 1 }, sources: ['merge'] },
          ],
        }),
      'error:unknownChain@telemetry.counters[0].match.chain',
    ],
  ])('%s', (_, patch, expected) => {
    expect(brief(issuesOf(patch))).toContain(expected);
  });
});

describe('предупреждения', () => {
  it.each<[string, (c: GameConfigInput) => void, string]>([
    [
      'ни один шаблон не проходит по достижимости',
      (c) => {
        c.orders.reachability = { maxMergeDepth: 0 };
        c.orders.templates[0]!.requirements = [{ chain: 'wood', level: 3 }];
      },
      'warning:noTemplate@levels[0]',
    ],
    [
      'группа замков не открывается ни одним уровнем',
      (c) =>
        (c.board.locks = [{ group: 'z', cells: [[2, 2]], content: { item: 'wood', level: 1 } }]),
      'warning:lockNeverOpens@board.locks[0].group',
    ],
    [
      'для предмета в замке нет источника',
      (c) => {
        c.chains.push({ id: 'iron', name: 'Железо', levels: [{ name: 'i1' }, { name: 'i2' }] });
        c.board.locks = [{ group: 'z', cells: [[2, 2]], content: { item: 'iron', level: 1 } }];
        c.levels[0]!.unlocks = ['z'];
      },
      'warning:lockNoSource@board.locks[0].content',
    ],
    [
      'предмет в замке максимального уровня',
      (c) => {
        c.board.locks = [{ group: 'z', cells: [[2, 2]], content: { item: 'wood', level: 3 } }];
        c.levels[0]!.unlocks = ['z'];
      },
      'warning:lockMaxLevel@board.locks[0].content',
    ],
    [
      'стоимость генерации выше максимума энергии',
      (c) => (c.generators[0]!.levels[0]!.energyCost = 50),
      'warning:energyCost@generators[0].levels[0].energyCost',
    ],
    [
      'на доске нет генераторов',
      (c) => (c.board.layout = ['...', '...', '...']),
      'warning:noGenerators@board.layout',
    ],
    [
      'проверка достижимости выключена',
      (c) => (c.orders.reachability = { mode: 'off' }),
      'warning:reachOff@orders.reachability.mode',
    ],
  ])('%s', (_, patch, expected) => {
    const issues = issuesOf(patch);
    expect(brief(issues)).toContain(expected);
    // Предупреждения не блокируют запуск.
    expect(issues.every((i) => i.level === 'warning')).toBe(true);
    const c = baseConfig();
    patch(c);
    expect(validateConfig(c).ok).toBe(true);
  });
});
