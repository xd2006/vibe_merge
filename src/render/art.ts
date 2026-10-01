import { Assets, type Texture } from 'pixi.js';
import { ART_DIR, ART_INDEX, artItems, emptyIndex, type ArtIndex } from '@/art';
import type { GameConfig } from '@/config';
import type { Subject } from '@/core';

const keyOf = (s: Subject) =>
  s.kind === 'item' ? `${s.chain}:${s.level}` : `generator.${s.generator}:${s.level}`;

/**
 * Текстуры предметов. Приоритет: своя картинка из `art.overrides` → готовый ассет
 * из public/art → нет текстуры (рисуется плейсхолдер). Прототип играбелен и без арта.
 */
export class ArtLibrary {
  private readonly textures = new Map<string, Texture>();

  static empty(): ArtLibrary {
    return new ArtLibrary();
  }

  static async load(config: GameConfig): Promise<ArtLibrary> {
    const lib = new ArtLibrary();
    let index: ArtIndex = emptyIndex();
    try {
      // Без кэша: в dev-режиме ассеты меняются из редактора.
      const res = await fetch(`${ART_INDEX}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) index = (await res.json()) as ArtIndex;
    } catch {
      // Нет индекса — нет готового арта.
    }
    await Promise.all(
      artItems(config).map(async (item) => {
        const entry = index.items[item.id];
        const src =
          item.override ??
          (entry ? `${ART_DIR}/${entry.file}?v=${encodeURIComponent(entry.createdAt)}` : null);
        if (!src) return;
        try {
          lib.textures.set(item.key, await Assets.load<Texture>({ src, parser: 'texture' }));
        } catch {
          // Битая или отсутствующая картинка — остаётся плейсхолдер.
        }
      }),
    );
    return lib;
  }

  texture(subject: Subject): Texture | null {
    return this.textures.get(keyOf(subject)) ?? null;
  }

  get size(): number {
    return this.textures.size;
  }
}
