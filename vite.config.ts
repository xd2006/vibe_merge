import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { artDevServer } from './scripts/art/devPlugin';

export default defineConfig({
  plugins: [react(), artDevServer()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Относительные пути нужны для Capacitor: веб-билд открывается из файлов приложения.
  base: './',
  build: {
    // Стоковый System WebView в Android 11 — Chromium 83; без обновления из Google Play
    // новый синтаксис (??=, приватные методы и т. п.) в нём не разбирается.
    target: ['es2020', 'chrome83'],
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
