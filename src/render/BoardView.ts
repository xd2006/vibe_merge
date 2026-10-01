import { Application, Container, type FederatedPointerEvent } from 'pixi.js';
import {
  cellOf,
  entityAt,
  inBoard,
  type Cell,
  type Command,
  type Entity,
  type GameState,
  type Rules,
} from '@/core';
import { formatDuration } from '@/i18n/ru';
import { createCellBackground, createPlaceholder, type PlaceholderView } from './placeholder';

export interface BoardViewOptions {
  rules: Rules;
  /** Команда игрока; доска не меняет состояние сама, только отправляет команды. */
  onCommand: (command: Command) => void;
  dark?: boolean;
}

interface Sprite {
  entity: Entity;
  view: PlaceholderView;
  /** Куда сприт плавно едет: центр клетки. */
  target: { x: number; y: number };
}

/** Порог в пикселях, после которого нажатие считается перетаскиванием, а не тапом. */
const DRAG_THRESHOLD = 8;

/**
 * Доска на PixiJS: рисует состояние ядра и превращает жесты в команды.
 * Мышь и тач обрабатываются одинаково через pointer-события.
 */
export class BoardView {
  private readonly app = new Application();
  private readonly cellsLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly sprites = new Map<number, Sprite>();
  private state: GameState | null = null;
  private cellSize = 0;
  private origin = { x: 0, y: 0 };
  private press: {
    uid: number;
    cell: Cell;
    start: { x: number; y: number };
    dragging: boolean;
  } | null = null;
  private destroyed = false;

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
    view.app.stage.addChild(view.cellsLayer, view.entityLayer);
    view.entityLayer.sortableChildren = true;
    view.bindInput();
    view.app.renderer.on('resize', () => view.relayout());
    view.app.ticker.add((ticker) => view.animate(ticker.deltaMS));
    view.relayout();
    return view;
  }

  update(state: GameState): void {
    this.state = state;
    this.sync();
  }

  destroy(): void {
    this.destroyed = true;
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
    state.board.cells.forEach((entity, i) => {
      if (!entity) return;
      seen.add(entity.uid);
      const center = this.cellCenter(cellOf(state.board, i));
      let sprite = this.sprites.get(entity.uid);
      if (!sprite) {
        sprite = {
          entity,
          view: createPlaceholder(this.placeholderSpec(entity), this.cellSize),
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
      this.updateCooldown(sprite, state);
    });
    for (const [uid, sprite] of this.sprites) {
      if (seen.has(uid)) continue;
      sprite.view.root.destroy({ children: true });
      this.sprites.delete(uid);
    }
  }

  private placeholderSpec(e: Entity) {
    const { chains, generators } = this.options.rules;
    if (e.kind === 'item') {
      const chain = chains.get(e.chain)!;
      return {
        colorKey: e.chain,
        name: chain.levelNames[e.level - 1] ?? chain.name,
        level: e.level,
        maxLevel: chain.maxLevel,
        isGenerator: false,
      };
    }
    const gen = generators.get(e.generator)!;
    return {
      colorKey: e.generator,
      name: gen.levels[e.level - 1]?.name ?? gen.name,
      level: e.level,
      maxLevel: gen.maxLevel,
      isGenerator: true,
    };
  }

  private updateCooldown(sprite: Sprite, state: GameState) {
    const cd = sprite.view.cooldown;
    if (!cd || sprite.entity.kind !== 'generator') return;
    const until = sprite.entity.cooldownUntil;
    const active = until !== null;
    cd.overlay.visible = active;
    cd.label.visible = active;
    if (active) {
      const text = formatDuration(until - state.nowMs);
      if (cd.label.text !== text) cd.label.text = text;
    }
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

  private onDown(e: FederatedPointerEvent) {
    if (!this.state || this.press) return;
    const cell = this.cellAt(e.global);
    if (!cell) return;
    const entity = entityAt(this.state.board, cell);
    if (!entity) return;
    this.press = {
      uid: entity.uid,
      cell,
      start: { x: e.global.x, y: e.global.y },
      dragging: false,
    };
  }

  private onMove(e: FederatedPointerEvent) {
    const press = this.press;
    if (!press) return;
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
    const sprite = this.sprites.get(press.uid);
    if (sprite) {
      sprite.view.root.zIndex = 0;
      sprite.view.root.scale.set(1);
    }
    if (!press.dragging) {
      if (sprite?.entity.kind === 'generator') {
        this.options.onCommand({ type: 'tapGenerator', at: press.cell });
      }
      return;
    }
    const target = sprite ? this.cellAt(sprite.view.root.position) : null;
    if (target && (target.x !== press.cell.x || target.y !== press.cell.y)) {
      this.options.onCommand({ type: 'move', from: press.cell, to: target });
    }
    // Если перенос отклонён или цель вне доски, сприт сам вернётся в свою клетку.
  }
}
