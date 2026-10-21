import { useEffect, useMemo, useState } from 'react';
import { readJSON, writeJSON } from '@/platform';
import { parseJsonText, validateText, type ValidationResult } from '@/validator';
import demo from '../../presets/demo.json';
import empty from '../../presets/empty.json';
import spiceCore from '../../presets/spice-core.json';

const DRAFT_KEY = 'vibe-merge.draft.v2';

export const PRESETS = [
  { id: 'spice-core', title: 'Spice merge: Core Merge Config (last)', config: spiceCore },
  { id: 'demo', title: 'Демо: лесопилка и карьер', config: demo },
  { id: 'empty', title: 'Пустой шаблон', config: empty },
] as const;

export const toText = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

const presetTexts = PRESETS.map((p) => ({ id: p.id, text: toText(p.config) }));

/** Файл, из которого получен текст конфига (загрузка или импорт таблицы). */
export interface FileSource {
  name: string;
  text: string;
}

/** Значение пункта списка пресетов для конфига, полученного из файла. */
export const FILE_OPTION = '__file__';

/**
 * Что показать в списке пресетов: id пресета с таким же текстом, пункт файла, пока текст
 * не правили после загрузки, иначе `''` («Пресет…»).
 */
export const presetSelectValue = (text: string, file: FileSource | null): string =>
  presetTexts.find((p) => p.text === text)?.id ?? (file?.text === text ? FILE_OPTION : '');

/** Последний черновик конфига (как текст — даже невалидный) или пресет по умолчанию (Core Merge Config). */
export function loadDraft(): string {
  return readJSON<{ text: string }>(DRAFT_KEY)?.text ?? toText(spiceCore);
}

/**
 * Черновик конфига: текст — единственный источник правды. Форма работает с разобранным
 * значением; пока JSON невалиден, у формы остаётся последнее валидное значение,
 * но редактировать её нельзя.
 */
export function useDraft() {
  const [text, setTextState] = useState(loadDraft);
  const [value, setValueState] = useState<unknown>(() => {
    const r = parseJsonText(text);
    return r.ok ? r.value : null;
  });
  const [validation, setValidation] = useState<ValidationResult>(() => validateText(text));
  const jsonValid = useMemo(() => parseJsonText(text).ok, [text]);

  const setText = (next: string) => {
    setTextState(next);
    const r = parseJsonText(next);
    if (r.ok) setValueState(r.value);
  };
  const setValue = (next: unknown) => {
    setValueState(next);
    setTextState(toText(next));
  };

  // Черновик сохраняется сразу (переход в прототип не должен терять правку),
  // а полная проверка — с небольшой задержкой, чтобы не мешать набору.
  useEffect(() => {
    writeJSON(DRAFT_KEY, { text });
    const timer = setTimeout(() => setValidation(validateText(text)), 250);
    return () => clearTimeout(timer);
  }, [text]);

  return { text, setText, value, setValue, validation, jsonValid };
}
