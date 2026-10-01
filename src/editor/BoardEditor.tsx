import { useState } from 'react';
import { t } from '@/i18n/ru';

interface BoardDraft {
  width?: unknown;
  height?: unknown;
  legend?: unknown;
  layout?: unknown;
  locks?: unknown;
}

type LegendEntry = null | { item?: string; generator?: string; level?: number };

const toInt = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback;

/** Описание символа легенды для палитры. */
function describe(entry: LegendEntry | undefined): string {
  if (entry === undefined) return t('editor.board.unknownSymbol');
  if (entry === null) return t('editor.board.empty');
  if (entry.generator) return `${entry.generator} ${entry.level ?? ''}`;
  return `${entry.item ?? '?'} ${entry.level ?? ''}`;
}

/**
 * Раскладка доски как редактируемая сетка: выберите символ легенды и рисуйте по клеткам.
 * Размер меняется полями ширины и высоты: строки дополняются «.» или обрезаются.
 */
export function BoardEditor({
  board,
  onChange,
}: {
  board: BoardDraft;
  onChange: (b: BoardDraft) => void;
}) {
  const width = toInt(board.width, 7);
  const height = toInt(board.height, 9);
  const legend = (typeof board.legend === 'object' && board.legend ? board.legend : {}) as Record<
    string,
    LegendEntry
  >;
  const layout = Array.isArray(board.layout)
    ? board.layout.map((r) => (typeof r === 'string' ? r : ''))
    : [];
  const symbols = Object.keys(legend);
  const empty = symbols.find((s) => legend[s] === null) ?? '.';
  const [brush, setBrush] = useState<string>(symbols[0] ?? '.');
  const [painting, setPainting] = useState(false);

  const lockCells = new Set<string>();
  if (Array.isArray(board.locks)) {
    for (const lock of board.locks as { cells?: unknown }[]) {
      if (!Array.isArray(lock?.cells)) continue;
      for (const c of lock.cells) if (Array.isArray(c)) lockCells.add(`${c[0]},${c[1]}`);
    }
  }

  const grid = Array.from({ length: height }, (_, y) => {
    const row = [...(layout[y] ?? '')];
    return Array.from({ length: width }, (_, x) => row[x] ?? empty);
  });

  const commit = (next: string[][], w = width, h = height) =>
    onChange({ ...board, width: w, height: h, layout: next.map((r) => r.join('')) });

  const paint = (x: number, y: number) => {
    if (grid[y]![x] === brush) return;
    const next = grid.map((r) => [...r]);
    next[y]![x] = brush;
    commit(next);
  };

  const resize = (w: number, h: number) => {
    if (w < 1 || h < 1 || w > 20 || h > 20) return;
    const next = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => grid[y]?.[x] ?? empty),
    );
    commit(next, w, h);
  };

  return (
    <section
      className="board-editor"
      onPointerUp={() => setPainting(false)}
      onPointerLeave={() => setPainting(false)}
    >
      <div className="board-size">
        <label>
          {t('editor.board.width')}{' '}
          <input
            type="number"
            min={1}
            max={20}
            value={width}
            onChange={(e) => resize(Number(e.target.value), height)}
          />
        </label>
        <label>
          {t('editor.board.height')}{' '}
          <input
            type="number"
            min={1}
            max={20}
            value={height}
            onChange={(e) => resize(width, Number(e.target.value))}
          />
        </label>
      </div>
      <div className="palette" role="radiogroup" aria-label={t('editor.board.palette')}>
        {symbols.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={brush === s}
            className={brush === s ? 'swatch swatch-on' : 'swatch'}
            onClick={() => setBrush(s)}
          >
            <code>{s}</code> {describe(legend[s])}
          </button>
        ))}
      </div>
      <p className="hud-sub">{t('editor.board.help')}</p>
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${width}, 32px)` }}
        data-testid="layout-grid"
      >
        {grid.flatMap((row, y) =>
          row.map((s, x) => (
            <button
              key={`${x},${y}`}
              type="button"
              className={`gcell${legend[s] === undefined ? ' gcell-bad' : ''}${lockCells.has(`${x},${y}`) ? ' gcell-lock' : ''}`}
              title={`(${x}, ${y}) ${describe(legend[s])}`}
              onPointerDown={() => {
                setPainting(true);
                paint(x, y);
              }}
              onPointerEnter={() => painting && paint(x, y)}
            >
              {lockCells.has(`${x},${y}`) ? '🔒' : s === empty ? '' : s}
            </button>
          )),
        )}
      </div>
    </section>
  );
}
