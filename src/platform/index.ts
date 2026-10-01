/** Платформенные сервисы: хранение (IndexedDB или Capacitor), «Поделиться», работа с файлами. */
export { readJSON, removeKey, writeJSON } from './storage';
export { dbClear, dbGetAll, dbPut, type StoreName } from './db';
export { downloadText, exportText, readFileText, safeFileName } from './files';
export { isNativeApp } from './native';
