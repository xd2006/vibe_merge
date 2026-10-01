import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';

/** Стабильный оттенок по строке: у каждой цепочки и генератора свой цвет. */
export function hueOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

function hsl(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

export type PlaceholderVariant = 'item' | 'generator' | 'lockSealed' | 'lockUnlockable';

export interface PlaceholderSpec {
  colorKey: string;
  name: string;
  level: number;
  maxLevel: number;
  variant: PlaceholderVariant;
  bubble: boolean;
}

export interface PlaceholderView {
  root: Container;
  /** Затемнение кулдауна генератора. */
  overlay?: Graphics;
  /** Таймер: кулдаун генератора или срок жизни пузыря. */
  timer?: Text;
}

const FONT = 'system-ui, sans-serif';

/** Замок: дужка и корпус. */
function padlock(size: number, color: number): Graphics {
  const w = size * 0.5;
  const h = size * 0.38;
  const g = new Graphics();
  g.arc(0, -h / 2, w * 0.32, Math.PI, 0).stroke({ width: Math.max(2, size * 0.08), color });
  g.roundRect(-w / 2, -h / 2, w, h, size * 0.06).fill(color);
  return g;
}

/**
 * Плейсхолдер вместо арта: цветная плашка с названием и уровнем. Чем выше уровень,
 * тем насыщеннее цвет. Генератор — тёмная плашка с цветной рамкой. Запечатанный замок —
 * серая плашка с замком; открытый для слияния — полупрозрачное содержимое с замком.
 */
export function createPlaceholder(
  spec: PlaceholderSpec,
  size: number,
  texture: Texture | null = null,
): PlaceholderView {
  const root = new Container();
  const pad = Math.max(2, size * 0.06);
  const inner = size - pad * 2;
  const radius = size * 0.18;
  const hue = hueOf(spec.colorKey);
  const t = spec.maxLevel > 1 ? (spec.level - 1) / (spec.maxLevel - 1) : 1;
  const isGenerator = spec.variant === 'generator';

  if (spec.variant === 'lockSealed') {
    root.addChild(
      new Graphics().roundRect(-inner / 2, -inner / 2, inner, inner, radius).fill(0x8a8578),
    );
    root.addChild(padlock(size, 0xf2efe8));
    return { root };
  }

  const content = new Container();
  root.addChild(content);
  if (texture) {
    // Арт вместо плашки: вписывается в клетку с полем, название не нужно — его видно на картинке.
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const scale = inner / Math.max(texture.width, texture.height);
    sprite.scale.set(scale);
    content.addChild(sprite);
  } else {
    const bg = new Graphics();
    if (isGenerator) {
      bg.roundRect(-inner / 2, -inner / 2, inner, inner, radius)
        .fill(hsl(hue, 35, 22))
        .stroke({ width: Math.max(2, size * 0.06), color: hsl(hue, 70, 55) });
    } else {
      bg.roundRect(-inner / 2, -inner / 2, inner, inner, radius).fill(
        hsl(hue, 45 + 40 * t, 78 - 30 * t),
      );
    }
    content.addChild(bg);
  }

  const label = new Text({
    text: spec.name,
    style: {
      fontFamily: FONT,
      fontSize: Math.max(9, size * 0.15),
      fontWeight: '600',
      fill: isGenerator ? 0xffffff : 0x1d1d1f,
      align: 'center',
      // Переносим только по пробелам; слово длиннее плашки уменьшается целиком (ниже).
      wordWrap: true,
      wordWrapWidth: inner - pad,
    },
  });
  label.anchor.set(0.5);
  const maxLabelWidth = inner - pad;
  if (label.width > maxLabelWidth) label.scale.set(maxLabelWidth / label.width);
  label.y = -size * 0.04;
  if (!texture) content.addChild(label);
  else label.destroy();

  const badgeR = size * 0.14;
  const bx = inner / 2 - badgeR * 0.9;
  const badge = new Graphics()
    .circle(bx, bx, badgeR)
    .fill(isGenerator ? hsl(hue, 70, 55) : 0x1d1d1f);
  const badgeText = new Text({
    text: String(spec.level),
    style: { fontFamily: FONT, fontSize: badgeR * 1.2, fontWeight: '700', fill: 0xffffff },
  });
  badgeText.anchor.set(0.5);
  badgeText.position.set(bx, bx);
  content.addChild(badge, badgeText);

  const view: PlaceholderView = { root };

  if (spec.variant === 'lockUnlockable') {
    content.alpha = 0.45;
    const lock = padlock(size * 0.6, 0x4a463e);
    lock.position.set(-inner / 2 + size * 0.17, -inner / 2 + size * 0.17);
    root.addChild(lock);
    return view;
  }

  if (spec.bubble) {
    root.addChild(
      new Graphics()
        .circle(0, 0, size * 0.47)
        .fill({ color: 0xffffff, alpha: 0.35 })
        .stroke({ width: Math.max(2, size * 0.04), color: 0x6fb7ff }),
    );
  }

  if (isGenerator) {
    view.overlay = new Graphics()
      .roundRect(-inner / 2, -inner / 2, inner, inner, radius)
      .fill({ color: 0x000000, alpha: 0.55 });
    view.overlay.visible = false;
    root.addChild(view.overlay);
  }
  if (isGenerator || spec.bubble) {
    view.timer = new Text({
      text: '',
      style: {
        fontFamily: FONT,
        fontSize: size * (isGenerator ? 0.2 : 0.14),
        fontWeight: '700',
        fill: isGenerator ? 0xffffff : 0x0b4a8b,
      },
    });
    view.timer.anchor.set(0.5);
    // Таймер пузыря — сверху, чтобы не закрывать значок уровня в правом нижнем углу.
    if (spec.bubble) view.timer.y = -size * 0.3;
    view.timer.visible = false;
    root.addChild(view.timer);
  }
  return view;
}

/** Фон клетки доски. */
export function createCellBackground(size: number, dark: boolean): Graphics {
  const pad = Math.max(1, size * 0.03);
  return new Graphics()
    .roundRect(pad, pad, size - pad * 2, size - pad * 2, size * 0.14)
    .fill(dark ? 0x2a2d34 : 0xe9e4d8);
}
