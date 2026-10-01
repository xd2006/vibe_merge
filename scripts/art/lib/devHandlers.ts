// Обработчики /__art/* dev-сервера: генерация и импорт одного предмета из редактора.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { artItems } from '../../../src/art';
import { validateConfig } from '../../../src/validator';
import { loadEnv } from './config';
import { GeminiError, artModel } from './gemini';
import { ArtError, generateItem, importImage } from './ops';

interface Body {
  config: unknown;
  key: string;
  /** Картинка для импорта, base64 без префикса data:. */
  image?: string;
}

function readBody(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
    req.on('error', reject);
  });
}

function reply(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Только POST' });
  const action = (req.url ?? '').replace(/^\//, '').split('?')[0];
  const body = await readBody(req);
  const validation = validateConfig(body.config);
  if (!validation.ok || !validation.config) {
    return reply(res, 400, { error: 'Конфиг содержит ошибки — исправьте их в редакторе' });
  }
  const config = validation.config;
  const item = artItems(config).find((it) => it.key === body.key);
  if (!item) return reply(res, 404, { error: `Предмет «${body.key}» не найден` });

  try {
    if (action === 'generate') {
      loadEnv();
      return reply(res, 200, { entry: await generateItem(config, item, artModel()) });
    }
    if (action === 'import') {
      if (!body.image) return reply(res, 400, { error: 'Нет картинки' });
      return reply(res, 200, {
        entry: await importImage(config, item, Buffer.from(body.image, 'base64')),
      });
    }
    return reply(res, 404, { error: `Неизвестное действие «${action}»` });
  } catch (e) {
    if (e instanceof ArtError || e instanceof GeminiError)
      return reply(res, 400, { error: e.message });
    throw e;
  }
}
