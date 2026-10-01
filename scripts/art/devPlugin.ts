// Vite-плагин для npm run dev: эндпоинты /__art/* для редактора (генерация и импорт одного
// предмета). Работают только в dev-сервере на машине дизайнера: ключ Gemini остаётся в Node,
// в браузер и в сборку не попадает.
import type { Plugin } from 'vite';

export function artDevServer(): Plugin {
  return {
    name: 'vibe-merge-art-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__art', (req, res) => {
        // Обработчики грузятся через Vite: так работают алиасы и свежий код без перезапуска.
        void server
          .ssrLoadModule('/scripts/art/lib/devHandlers.ts')
          .then((mod) => (mod as typeof import('./lib/devHandlers')).handle(req, res))
          .catch((e: unknown) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
          });
      });
    },
  };
}
