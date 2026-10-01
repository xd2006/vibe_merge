import { t, type StringKey } from '@/i18n/ru';

export type Node =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string; pos: number }
  | { kind: 'neg'; arg: Node }
  | { kind: 'bin'; op: BinaryOp; left: Node; right: Node }
  | { kind: 'call'; name: string; args: Node[]; pos: number };

export type BinaryOp = '+' | '-' | '*' | '/' | '^';

/** Ошибка разбора или проверки формулы; `pos` — позиция символа в исходной строке. */
export class ExprError extends Error {
  constructor(
    readonly code: StringKey,
    readonly pos: number,
    readonly params: Record<string, string | number> = {},
  ) {
    super(t(code, params));
    this.name = 'ExprError';
  }
}

type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'ident'; value: string; pos: number }
  | { type: 'op'; value: string; pos: number }
  | { type: 'end'; pos: number };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    const num = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (num) {
      tokens.push({ type: 'num', value: Number(num[0]), pos: i });
      i += num[0].length;
      continue;
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0], pos: i });
      i += ident[0].length;
      continue;
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }
    throw new ExprError('expr.unexpectedChar', i, { char: ch });
  }
  tokens.push({ type: 'end', pos: src.length });
  return tokens;
}

const BINARY: Record<string, { prec: number; right: boolean }> = {
  '+': { prec: 1, right: false },
  '-': { prec: 1, right: false },
  '*': { prec: 2, right: false },
  '/': { prec: 2, right: false },
  '^': { prec: 4, right: true },
};
const UNARY_PREC = 3;

/** Разбирает формулу в дерево (Pratt-парсер). Унарный минус слабее степени: `-2 ^ 2 = -4`. */
export function parse(src: string): Node {
  const tokens = tokenize(src);
  let i = 0;
  const peek = () => tokens[i]!;
  const next = () => tokens[i++]!;

  const fail = (tok: Token): never => {
    if (tok.type === 'end') throw new ExprError('expr.unexpectedEnd', tok.pos);
    throw new ExprError('expr.unexpectedToken', tok.pos, { token: String(tok.value) });
  };
  const expectOp = (value: string) => {
    const tok = next();
    if (tok.type !== 'op' || tok.value !== value) fail(tok);
  };

  function prefix(): Node {
    const tok = next();
    if (tok.type === 'num') return { kind: 'num', value: tok.value };
    if (tok.type === 'op' && tok.value === '-') return { kind: 'neg', arg: expression(UNARY_PREC) };
    if (tok.type === 'op' && tok.value === '(') {
      const inner = expression(0);
      expectOp(')');
      return inner;
    }
    if (tok.type === 'ident') {
      const after = peek();
      if (after.type === 'op' && after.value === '(') {
        next();
        const args: Node[] = [];
        const close = peek();
        if (!(close.type === 'op' && close.value === ')')) {
          args.push(expression(0));
          while (peek().type === 'op' && (peek() as { value: string }).value === ',') {
            next();
            args.push(expression(0));
          }
        }
        expectOp(')');
        return { kind: 'call', name: tok.value, args, pos: tok.pos };
      }
      return { kind: 'var', name: tok.value, pos: tok.pos };
    }
    return fail(tok);
  }

  function expression(minPrec: number): Node {
    let left = prefix();
    for (;;) {
      const tok = peek();
      if (tok.type !== 'op') break;
      const info = BINARY[tok.value];
      if (!info || info.prec < minPrec) break;
      next();
      const right = expression(info.right ? info.prec : info.prec + 1);
      left = { kind: 'bin', op: tok.value as BinaryOp, left, right };
    }
    return left;
  }

  const tree = expression(0);
  const rest = peek();
  if (rest.type !== 'end') fail(rest);
  return tree;
}
