import { describe, expect, it } from 'vitest';
import { FILE_OPTION, PRESETS, presetSelectValue, toText } from './draft';

describe('presetSelectValue', () => {
  it('возвращает id пресета, чей текст совпадает с конфигом', () => {
    for (const p of PRESETS) expect(presetSelectValue(toText(p.config), null)).toBe(p.id);
  });

  it('после правки или для чужого текста — пустая строка (пункт «Пресет…»)', () => {
    expect(presetSelectValue(toText(PRESETS[0].config).replace('{', '{ '), null)).toBe('');
    expect(presetSelectValue('{}', null)).toBe('');
  });

  it('конфиг из файла показывается пунктом файла, пока текст не правили', () => {
    const file = { name: 'Core Merge Config last.xlsx', text: '{"a":1}\n' };
    expect(presetSelectValue(file.text, file)).toBe(FILE_OPTION);
    expect(presetSelectValue('{"a":2}\n', file)).toBe('');
  });

  it('файл, совпавший с пресетом, показывается как пресет', () => {
    const text = toText(PRESETS[1].config);
    expect(presetSelectValue(text, { name: 'x.json', text })).toBe(PRESETS[1].id);
  });
});
