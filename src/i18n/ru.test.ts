import { describe, expect, it } from 'vitest';
import { t } from './ru';

describe('t', () => {
  it('возвращает строку по ключу', () => {
    expect(t('app.title')).toBe('Merge-2 прототип');
  });

  it('оставляет строку без изменений, если параметров нет в шаблоне', () => {
    expect(t('app.title', { count: 3 })).toBe('Merge-2 прототип');
  });
});
