/** Shared class strings for the handful of native form controls the app
 * uses everywhere. Kept as strings (not components) so `<select>` and
 * `<input>` stay plain native elements with all their keyboard behavior. */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const inputClass =
  "rounded-md border border-line-2 bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-4 focus:border-accent disabled:opacity-50";

export const inputSmClass =
  "rounded-md border border-line-2 bg-surface px-2 py-1 text-sm text-ink placeholder:text-ink-4 focus:border-accent disabled:opacity-50";

export const selectClass =
  "rounded-md border border-line-2 bg-surface px-2 py-1.5 text-sm text-ink focus:border-accent disabled:opacity-50";

export const selectSmClass =
  "rounded-md border border-line-2 bg-surface px-1.5 py-1 text-sm text-ink focus:border-accent disabled:opacity-50";

export const textareaClass =
  "rounded-md border border-line-2 bg-surface px-2.5 py-1.5 text-sm text-ink placeholder:text-ink-4 focus:border-accent";

export const checkboxClass = "h-4 w-4 accent-accent";

/** Standard card wrapper for list items (notes, prayers, resources…). */
export const cardClass = "rounded-lg border border-line bg-surface p-3";

/** Small uppercase section label used above lists and panel sections. */
export const sectionLabelClass = "text-xs font-semibold uppercase tracking-wide text-ink-3";

/** Text link inside prose or lists. */
export const linkClass = "text-accent hover:underline";

/** Centered page column used by every list-style page. */
export const pageClass = "mx-auto w-full max-w-3xl px-6 py-6";
