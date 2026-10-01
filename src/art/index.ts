/**
 * Общая логика арта для скриптов (Node) и прототипа (браузер): какие предметы нужны,
 * их промпты, имена файлов для ручного режима и идентификаторы готовых ассетов.
 *
 * Готовый ассет хранится по идентификатору — хешу промпта и размера: если поменять
 * название предмета, стиль или шаблон промпта, нужен новый ассет, а старый остаётся
 * в кэше и вернётся, если вернуть прежние значения.
 */
import type { GameConfig } from '@/config';
import { hashValue } from '@/core';

export type ArtMode = 'auto' | 'manual';
export type ChromaKey = 'green' | 'magenta';

export const CHROMA: Record<ChromaKey, { rgb: [number, number, number]; prompt: string }> = {
  green: { rgb: [0, 255, 0], prompt: 'pure green (#00FF00)' },
  magenta: { rgb: [255, 0, 255], prompt: 'pure magenta (#FF00FF)' },
};

export interface ArtItem {
  /** Ключ как в `art.items` и `art.overrides`: `wood:2` или `generator.sawmill:1`. */
  key: string;
  /** Имя файла для ручного режима: `wood_2.png`, `generator_sawmill_1.png`. */
  file: string;
  kind: 'item' | 'generator';
  /** Цепочка или генератор, к которому относится предмет. */
  groupId: string;
  groupName: string;
  name: string;
  level: number;
  maxLevel: number;
  mode: ArtMode;
  chromaKey: ChromaKey;
  /** Путь к своей картинке из `art.overrides` (относительно папки public). */
  override: string | null;
  prompt: string;
  /** Идентификатор готового ассета. */
  id: string;
}

/** Папка готовых ассетов внутри public/ и файл-индекс. */
export const ART_DIR = 'art';
export const ART_INDEX = `${ART_DIR}/index.json`;

export interface ArtEntry {
  file: string;
  key: string;
  name: string;
  source: 'auto' | 'manual';
  /** Модель Gemini для авто-режима — для кэша: другая модель означает перегенерацию. */
  model?: string;
  size: number;
  createdAt: string;
}

export interface ArtIndex {
  version: 1;
  items: Record<string, ArtEntry>;
}

export const emptyIndex = (): ArtIndex => ({ version: 1, items: {} });

/** Подстановка `{name}` в шаблон промпта; неизвестные плейсхолдеры остаются как есть. */
export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Все предметы, которым нужен арт: цепочки по уровням, затем генераторы. */
export function artItems(config: GameConfig): ArtItem[] {
  const { art, meta } = config;
  const make = (
    key: string,
    file: string,
    kind: ArtItem['kind'],
    groupId: string,
    groupName: string,
    name: string,
    level: number,
    maxLevel: number,
  ): ArtItem => {
    const own = art.items[key];
    const chromaKey = own?.chromaKey ?? art.chromaKey;
    const prompt = fillTemplate(art.promptTemplate, {
      artStyle: meta.artStyle,
      itemName: name,
      chainName: groupName,
      level,
      maxLevel,
      chromaKey: CHROMA[chromaKey].prompt,
    });
    return {
      key,
      file,
      kind,
      groupId,
      groupName,
      name,
      level,
      maxLevel,
      mode: own?.mode ?? art.mode,
      chromaKey,
      override: art.overrides[key] ?? null,
      prompt,
      id: hashValue({ prompt, size: art.targetSizePx, v: 1 }),
    };
  };

  const out: ArtItem[] = [];
  for (const c of config.chains) {
    c.levels.forEach((l, i) =>
      out.push(
        make(
          `${c.id}:${i + 1}`,
          `${c.id}_${i + 1}.png`,
          'item',
          c.id,
          c.name,
          l.name,
          i + 1,
          c.levels.length,
        ),
      ),
    );
  }
  for (const g of config.generators) {
    g.levels.forEach((l, i) =>
      out.push(
        make(
          `generator.${g.id}:${i + 1}`,
          `generator_${g.id}_${i + 1}.png`,
          'generator',
          `generator.${g.id}`,
          g.name,
          l.name ?? g.name,
          i + 1,
          g.levels.length,
        ),
      ),
    );
  }
  return out;
}

/** Дополнение к промпту, когда к запросу приложен референс — первый уровень цепочки. */
export const referenceNote = (item: ArtItem) =>
  ` The attached image is level 1 of the same chain ("${item.groupName}"): keep exactly the same art style, palette, lighting and object family; this item is a more advanced version (level ${item.level} of ${item.maxLevel}).`;
