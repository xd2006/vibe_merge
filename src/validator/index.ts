/** Логические проверки конфига поверх Zod: сообщения с путём к полю, текстом и подсказкой. */
import type { z } from 'zod';
import { GameConfigSchema, formatPath } from '@/config';
import { ConfigError } from '@/core';
import { t, type StringKey } from '@/i18n/ru';
import { semanticIssues } from './checks';
import { hasErrors, type Issue, type ValidationResult } from './issues';
import { parseJsonText } from './syntax';

export {
  hasErrors,
  type Issue,
  type IssueLevel,
  type TextPosition,
  type ValidationResult,
} from './issues';
export { parseJsonText, positionAt, type JsonParseResult } from './syntax';

const HINTS: Partial<Record<string, StringKey>> = {
  unrecognized_keys: 'hint.unknownKey',
  invalid_type: 'hint.type',
  too_small: 'hint.tooSmall',
  too_big: 'hint.tooBig',
  invalid_format: 'hint.format',
  invalid_union: 'hint.union',
  invalid_value: 'hint.value',
};

function schemaIssue(issue: z.core.$ZodIssue): Issue {
  // Ошибки вложенных вариантов union показываем по первому варианту, иначе сообщение пустое.
  return {
    level: 'error',
    path: formatPath(issue.path),
    code: `schema.${issue.code}`,
    message: t('val.schema', { message: issue.message }),
    hint: t(HINTS[issue.code] ?? 'hint.generic'),
  };
}

/** Проверяет уже разобранный JSON: схема, затем логика игры. */
export function validateConfig(input: unknown): ValidationResult {
  const parsed = GameConfigSchema.safeParse(input);
  if (!parsed.success) {
    return { config: null, issues: parsed.error.issues.map(schemaIssue), ok: false };
  }
  let issues: Issue[];
  try {
    issues = semanticIssues(parsed.data);
  } catch (e) {
    // Страховка: инвариант ядра, который не покрыли проверки валидатора.
    if (!(e instanceof ConfigError)) throw e;
    issues = [
      { level: 'error', path: e.path, code: 'core', message: e.message, hint: t('hint.generic') },
    ];
  }
  return { config: parsed.data, issues, ok: !hasErrors(issues) };
}

/** Проверяет текст конфига: синтаксис JSON, схема, логика игры. */
export function validateText(text: string): ValidationResult {
  const json = parseJsonText(text);
  if (!json.ok) {
    const message = json.position
      ? t('val.syntaxAt', {
          line: json.position.line,
          column: json.position.column,
          message: json.message,
        })
      : t('val.syntax', { message: json.message });
    return {
      config: null,
      ok: false,
      issues: [{ level: 'error', path: '', code: 'syntax', message, hint: t('hint.syntax') }],
      ...(json.position ? { syntaxError: json.position } : {}),
    };
  }
  return validateConfig(json.value);
}
