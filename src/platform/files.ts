/** Отдаёт пользователю текстовый файл (скачивание в браузере). */
export function downloadText(fileName: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Читает выбранный пользователем файл как текст. */
export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** Безопасное имя файла из названия конфига. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'config';
}
