import { describe, expect, it } from 'vitest';
import { ExprError, checkFormula, compileFormula, type FormulaVariable } from '.';

const ALL: FormulaVariable[] = ['level', 'itemValue', 'totalValue', 'boardLevel', 'ordersDone'];
const evalF = (src: string, vars = {}) => compileFormula(src, ALL)(vars);

describe('compileFormula: вычисление', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 - 4 - 3', 3],
    ['16 / 4 / 2', 2],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2', -4],
    ['-2 * 3', -6],
    ['--3', 3],
    ['1.5 * 2', 3],
    ['ceil(2.1)', 3],
    ['floor(2.9)', 2],
    ['round(2.5)', 3],
    ['min(3, 1, 2)', 1],
    ['max(3, 1, 2)', 3],
    ['max(1)', 1],
  ])('%s = %d', (src, expected) => {
    expect(evalF(src)).toBe(expected);
  });

  it('подставляет переменные', () => {
    expect(evalF('2 ^ level', { level: 3 })).toBe(8);
    expect(evalF('ceil(totalValue * 0.5)', { totalValue: 7 })).toBe(4);
    expect(evalF('ceil(itemValue / 2) + boardLevel', { itemValue: 5, boardLevel: 2 })).toBe(5);
  });

  it('принимает число вместо строки', () => {
    expect(compileFormula(42, [])({})).toBe(42);
  });

  it('бросает ошибку на нечисловом результате', () => {
    expect(() => evalF('1 / 0')).toThrow(ExprError);
  });
});

describe('compileFormula: ошибки', () => {
  const error = (src: string, allowed: FormulaVariable[] = ALL) => {
    try {
      compileFormula(src, allowed);
    } catch (e) {
      if (e instanceof ExprError) return { code: e.code, pos: e.pos };
      throw e;
    }
    throw new Error('ожидалась ошибка');
  };

  it.each([
    ['2 $ 3', 'expr.unexpectedChar', 2],
    ['2 +', 'expr.unexpectedEnd', 3],
    ['(1 + 2', 'expr.unexpectedEnd', 6],
    ['1 2', 'expr.unexpectedToken', 2],
    [')', 'expr.unexpectedToken', 0],
    ['speed * 2', 'expr.unknownVariable', 0],
    ['sqrt(4)', 'expr.unknownFunction', 0],
    ['ceil(1, 2)', 'expr.arity', 0],
    ['min()', 'expr.arity', 0],
  ])('%s → %s', (src, code, pos) => {
    expect(error(src)).toEqual({ code, pos });
  });

  it('ограничивает переменные контекстом', () => {
    expect(error('totalValue', ['level'])).toEqual({ code: 'expr.unknownVariable', pos: 0 });
  });

  it('checkFormula возвращает сообщение и позицию', () => {
    expect(checkFormula('2 ^ level', ['level'])).toEqual({ ok: true });
    const res = checkFormula('2 ^ lvl', ['level']);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.pos).toBe(4);
      expect(res.message).toContain('lvl');
    }
  });
});
