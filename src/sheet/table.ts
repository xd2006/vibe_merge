/** Значение ячейки: у формулы — сохранённый результат, пустая ячейка и ошибка — `null`. */
export type CellValue = string | number | boolean | null;

/** Книга: имя листа → строки сверху вниз (первая — заголовки). */
export type SheetBook = Record<string, CellValue[][]>;

/** Лист по имени без учёта регистра и пробелов по краям (в выгрузке бывает « Bonus Order Reward»). */
export function sheet(book: SheetBook, name: string): CellValue[][] | null {
  const key = Object.keys(book).find((k) => k.trim().toLowerCase() === name.toLowerCase());
  return key === undefined ? null : book[key]!;
}

const isBlank = (v: CellValue) => v === null || (typeof v === 'string' && v.trim() === '');

export function rowBlank(row: readonly CellValue[]): boolean {
  return row.every(isBlank);
}

/** Строки листа как объекты по заголовкам; пустые строки пропускаются. */
export function records(rows: CellValue[][] | null): Record<string, CellValue>[] {
  if (!rows || rows.length === 0) return [];
  const header = rows[0]!.map((h) => (typeof h === 'string' ? h.trim() : ''));
  return rows
    .slice(1)
    .filter((r) => !rowBlank(r))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? null])));
}

export function str(v: CellValue): string | null {
  if (isBlank(v)) return null;
  return String(v).trim();
}

export function num(v: CellValue): number | null {
  if (isBlank(v) || typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function bool(v: CellValue): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = str(v)?.toLowerCase();
  if (s === 'true' || s === '1' || s === 'да') return true;
  if (s === 'false' || s === '0' || s === 'нет') return false;
  return null;
}

// Кириллические буквы, похожие на латинские (в выгрузке `chain_С_01` с русской «С»).
const LOOKALIKES: Record<string, string> = {
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
};

/** id объекта из таблицы с кириллическими двойниками латинских букв, заменёнными на латиницу. */
export function normId(id: string): string {
  return [...id.trim()].map((ch) => LOOKALIKES[ch] ?? ch).join('');
}

/** id для конфига: латиница в нижнем регистре, цифры и `_`. */
export function configId(id: string): string {
  const s = normId(id)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return /^[a-z]/.test(s) ? s : `x_${s}`;
}
