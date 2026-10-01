import { z } from 'zod';
import { GameConfigSchema, type GameConfig } from './schema';

export interface ConfigIssue {
  /** Путь к полю в виде `generators[0].levels[1].produces[0].chain`. */
  path: string;
  message: string;
}

export type ParseResult = { ok: true; config: GameConfig } | { ok: false; issues: ConfigIssue[] };

export function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else out += out ? `.${String(key)}` : String(key);
  }
  return out;
}

/** Проверяет конфиг по схеме и подставляет значения по умолчанию. */
export function parseConfig(input: unknown): ParseResult {
  const result = GameConfigSchema.safeParse(input);
  if (result.success) return { ok: true, config: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
}

/** JSON Schema конфига в том виде, как его пишет дизайнер (поля со значением по умолчанию необязательны). */
export function getConfigJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(GameConfigSchema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
}
