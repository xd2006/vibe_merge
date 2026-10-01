import { dbClear, dbGetAll, dbPut } from '@/platform';
import type { SessionRecord } from '@/telemetry';
import type { GameSession } from './session';

/**
 * Запись сессии телеметрии: каждый запуск прототипа — отдельная сессия со своим журналом.
 * Журнал берётся из игровой сессии и сохраняется в IndexedDB целиком.
 */
export class SessionRecorder {
  readonly id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  private readonly startedAt = Date.now();

  constructor(
    private readonly session: GameSession,
    private readonly configHash: string,
  ) {}

  record(): SessionRecord {
    return {
      id: this.id,
      configHash: this.configHash,
      configName: this.session.config.meta.name,
      startedAt: this.startedAt,
      updatedAt: Date.now(),
      playMs: this.session.playMs,
      events: this.session.events,
    };
  }

  save(): Promise<void> {
    // Копия журнала: IndexedDB сериализует асинхронно, а игра продолжает добавлять события.
    return dbPut('sessions', { ...this.record(), events: [...this.session.events] }).catch(
      () => {},
    );
  }
}

/** Все сессии этого конфига, от старых к новым; текущая — в актуальном виде из памяти. */
export async function sessionsFor(
  configHash: string,
  current: SessionRecorder,
): Promise<SessionRecord[]> {
  const stored = await dbGetAll<SessionRecord>('sessions').catch(() => [] as SessionRecord[]);
  const others = stored.filter((s) => s.configHash === configHash && s.id !== current.id);
  return [...others, current.record()].sort((a, b) => a.startedAt - b.startedAt);
}

export function clearSessions(): Promise<void> {
  return dbClear('sessions').catch(() => {});
}
