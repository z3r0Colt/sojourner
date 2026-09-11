import { useCallback, useMemo } from "react";
import { useSetting } from "../../hooks/useSetting";

export type HighlightColorKey = "yellow" | "green" | "blue" | "pink" | "orange";

export interface HighlightColor {
  key: HighlightColorKey;
  /** The stored hex value (what `highlights.color` holds). */
  color: string;
  name: string;
}

/** The five highlight pastels, shared by the selection toolbar, the
 * highlight popup, the verse context menu, Settings, and the Highlights
 * page. The hex values are what is stored on each highlight row, so they
 * must never change; labels are the reader's own and live in a setting. */
export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { key: "yellow", color: "#fef08a", name: "Yellow" },
  { key: "green", color: "#bbf7d0", name: "Green" },
  { key: "blue", color: "#bfdbfe", name: "Blue" },
  { key: "pink", color: "#fbcfe8", name: "Pink" },
  { key: "orange", color: "#fed7aa", name: "Orange" },
];

export const UNDERLINE_COLOR = "#f59e0b";

export type HighlightLabels = Record<HighlightColorKey, string>;

/** The decided defaults. All editable under Settings → Reading. */
export const DEFAULT_HIGHLIGHT_LABELS: HighlightLabels = {
  yellow: "Promise",
  green: "Command",
  blue: "Doctrine",
  pink: "Prayer",
  orange: "Warning",
};

/** Setting key: a color-key-to-label map, stored in user.db so the names
 * survive a reinstall and travel with backups. */
export const HIGHLIGHT_LABELS_SETTING = "highlight_labels";

const NO_LABELS: Partial<HighlightLabels> = {};

/** The color entry a stored hex value belongs to, or undefined for an
 * underline color or anything from before the palette was fixed. */
export function highlightColorFor(hex: string): HighlightColor | undefined {
  const h = hex.trim().toLowerCase();
  return HIGHLIGHT_COLORS.find((c) => c.color === h);
}

/** The reader's labels merged over the defaults, so a partially stored map
 * still names every color. A label cleared to blank stays blank (the color
 * then goes by its name alone). Returns `[labels, patch]`. */
export function useHighlightLabels(): [HighlightLabels, (patch: Partial<HighlightLabels>) => void] {
  const [stored, setStored] = useSetting<Partial<HighlightLabels>>(HIGHLIGHT_LABELS_SETTING, NO_LABELS);
  const labels = useMemo(() => ({ ...DEFAULT_HIGHLIGHT_LABELS, ...stored }), [stored]);
  const patch = useCallback((next: Partial<HighlightLabels>) => setStored((prev) => ({ ...prev, ...next })), [setStored]);
  return [labels, patch];
}

/** "Promise (yellow)", or just "Yellow" when the label is blank. Used for
 * tooltips and accessible names on the color buttons. */
export function highlightColorLabel(c: HighlightColor, labels: HighlightLabels): string {
  const label = labels[c.key]?.trim();
  return label ? `${label} (${c.name.toLowerCase()})` : c.name;
}
