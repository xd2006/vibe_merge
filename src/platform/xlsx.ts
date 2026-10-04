import type { CellValue, SheetBook } from '@/sheet';

type RawValue = unknown;

/** Значение ячейки exceljs → простое значение; у формулы — сохранённый результат. */
function plain(v: RawValue): CellValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as {
      result?: RawValue;
      richText?: { text: string }[];
      text?: RawValue;
      error?: unknown;
    };
    if ('result' in o) return plain(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if ('text' in o) return plain(o.text);
  }
  // Формула без сохранённого результата, ошибка (#REF!) и прочее — пустая ячейка.
  return null;
}

/**
 * Читает книгу .xlsx (выгрузку Google Таблиц) в листы из простых значений.
 * exceljs грузится по требованию: он большой и нужен только импорту.
 */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<SheetBook> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const book: SheetBook = {};
  wb.eachSheet((ws) => {
    const rows: CellValue[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: CellValue[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(plain(row.getCell(c).value));
      rows.push(cells);
    }
    book[ws.name] = rows;
  });
  return book;
}
