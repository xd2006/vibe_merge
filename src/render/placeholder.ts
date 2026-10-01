import { Container, Graphics, Text } from 'pixi.js';

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

export interface PlaceholderSpec {
  colorKey: string;
  name: string;
  level: number;
  maxLevel: number;
  isGenerator: boolean;
}

export interface PlaceholderView {
  root: Container;
  /** Затемнение и таймер кулдауна; есть только у генераторов. */
  cooldown?: { overlay: Graphics; label: Text };
}

/**
 * Плейсхолдер вместо арта: цветная плашка с названием и уровнем. Чем выше уровень,
 * тем насыщеннее цвет. Генератор — тёмная плашка с цветной рамкой.
 */
export function createPlaceholder(spec: PlaceholderSpec, size: number): PlaceholderView {
  const root = new Container();
  const pad = Math.max(2, size * 0.06);
  const inner = size - pad * 2;
  const radius = size * 0.18;
  const hue = hueOf(spec.colorKey);
  const t = spec.maxLevel > 1 ? (spec.level - 1) / (spec.maxLevel - 1) : 1;

  const bg = new Graphics();
  if (spec.isGenerator) {
    bg.roundRect(-inner / 2, -inner / 2, inner, inner, radius)
      .fill(hsl(hue, 35, 22))
      .stroke({ width: Math.max(2, size * 0.06), color: hsl(hue, 70, 55) });
  } else {
    bg.roundRect(-inner / 2, -inner / 2, inner, inner, radius).fill(
      hsl(hue, 45 + 40 * t, 78 - 30 * t),
    );
  }
  root.addChild(bg);

  const label = new Text({
    text: spec.name,
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: Math.max(9, size * 0.15),
      fontWeight: '600',
      fill: spec.isGenerator ? 0xffffff : 0x1d1d1f,
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
  root.addChild(label);

  const badgeR = size * 0.14;
  const badge = new Graphics()
    .circle(inner / 2 - badgeR * 0.9, inner / 2 - badgeR * 0.9, badgeR)
    .fill(spec.isGenerator ? hsl(hue, 70, 55) : 0x1d1d1f);
  const badgeText = new Text({
    text: String(spec.level),
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: badgeR * 1.2,
      fontWeight: '700',
      fill: 0xffffff,
    },
  });
  badgeText.anchor.set(0.5);
  badgeText.position.set(inner / 2 - badgeR * 0.9, inner / 2 - badgeR * 0.9);
  root.addChild(badge, badgeText);

  if (!spec.isGenerator) return { root };

  const overlay = new Graphics()
    .roundRect(-inner / 2, -inner / 2, inner, inner, radius)
    .fill({ color: 0x000000, alpha: 0.55 });
  const cdLabel = new Text({
    text: '',
    style: {
      fontFamily: 'system-ui, sans-serif',
      fontSize: size * 0.2,
      fontWeight: '700',
      fill: 0xffffff,
    },
  });
  cdLabel.anchor.set(0.5);
  overlay.visible = false;
  cdLabel.visible = false;
  root.addChild(overlay, cdLabel);
  return { root, cooldown: { overlay, label: cdLabel } };
}

/** Фон клетки доски. */
export function createCellBackground(size: number, dark: boolean): Graphics {
  const pad = Math.max(1, size * 0.03);
  return new Graphics()
    .roundRect(pad, pad, size - pad * 2, size - pad * 2, size * 0.14)
    .fill(dark ? 0x2a2d34 : 0xe9e4d8);
}
