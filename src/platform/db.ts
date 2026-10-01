/**
 * Небольшая обёртка над IndexedDB для данных, которые не помещаются в localStorage
 * (журналы событий сессий). В браузере и в WebView Capacitor база живёт в данных приложения.
 * Если IndexedDB недоступна, данные хранятся в памяти до закрытия страницы.
 */
const DB_NAME = 'vibe-merge';
const VERSION = 1;
export const STORES = ['sessions'] as const;
export type StoreName = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<StoreName, Map<string, unknown>>();

function open(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        for (const store of STORES) {
          if (!req.result.objectStoreNames.contains(store))
            req.result.createObjectStore(store, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbPut<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  const db = await open();
  if (!db) {
    (memory.get(store) ?? memory.set(store, new Map()).get(store)!).set(value.id, value);
    return;
  }
  await request(db.transaction(store, 'readwrite').objectStore(store).put(value));
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await open();
  if (!db) return [...(memory.get(store)?.values() ?? [])] as T[];
  return request(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}

export async function dbClear(store: StoreName): Promise<void> {
  const db = await open();
  if (!db) {
    memory.get(store)?.clear();
    return;
  }
  await request(db.transaction(store, 'readwrite').objectStore(store).clear());
}
