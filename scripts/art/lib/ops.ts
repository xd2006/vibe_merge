// Операции арт-пайплайна: общие для команд npm run art:* и для редактора (через dev-сервер).
import sharp, { type Metadata } from 'sharp';
import type { GameConfig } from '../../../src/config';
import { artItems, referenceNote, type ArtEntry, type ArtItem } from '../../../src/art';
import { generateImage } from './gemini';
import { EmptyImageError, onChromaBackground, processImage } from './postprocess';
import { readAsset, readIndex, readOverride, saveAsset } from './store';

/** Минимальная сторона исходной картинки для импорта. */
export const MIN_SOURCE_PX = 128;

export class ArtError extends Error {}

/** Проверяет размеры исходной картинки: не слишком мелкая и примерно квадратная. */
export async function checkSource(buffer: Buffer): Promise<{ width: number; height: number }> {
  let meta: Metadata;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw new ArtError('файл не читается как картинка (нужен PNG, JPEG или WebP)');
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (Math.min(width, height) < MIN_SOURCE_PX) {
    throw new ArtError(
      `слишком маленькая картинка ${width}×${height}: нужно не меньше ${MIN_SOURCE_PX} px по короткой стороне`,
    );
  }
  if (Math.max(width, height) / Math.min(width, height) > 2) {
    throw new ArtError(`картинка ${width}×${height} слишком вытянута: нужна примерно квадратная`);
  }
  return { width, height };
}

/** Импорт готовой картинки предмета (ручной режим): проверка, постобработка, сохранение. */
export async function importImage(
  config: GameConfig,
  item: ArtItem,
  buffer: Buffer,
): Promise<ArtEntry> {
  await checkSource(buffer);
  const size = config.art.targetSizePx;
  try {
    const { png } = await processImage(buffer, item.chromaKey, size);
    return saveAsset(item, png, { source: 'manual', size });
  } catch (e) {
    if (e instanceof EmptyImageError) throw new ArtError(e.message);
    throw e;
  }
}

/** Референс для уровней выше первого: готовый первый уровень цепочки (свой или сгенерированный). */
function referenceFor(config: GameConfig, item: ArtItem): Promise<Buffer> | null {
  if (item.level === 1) return null;
  const first = artItems(config).find((x) => x.groupId === item.groupId && x.level === 1);
  if (!first) return null;
  const png = readAsset(first) ?? readOverride(first);
  return png ? onChromaBackground(png, item.chromaKey) : null;
}

/** Генерация одного предмета через Gemini; референс — первый уровень цепочки, если он готов. */
export async function generateItem(
  config: GameConfig,
  item: ArtItem,
  model: string,
): Promise<ArtEntry> {
  const reference = await referenceFor(config, item);
  const prompt = reference ? item.prompt + referenceNote(item) : item.prompt;
  const raw = await generateImage({ prompt, model, ...(reference ? { reference } : {}) });
  const size = config.art.targetSizePx;
  try {
    const { png } = await processImage(raw, item.chromaKey, size);
    return saveAsset(item, png, { source: 'auto', model, size });
  } catch (e) {
    if (e instanceof EmptyImageError) throw new ArtError(e.message);
    throw e;
  }
}

/** Нужна ли генерация: авто-режим, нет своей картинки, нет ассета этой модели (или --force). */
export function needsBake(item: ArtItem, model: string, force: boolean): boolean {
  if (item.mode !== 'auto' || item.override) return false;
  const entry = readIndex().items[item.id];
  return force || !entry || (entry.source === 'auto' && entry.model !== model);
}

export type ArtStatus = 'override' | 'ready' | 'missing';

/** Состояние арта предмета: своя картинка, готовый ассет или нужен (будет плейсхолдер). */
export function statusOf(item: ArtItem): ArtStatus {
  if (item.override) return 'override';
  return readIndex().items[item.id] ? 'ready' : 'missing';
}
