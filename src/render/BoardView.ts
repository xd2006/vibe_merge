import { Application, Container, Graphics, type FederatedPointerEvent } from 'pixi.js';
import {
  cellOf,
  entityAt,
  inBoard,
  isFinalItem,
  type Cell,
  type Command,
  type Entity,
  type GameState,
  type Rules,
} from '@/core';
import { formatDuration } from '@/i18n/ru';
import {
  createCellBackground,
  createPlaceholder,
  type PlaceholderSpec,
  type PlaceholderView,
} from './placeholder';
import type { ArtLibrary } from './art';

export interface BoardViewOptions {
  rules: Rules;
  /** Перенос предмета; доска не меняет состояние сама, только отправляет команды. */
  onCommand: (command: Command) => void;
  /** Тап по клетке (без перетаскивания), в том числе по пустой. */
  onTap: (cell: Cell, entity: Entity | null) => void;
  /** Второй тап по той же клетке вскоре после первого (сбор предмета). */
  onDoubleTap?: (cell: Cell, entity: Entity | null) => void;
  dark?: boolean;
  /** Арт предметов; без него — плейсхолдеры. */
  art?: ArtLibrary;
}

/** Что показать поверх состояния: выделение и режим выбора клетки. */
export interface BoardUi {
  selectedUid: number | null;
  /** Подсветить свободные клетки (возврат предмета из хранилища). */
  highlightFree: boolean;
}

interface Sprite {
  entity: Entity;
  /** Внешний вид; при смене (лопнул пузырь, замок стал открываемым) спрайт пересоздаётся. */
  look: string;
  view: PlaceholderView;
  /** Куда спрайт плавно едет: центр клетки. */
  target: { x: number; y: number };
}

/** Порог в пикселях, после которого нажатие считается перетаскиванием, а не тапом. */
const DRAG_THRESHOLD = 8;
/** Два тапа по одной клетке быстрее этого — двойной тап. */
const DOUBLE_TAP_MS = 350;

/**
 * Доска на PixiJS: рисует состояние ядра и превращает жесты в команды.
 * Мышь и тач обрабатываются одинаково через pointer-события.
 */
export class BoardView {
  private readonly app = new Application();
  private readonly cellsLayer = new Container();
  private readonly hintLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly selection = new Graphics();
  private readonly sprites = new Map<number, Sprite>();
  private state: GameState | null = null;
  private ui: BoardUi = { selectedUid: null, highlightFree: false };
  private cellSize = 0;
  private origin = { x: 0, y: 0 };
  private press: {
    uid: number | null;
    cell: Cell;
    start: { x: number; y: number };
    dragging: boolean;
  } | null = null;
  private destroyed = false;
  private lastTap: { cell: Cell; at: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private constructor(
    private readonly host: HTMLElement,
    private readonly options: BoardViewOptions,
  ) {}

  static async create(host: HTMLElement, options: BoardViewOptions): Promise<BoardView> {
    const view = new BoardView(host, options);
    await view.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
    });
    host.appendChild(view.app.canvas);
    view.app.stage.addChild(view.cellsLayer, view.hintLayer, view.entityLayer, view.selection);
    view.entityLayer.sortableChildren = true;
    view.bindInput();
    view.app.renderer.on('resize', () => view.relayout());
    // resizeTo следит только за окном; контейнер меняется и без этого (панель снизу
    // стала выше) — подстраиваем холст под контейнер.
    view.resizeObserver = new ResizeObserver(() => view.app.resize());
    view.resizeObserver.observe(host);
    view.app.ticker.add((ticker) => view.animate(ticker.deltaMS));
    view.relayout();
    return view;
  }

  update(state: GameState, ui: BoardUi): void {
    const hintChanged =
      ui.highlightFree !== this.ui.highlightFree || state.board !== this.state?.board;
    this.state = state;
    this.ui = ui;
    this.sync();
    if (hintChanged) this.drawHints();
  }

  /** Текущая частота кадров рендера доски. */
  fps(): number {
    return this.app.ticker.FPS;
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.app.destroy({ removeView: true }, { children: true });
  }

  // ---------- Раскладка ----------

  private relayout() {
    const { width, height } = this.options.rules.board;
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    this.cellSize = Math.floor(Math.min(w / width, h / height));
    this.origin = {
      x: Math.floor((w - this.cellSize * width) / 2),
      y: Math.floor((h - this.cellSize * height) / 2),
    };
    // Геометрия доски для e2e-тестов: по ней тест находит клетку на холсте.
    this.host.dataset.cellSize = String(this.cellSize);
    this.host.dataset.originX = String(this.origin.x);
    this.host.dataset.originY = String(this.origin.y);

    this.cellsLayer.removeChildren().forEach((c) => c.destroy());
    for (let i = 0; i < width * height; i++) {
      const { x, y } = cellOf({ width, height, cells: [] }, i);
      const bg = createCellBackground(this.cellSize, !!this.options.dark);
      bg.position.set(this.origin.x + x * this.cellSize, this.origin.y + y * this.cellSize);
      this.cellsLayer.addChild(bg);
    }
    // Размер плейсхолдеров зависит от размера клетки — пересоздаём спрайты.
    for (const s of this.sprites.values()) s.view.root.destroy({ children: true });
    this.sprites.clear();
    this.sync(true);
    this.drawHints();
  }

  private cellCenter(c: Cell) {
    return {
      x: this.origin.x + (c.x + 0.5) * this.cellSize,
      y: this.origin.y + (c.y + 0.5) * this.cellSize,
    };
  }

  private cellAt(p: { x: number; y: number }): Cell | null {
    if (!this.state) return null;
    const c = {
      x: Math.floor((p.x - this.origin.x) / this.cellSize),
      y: Math.floor((p.y - this.origin.y) / this.cellSize),
    };
    return inBoard(this.state.board, c) ? c : null;
  }

  // ---------- Синхронизация с состоянием ----------

  private sync(instant = false) {
    const state = this.state;
    if (!state || this.destroyed || this.cellSize <= 0) return;
    const seen = new Set<number>();
    let selectedCenter: { x: number; y: number } | null = null;
    state.board.cells.forEach((entity, i) => {
      if (!entity) return;
      seen.add(entity.uid);
      const center = this.cellCenter(cellOf(state.board, i));
      if (entity.uid === this.ui.selectedUid) selectedCenter = center;
      const spec = this.placeholderSpec(entity, state);
      const texture = this.textureFor(entity);
      const look = JSON.stringify(spec) + (texture ? ':art' : '');
      let sprite = this.sprites.get(entity.uid);
      if (sprite && sprite.look !== look) {
        // Внешний вид поменялся — новый плейсхолдер на месте старого.
        const { x, y } = sprite.view.root.position;
        sprite.view.root.destroy({ children: true });
        sprite.view = createPlaceholder(spec, this.cellSize, texture);
        sprite.view.root.position.set(x, y);
        sprite.look = look;
        this.entityLayer.addChild(sprite.view.root);
      }
      if (!sprite) {
        sprite = {
          entity,
          look,
          view: createPlaceholder(spec, this.cellSize, texture),
          target: center,
        };
        sprite.view.root.position.set(center.x, center.y);
        // Появление: предмет «выпрыгивает» из маленького размера.
        sprite.view.root.scale.set(instant ? 1 : 0.3);
        this.entityLayer.addChild(sprite.view.root);
        this.sprites.set(entity.uid, sprite);
      }
      sprite.entity = entity;
      sprite.target = center;
      this.updateTimer(sprite, state);
    });
    for (const [uid, sprite] of this.sprites) {
      if (seen.has(uid)) continue;
      sprite.view.root.destroy({ children: true });
      this.sprites.delete(uid);
    }
    this.drawSelection(selectedCenter);
  }

  /** Текстура предмета; у замка — текстура его содержимого. */
  private textureFor(e: Entity) {
    const art = this.options.art;
    if (!art) return null;
    if (e.kind === 'generator')
      return art.texture({ kind: 'generator', generator: e.generator, level: e.level });
    return art.texture({ kind: 'item', chain: e.chain, level: e.level });
  }

  private placeholderSpec(e: Entity, state: GameState): PlaceholderSpec {
    const { chains, generators } = this.options.rules;
    if (e.kind === 'generator') {
      const gen = generators.get(e.generator)!;
      return {
        colorKey: e.generator,
        name: gen.levels[e.level - 1]?.name ?? gen.name,
        level: e.level,
        maxLevel: gen.maxLevel,
        variant: 'generator',
        bubble: false,
        final: false,
      };
    }
    const chain = chains.get(e.chain)!;
    return {
      colorKey: e.chain,
      name: chain.levelNames[e.level - 1] ?? chain.name,
      level: e.level,
      maxLevel: chain.maxLevel,
      variant:
        e.kind === 'item'
          ? 'item'
          : state.lockGroups[e.group] === 'unlockable'
            ? 'lockUnlockable'
            : 'lockSealed',
      bubble: e.kind === 'item' && !!e.bubble,
      final: e.kind === 'item' && isFinalItem(this.options.rules, e.chain, e.level),
    };
  }

  private updateTimer(sprite: Sprite, state: GameState) {
    const { timer, overlay } = sprite.view;
    if (!timer) return;
    const e = sprite.entity;
    const until =
      e.kind === 'generator'
        ? e.cooldownUntil
        : e.kind === 'item'
          ? (e.bubble?.expiresAt ?? null)
          : null;
    timer.visible = until !== null;
    if (overlay) overlay.visible = until !== null;
    if (until !== null) {
      const text = formatDuration(until - state.nowMs);
      if (timer.text !== text) timer.text = text;
    }
  }

  private drawSelection(center: { x: number; y: number } | null) {
    this.selection.clear();
    if (!center) return;
    const half = this.cellSize / 2;
    this.selection
      .roundRect(
        center.x - half + 1,
        center.y - half + 1,
        this.cellSize - 2,
        this.cellSize - 2,
        this.cellSize * 0.16,
      )
      .stroke({ width: Math.max(2, this.cellSize * 0.05), color: 0xe8a317 });
  }

  private drawHints() {
    this.hintLayer.removeChildren().forEach((c) => c.destroy());
    const state = this.state;
    if (!state || !this.ui.highlightFree) return;
    const pad = Math.max(1, this.cellSize * 0.03);
    state.board.cells.forEach((e, i) => {
      if (e) return;
      const { x, y } = cellOf(state.board, i);
      const g = new Graphics()
        .roundRect(pad, pad, this.cellSize - pad * 2, this.cellSize - pad * 2, this.cellSize * 0.14)
        .fill({ color: 0x6fcf97, alpha: 0.35 });
      g.position.set(this.origin.x + x * this.cellSize, this.origin.y + y * this.cellSize);
      this.hintLayer.addChild(g);
    });
  }

  private animate(deltaMs: number) {
    const k = 1 - Math.exp(-deltaMs / 60);
    for (const [uid, s] of this.sprites) {
      if (this.press?.dragging && this.press.uid === uid) continue;
      const root = s.view.root;
      root.x += (s.target.x - root.x) * k;
      root.y += (s.target.y - root.y) * k;
      const scale = root.scale.x + (1 - root.scale.x) * k;
      root.scale.set(Math.abs(1 - scale) < 0.001 ? 1 : scale);
    }
  }

  // ---------- Ввод ----------

  private bindInput() {
    const stage = this.app.stage;
    stage.eventMode = 'static';
    stage.hitArea = this.app.screen;
    stage.on('pointerdown', (e) => this.onDown(e));
    stage.on('globalpointermove', (e) => this.onMove(e));
    stage.on('pointerup', () => this.onUp());
    stage.on('pointerupoutside', () => this.onUp());
  }

  /** Перетаскивать можно предметы и генераторы; замки — нет, пузыри — только при ubbles.movable. */
  private draggable(e: Entity | null): boolean {
    if (!e || e.kind === 'lock') return false;
    return e.kind === 'generator' || !e.bubble || this.options.rules.bubbles.movable;
  }

  private onDown(e: FederatedPointerEvent) {
    if (!this.state || this.press) return;
    const cell = this.cellAt(e.global);
    if (!cell) return;
    const entity = entityAt(this.state.board, cell);
    this.press = {
      uid: this.draggable(entity) ? entity!.uid : null,
      cell,
      start: { x: e.global.x, y: e.global.y },
      dragging: false,
    };
  }

  private onMove(e: FederatedPointerEvent) {
    const press = this.press;
    if (!press || press.uid === null) return;
    const sprite = this.sprites.get(press.uid);
    if (!sprite) return;
    if (!press.dragging) {
      const dist = Math.hypot(e.global.x - press.start.x, e.global.y - press.start.y);
      if (dist < DRAG_THRESHOLD) return;
      press.dragging = true;
      sprite.view.root.zIndex = 1;
      sprite.view.root.scale.set(1.1);
    }
    sprite.view.root.position.set(e.global.x, e.global.y);
  }

  private onUp() {
    const press = this.press;
    this.press = null;
    if (!press || !this.state) return;
    const sprite = press.uid === null ? undefined : this.sprites.get(press.uid);
    if (sprite) {
      sprite.view.root.zIndex = 0;
      sprite.view.root.scale.set(1);
    }
    if (!press.dragging) {
      const entity = entityAt(this.state.board, press.cell);
      const now = performance.now();
      const last = this.lastTap;
      const double =
        last !== null &&
        now - last.at < DOUBLE_TAP_MS &&
        last.cell.x === press.cell.x &&
        last.cell.y === press.cell.y;
      // Третий тап подряд снова считается первым.
      this.lastTap = double ? null : { cell: press.cell, at: now };
      this.options.onTap(press.cell, entity);
      if (double) this.options.onDoubleTap?.(press.cell, entityAt(this.state.board, press.cell));
      return;
    }
    const target = sprite ? this.cellAt(sprite.view.root.position) : null;
    if (target && (target.x !== press.cell.x || target.y !== press.cell.y)) {
      this.options.onCommand({ type: 'move', from: press.cell, to: target });
    }
    // Если перенос отклонён или цель вне доски, спрайт сам вернётся в свою клетку.
  }
}
