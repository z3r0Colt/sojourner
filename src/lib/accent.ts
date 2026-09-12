/**
 * Follow the Windows accent color (F3.8). With "Windows accent" chosen,
 * the accent tokens on <html> are overridden inline: `--color-accent`
 * becomes the system color, corrected until it reads at 4.5:1 against
 * the theme's page ground, and the hover and soft variants are derived
 * from it with `color-mix()`. Clearing removes the inline overrides so the
 * theme's own tokens apply again.
 */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Relative luminance per WCAG 2. */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mix(c: Rgb, toward: Rgb, t: number): Rgb {
  return { r: c.r + (toward.r - c.r) * t, g: c.g + (toward.g - c.g) * t, b: c.b + (toward.b - c.b) * t };
}

export const MIN_CONTRAST = 4.5;

/** The accent moved toward black (on a light ground) or white (on a dark
 * one), in small steps, until it reads at `MIN_CONTRAST` against `ground`.
 * A color that already passes is returned unchanged, so a reader's chosen
 * hue survives wherever it can. */
export function correctForContrast(accent: Rgb, ground: Rgb, min = MIN_CONTRAST): Rgb {
  if (contrastRatio(accent, ground) >= min) return accent;
  const darkGround = luminance(ground) < 0.5;
  const toward: Rgb = darkGround ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  let out = accent;
  for (let i = 1; i <= 40; i++) {
    out = mix(accent, toward, i / 40);
    if (contrastRatio(out, ground) >= min) return out;
  }
  return toward;
}

/** Reads a CSS color token on <html> as parsed by the browser. */
function readToken(name: string): Rgb | null {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = parseHex(raw);
  if (hex) return hex;
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(raw);
  return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
}

const OVERRIDDEN = ["--color-accent", "--color-accent-hover", "--color-accent-soft", "--color-accent-soft-2", "--color-group-a"];

/** Applies `hex` as the accent for the theme currently on <html>, or
 * restores the theme's own accent when `hex` is null. Returns the color
 * actually used, after contrast correction. */
export function applyAccent(hex: string | null): string | null {
  const root = document.documentElement;
  // Clear first so the ground is read from the theme, not a stale override.
  for (const name of OVERRIDDEN) root.style.removeProperty(name);
  const accent = hex ? parseHex(hex) : null;
  if (!accent) return null;
  const ground = readToken("--color-bg") ?? { r: 255, g: 255, b: 255 };
  const corrected = correctForContrast(accent, ground);
  const value = toHex(corrected);
  const darkGround = luminance(ground) < 0.5;
  root.style.setProperty("--color-accent", value);
  root.style.setProperty("--color-accent-hover", `color-mix(in srgb, ${value} 84%, ${darkGround ? "white" : "black"})`);
  root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${value} ${darkGround ? 22 : 14}%, var(--color-bg))`);
  root.style.setProperty("--color-accent-soft-2", `color-mix(in srgb, ${value} ${darkGround ? 32 : 24}%, var(--color-bg))`);
  root.style.setProperty("--color-group-a", value);
  return value;
}
