import { describe, expect, it } from 'vitest';
import { PRESETS, presetIdOf, toText } from './draft';

describe('presetIdOf', () => {
  it('возвращает id пресета, чей текст совпадает с конфигом', () => {
    for (const p of PRESETS) expect(presetIdOf(toText(p.config))).toBe(p.id);
  });

  it('после правки или для чужого текста — пустая строка (пункт «Пресет…»)', () => {
    expect(presetIdOf(toText(PRESETS[0].config).replace('{', '{ '))).toBe('');
    expect(presetIdOf('{}')).toBe('');
  });
});
