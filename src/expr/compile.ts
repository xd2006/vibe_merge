import { ExprError, parse, type Node } from './parser';

/** Все переменные мини-языка (ТЗ, раздел 5). Какие из них доступны, зависит от места формулы. */
export const FORMULA_VARIABLES = [
  'level',
  'itemValue',
  'totalValue',
  'boardLevel',
  'ordersDone',
  'baseCost',
] as const;
export type FormulaVariable = (typeof FORMULA_VARIABLES)[number];

export type Formula = (vars: Partial<Record<FormulaVariable, number>>) => number;

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...a: number[]) => number }> = {
  ceil: { arity: [1, 1], fn: Math.ceil },
  floor: { arity: [1, 1], fn: Math.floor },
  round: { arity: [1, 1], fn: Math.round },
  min: { arity: [1, Infinity], fn: Math.min },
  max: { arity: [1, Infinity], fn: Math.max },
};

type Evaluator = (vars: Partial<Record<FormulaVariable, number>>) => number;

function build(node: Node, allowed: readonly FormulaVariable[]): Evaluator {
  switch (node.kind) {
    case 'num': {
      const v = node.value;
      return () => v;
    }
    case 'var': {
      if (!(allowed as readonly string[]).includes(node.name)) {
        throw new ExprError('expr.unknownVariable', node.pos, {
          name: node.name,
          allowed: allowed.join(', ') || '—',
        });
      }
      const name = node.name as FormulaVariable;
      return (vars) => vars[name] ?? 0;
    }
    case 'neg': {
      const arg = build(node.arg, allowed);
      return (vars) => -arg(vars);
    }
    case 'bin': {
      const l = build(node.left, allowed);
      const r = build(node.right, allowed);
      switch (node.op) {
        case '+':
          return (v) => l(v) + r(v);
        case '-':
          return (v) => l(v) - r(v);
        case '*':
          return (v) => l(v) * r(v);
        case '/':
          return (v) => l(v) / r(v);
        case '^':
          return (v) => l(v) ** r(v);
      }
      break;
    }
    case 'call': {
      const def = FUNCTIONS[node.name];
      if (!def) throw new ExprError('expr.unknownFunction', node.pos, { name: node.name });
      const [lo, hi] = def.arity;
      if (node.args.length < lo || node.args.length > hi) {
        const expected = lo === hi ? String(lo) : hi === Infinity ? `от ${lo}` : `${lo}–${hi}`;
        throw new ExprError('expr.arity', node.pos, { name: node.name, expected });
      }
      const args = node.args.map((a) => build(a, allowed));
      const fn = def.fn;
      return (vars) => fn(...args.map((a) => a(vars)));
    }
  }
}

/**
 * Компилирует формулу (или число) в функцию. Бросает `ExprError` при синтаксической ошибке,
 * неизвестной переменной или функции. Результат вычисления, не являющийся конечным числом,
 * тоже приводит к `ExprError`.
 */
export function compileFormula(
  source: string | number,
  allowed: readonly FormulaVariable[],
): Formula {
  if (typeof source === 'number') return () => source;
  const evaluate = build(parse(source), allowed);
  return (vars) => {
    const result = evaluate(vars);
    if (!Number.isFinite(result)) throw new ExprError('expr.notFinite', 0);
    return result;
  };
}

export type CheckResult = { ok: true } | { ok: false; message: string; pos: number };

/** Проверяет формулу без вычисления — для валидатора и редактора. */
export function checkFormula(
  source: string | number,
  allowed: readonly FormulaVariable[],
): CheckResult {
  try {
    compileFormula(source, allowed);
    return { ok: true };
  } catch (e) {
    if (e instanceof ExprError) return { ok: false, message: e.message, pos: e.pos };
    throw e;
  }
}
