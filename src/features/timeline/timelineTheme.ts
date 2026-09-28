import { useEffect, useState } from "react";

/**
 * The timeline's colors, read from the theme's CSS tokens: a canvas cannot use
 * a Tailwind class, so the canvas and the overview strip under it ask the
 * document for the current values, and draw again when the theme changes.
 */
export function timelineColors() {
  const root = getComputedStyle(document.documentElement);
  const t = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  return {
    surface: t("--color-surface", "#fff"),
    surface2: t("--color-surface-2", "#f4f4f4"),
    hover: t("--color-hover", "#eee"),
    ink: t("--color-ink", "#111"),
    ink2: t("--color-ink-2", "#333"),
    ink3: t("--color-ink-3", "#666"),
    ink4: t("--color-ink-4", "#999"),
    line: t("--color-line", "#ddd"),
    line2: t("--color-line-2", "#eee"),
    accent: t("--color-accent", "#2a5f4c"),
    accentSoft: t("--color-accent-soft", "#e3ede7"),
    groupA: t("--color-group-a", "#6b8fb5"),
    groupB: t("--color-group-b", "#b58f6b"),
    groupC: t("--color-group-c", "#8f6bb5"),
    /* Church history: a token of its own where the theme sets one, else the
       theme's violet (the sermon callouts' "custom" hue), which every theme
       already sets, darker on the light grounds and lifted on the dark ones,
       as the link groups' hues are -- and which nothing else on the timeline
       uses: Judah and Israel are the link groups' blue and green, a
       selection is the accent. */
    church: t("--color-timeline-church", "") || t("--color-callout-custom", "#6d4a8f"),
  };
}

export type TimelineColors = ReturnType<typeof timelineColors>;

/** A CSS color's relative luminance, 0 (black) to 1 (white), for "#rgb" and
 * "#rrggbb" (what the theme tokens are); null for anything else. */
export function luminance(color: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? [...m[1]].map((d) => d + d).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether the theme draws on a dark ground: a wash light enough to tell apart
 * on white is all but lost on one, so the washes are stronger there. */
export function isDarkGround(colors: Pick<TimelineColors, "surface">): boolean {
  return (luminance(colors.surface) ?? 1) < 0.2;
}

/** Redraws when the theme changes: the colors come from the CSS tokens. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => setV((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onMq = () => setV((n) => n + 1);
    mq?.addEventListener?.("change", onMq);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);
  return v;
}
