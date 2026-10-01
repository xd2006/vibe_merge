import {
  appendCommand,
  createEngine,
  type ApplyResult,
  type Command,
  type Engine,
  type GameEvent,
  type GameState,
  type RejectReason,
} from '@/core';
import type { GameConfig } from '@/config';

export interface Rejection {
  reason: RejectReason;
  /** Растёт с каждым отказом, чтобы интерфейс показал повторный отказ с той же причиной. */
  seq: number;
}

/**
 * Живая партия в браузере: состояние, журнал команд и событий, игровой цикл.
 * Ядро ничего не знает о реальном времени — сессия переводит кадры в команды `tick`.
 */
export class GameSession {
  readonly engine: Engine;
  state: GameState;
  readonly log: Command[] = [];
  readonly events: GameEvent[] = [];
  lastRejection: Rejection | null = null;

  private listeners = new Set<() => void>();
  private frame = 0;
  private lastFrameAt = 0;
  private carryMs = 0;

  constructor(readonly config: GameConfig) {
    this.engine = createEngine(config);
    this.state = this.engine.initialState();
  }

  dispatch(command: Command): ApplyResult {
    const result = this.engine.apply(this.state, command);
    appendCommand(this.log, command);
    if (result.rejected) {
      this.lastRejection = { reason: result.rejected, seq: (this.lastRejection?.seq ?? 0) + 1 };
    } else {
      this.state = result.state;
      this.events.push(...result.events);
    }
    this.notify();
    return result;
  }

  start(): void {
    if (this.frame) return;
    this.lastFrameAt = performance.now();
    const loop = (now: number) => {
      // Время передаётся целыми миллисекундами, дробный остаток копится до следующего кадра.
      const elapsed = now - this.lastFrameAt + this.carryMs;
      this.lastFrameAt = now;
      const dtMs = Math.floor(elapsed);
      this.carryMs = elapsed - dtMs;
      if (dtMs > 0) this.dispatch({ type: 'tick', dtMs });
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify() {
    for (const l of this.listeners) l();
  }
}
