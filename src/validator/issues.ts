import type { GameConfig } from '@/config';

export type IssueLevel = 'error' | 'warning';

/** Проблема в конфиге: путь к полю, описание простым языком и подсказка, как исправить. */
export interface Issue {
  level: IssueLevel;
  /** Путь к полю: `generators[0].levels[1].produces[0].chain`; пустая строка — конфиг целиком. */
  path: string;
  message: string;
  hint: string;
  /** Машинный код проверки — для тестов и фильтрации. */
  code: string;
}

export interface TextPosition {
  /** Смещение в символах от начала текста. */
  offset: number;
  /** Строка и столбец, с 1. */
  line: number;
  column: number;
}

export interface ValidationResult {
  /** Разобранный конфиг (со значениями по умолчанию); `null`, если не прошла схема или синтаксис. */
  config: GameConfig | null;
  issues: Issue[];
  /** Ошибок нет — прототип можно запускать (предупреждения запуск не блокируют). */
  ok: boolean;
  /** Место синтаксической ошибки JSON, если она есть. */
  syntaxError?: TextPosition;
}

export const hasErrors = (issues: readonly Issue[]) => issues.some((i) => i.level === 'error');
