// Хранилище готовых ассетов: public/art/<id>.png и индекс public/art/index.json.
// Папка public попадает и в веб-билд, и в APK; ключ API и скрипты — нет.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ART_DIR, emptyIndex, type ArtEntry, type ArtIndex, type ArtItem } from '../../../src/art';

export const PUBLIC_DIR = 'public';
const dir = (root: string) => join(root, PUBLIC_DIR, ART_DIR);
const indexPath = (root: string) => join(dir(root), 'index.json');

export function readIndex(root = '.'): ArtIndex {
  const path = indexPath(root);
  if (!existsSync(path)) return emptyIndex();
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as ArtIndex;
    return data.version === 1 && data.items ? data : emptyIndex();
  } catch {
    return emptyIndex();
  }
}

export function writeIndex(index: ArtIndex, root = '.'): void {
  mkdirSync(dir(root), { recursive: true });
  // Стабильный порядок ключей — чтобы diff индекса в git был читаемым.
  const items = Object.fromEntries(
    Object.entries(index.items).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  writeFileSync(indexPath(root), JSON.stringify({ version: 1, items }, null, 2) + '\n');
}

/** Сохраняет готовый PNG предмета и запись в индексе. */
export function saveAsset(
  item: ArtItem,
  png: Buffer,
  meta: { source: ArtEntry['source']; model?: string; size: number },
  root = '.',
): ArtEntry {
  mkdirSync(dir(root), { recursive: true });
  const file = `${item.id}.png`;
  writeFileSync(join(dir(root), file), png);
  const entry: ArtEntry = {
    file,
    key: item.key,
    name: item.name,
    source: meta.source,
    ...(meta.model ? { model: meta.model } : {}),
    size: meta.size,
    createdAt: new Date().toISOString(),
  };
  const index = readIndex(root);
  index.items[item.id] = entry;
  writeIndex(index, root);
  return entry;
}

export function readAsset(item: ArtItem, root = '.'): Buffer | null {
  const entry = readIndex(root).items[item.id];
  if (!entry) return null;
  const path = join(dir(root), entry.file);
  return existsSync(path) ? readFileSync(path) : null;
}

/** Своя картинка из `art.overrides` (путь относительно public/). */
export function readOverride(item: ArtItem, root = '.'): Buffer | null {
  if (!item.override) return null;
  const path = join(root, PUBLIC_DIR, item.override);
  return existsSync(path) ? readFileSync(path) : null;
}
