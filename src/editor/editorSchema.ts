import type { RJSFSchema } from '@rjsf/utils';
import { z } from 'zod';
import { GameConfigSchema } from '@/config';
import { BLOCK_LABELS, FIELD_LABELS } from './labels';

type Node = Record<string, unknown>;

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Готовит JSON Schema конфига для формы:
 * - значения по умолчанию переносятся в описание, чтобы форма не дописывала их в конфиг;
 * - поля-формулы (число или строка) становятся строкой с виджетом формулы;
 * - служебные пределы целых чисел (±2^53) убираются;
 * - полям даются русские подписи по имени ключа.
 */
function prepare(node: unknown, key?: string): unknown {
  if (Array.isArray(node)) return node.map((n) => prepare(n));
  if (!isNode(node)) return node;
  const out: Node = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'properties' && isNode(v)) {
      out.properties = Object.fromEntries(
        Object.entries(v).map(([pk, pv]) => [pk, prepare(pv, pk)]),
      );
    } else if (k !== 'default' && k !== '$schema') {
      out[k] = prepare(v);
    }
  }
  if (typeof out.maximum === 'number' && out.maximum >= Number.MAX_SAFE_INTEGER) delete out.maximum;
  if (typeof out.minimum === 'number' && out.minimum <= Number.MIN_SAFE_INTEGER) delete out.minimum;

  if (out.format === 'formula') {
    delete out.anyOf;
    out.type = 'string';
  }
  if ('default' in node && node.default !== undefined) {
    const d = JSON.stringify(node.default);
    out.description = [out.description, `По умолчанию: ${d.length > 60 ? d.slice(0, 57) + '…' : d}`]
      .filter(Boolean)
      .join('. ');
  }
  if (key && out.title === undefined && FIELD_LABELS[key]) out.title = FIELD_LABELS[key];
  // Вариант «null» в выборе варианта (пустая клетка легенды, бессрочный пузырь).
  if (out.type === 'null' && out.title === undefined) out.title = 'Нет';
  return out;
}

let cached: RJSFSchema | null = null;

/** Схема конфига целиком (draft-7: так RJSF понимает кортежи [min, max]). */
export function editorSchema(): RJSFSchema {
  if (!cached) {
    const raw = z.toJSONSchema(GameConfigSchema, {
      io: 'input',
      unrepresentable: 'any',
      target: 'draft-7',
    });
    const root = prepare(raw) as RJSFSchema & { properties: Record<string, RJSFSchema> };
    delete root.properties.$schema;
    for (const [block, s] of Object.entries(root.properties))
      s.title = BLOCK_LABELS[block] ?? block;
    cached = root;
  }
  return cached;
}

/** Верхнеуровневые блоки в порядке схемы. */
export function blocks(): string[] {
  return Object.keys((editorSchema().properties ?? {}) as object);
}

export function blockSchema(block: string): RJSFSchema {
  return (editorSchema().properties as Record<string, RJSFSchema>)[block]!;
}
