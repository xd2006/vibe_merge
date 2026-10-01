// Генерация картинки через Gemini API (эндпоинт interactions, см. ai.google.dev/gemini-api/docs/image-generation).
// Ключ берётся только из окружения скрипта и в веб-билд не попадает.

export const DEFAULT_MODEL = 'gemini-3.1-flash-image';

export class GeminiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new GeminiError(0, 'Не задан GEMINI_API_KEY: добавьте его в файл .env в корне проекта');
  }
  return key;
}

/** Модель из ART_MODEL или по умолчанию. */
export const artModel = () => process.env.ART_MODEL || DEFAULT_MODEL;

/** Ищет base64-данные картинки в ответе — формат ответа API ещё меняется. */
function findImage(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === 'data' && typeof v === 'string' && v.length > 1000) return v;
    const found = findImage(v);
    if (found) return found;
  }
  return null;
}

export interface GenerateRequest {
  prompt: string;
  /** Референс: картинка того же семейства (PNG) — для единого стиля цепочки. */
  reference?: Buffer;
  model?: string;
}

export async function generateImage({
  prompt,
  reference,
  model = artModel(),
}: GenerateRequest): Promise<Buffer> {
  const body = {
    model,
    input: [
      { type: 'text', text: prompt },
      ...(reference
        ? [{ type: 'image', mime_type: 'image/png', data: reference.toString('base64') }]
        : []),
    ],
    // API отдаёт только JPEG: прозрачности нет, фон вырезается постобработкой.
    response_format: {
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '1:1',
      image_size: '1K',
    },
  };
  const send = () =>
    fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  let res = await send();
  // Поминутный лимит — одна повторная попытка через 30 с; суточный или нулевой лимит ждать бессмысленно.
  if (res.status === 429) {
    const text = await res.clone().text();
    if (/per minute/i.test(text) && !/limit: 0/.test(text)) {
      await new Promise((r) => setTimeout(r, 30_000));
      res = await send();
    }
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? text;
    } catch {
      // Ответ не JSON — оставляем как есть.
    }
    throw new GeminiError(res.status, `Gemini ${res.status}: ${message}`);
  }
  const data = findImage(JSON.parse(text));
  if (!data) throw new GeminiError(res.status, 'В ответе Gemini нет картинки');
  return Buffer.from(data, 'base64');
}
