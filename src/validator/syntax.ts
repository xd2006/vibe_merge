import type { TextPosition } from './issues';

export type JsonParseResult =
  { ok: true; value: unknown } | { ok: false; message: string; position: TextPosition | null };

/** Позиция по смещению в тексте. */
export function positionAt(text: string, offset: number): TextPosition {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const lines = before.split('\n');
  return { offset, line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

function offsetOf(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) offset += lines[i]!.length + 1;
  return offset + column - 1;
}

/**
 * Разбор JSON с местом ошибки. Место берётся из сообщения движка: V8 пишет
 * «at position N» и/или «(line L column C)».
 */
export function parseJsonText(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const lc = /line (\d+) column (\d+)/.exec(message);
    const pos = /position (\d+)/.exec(message);
    let position: TextPosition | null = null;
    if (lc) {
      const line = Number(lc[1]);
      const column = Number(lc[2]);
      position = { offset: offsetOf(text, line, column), line, column };
    } else if (pos) {
      position = positionAt(text, Number(pos[1]));
    } else if (/end of JSON input/i.test(message)) {
      position = positionAt(text, text.length);
    }
    return { ok: false, message: translate(message), position };
  }
}

/** Частые сообщения V8 о синтаксисе JSON — по-русски; остальные без служебных хвостов. */
const MESSAGES: [RegExp, string][] = [
  [
    /Expected double-quoted property name/,
    'ожидается имя поля в двойных кавычках (лишняя запятая?)',
  ],
  [/Expected ',' or '}' after property value/, 'после значения поля ожидается «,» или «}»'],
  [/Expected ',' or ']' after array element/, 'после элемента списка ожидается «,» или «]»'],
  [/Expected ':' after property name/, 'после имени поля ожидается «:»'],
  [/Unterminated string/, 'строка не закрыта кавычкой'],
  [/Unexpected end of JSON input/, 'текст обрывается: не хватает закрывающих скобок'],
  [/Bad control character in string literal/, 'недопустимый символ внутри строки'],
  [/Unexpected token '?(.)'?/, 'неожиданный символ «$1»'],
  [/Unexpected non-whitespace character after JSON/, 'лишний текст после конца JSON'],
];

function translate(message: string): string {
  for (const [re, ru] of MESSAGES) {
    const m = re.exec(message);
    if (m) return ru.replace('$1', m[1] ?? '');
  }
  return message.replace(/\s*\(line \d+ column \d+\)/, '').replace(/ in JSON at position \d+/, '');
}
