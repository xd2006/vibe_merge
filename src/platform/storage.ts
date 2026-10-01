/**
 * Локальное хранилище ключ–значение. В браузере и в WebView Capacitor это localStorage
 * приложения: данные переживают перезапуск. Ошибки доступа (приватный режим, квота)
 * не роняют прототип — сохранение просто не происходит.
 */
export function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Нечего удалять или нет доступа — не важно.
  }
}
