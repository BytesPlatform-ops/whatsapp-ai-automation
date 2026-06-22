/**
 * Tiny colour helpers for the adaptive per-role theming.
 * No dependency — simple sRGB maths is plenty for accent interpolation +
 * luminance-based button text. (Linear RGB lerp reads smoothly for these
 * saturated accents over a 600ms tween.)
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGB {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
  const int = parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Space-separated channels for `rgb(var(--accent-rgb) / a)` usage. */
export function hexToRgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `${r} ${g} ${b}`;
}

export function rgbToHex({ r, g, b }: RGB): string {
  const h = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const la = getRelativeLuminance(a);
  const lb = getRelativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const DARK_TEXT = '#06110C';
const LIGHT_TEXT = '#FFFFFF';

/**
 * Pick the button-text colour that MAXIMISES contrast against the accent fill
 * (not a fixed luminance threshold — that mis-fires on mid-tone golds/teals).
 * For the role palette this yields dark text on every accent, all ≥4.5:1 (AA).
 */
export function getReadableButtonText(accentHex: string): string {
  return contrastRatio(accentHex, DARK_TEXT) >= contrastRatio(accentHex, LIGHT_TEXT)
    ? DARK_TEXT
    : LIGHT_TEXT;
}

/** Linear sRGB interpolation between two hex colours, t ∈ [0,1]. */
export function interpolateColor(fromHex: string, toHex: string, t: number): string {
  const a = hexToRgb(fromHex);
  const b = hexToRgb(toHex);
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}
