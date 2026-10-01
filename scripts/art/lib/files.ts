/** Безопасное имя файла из названия (как в браузерной части, но без DOM-зависимостей). */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'config';
}
