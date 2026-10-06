import { useCallback } from "react";
import { useUiStore, type CopyFormat } from "../state/uiStore";

/**
 * Copying verses. Every copy action in the app goes through `useCopyPassage`
 * so the reader's chosen layout (Settings → Reading → "When copying verses")
 * applies everywhere: text alone, "text (John 3:16)", "John 3:16 — text", or
 * a Markdown blockquote with the reference on its own line. With "Include
 * translation" on, the reference carries the translation code ("John 3:16 KJV").
 */

export const COPY_FORMATS: { value: CopyFormat; label: string }[] = [
  { value: "text", label: "Text only" },
  { value: "text-ref", label: "Text, then the reference" },
  { value: "ref-text", label: "Reference, then the text" },
  { value: "markdown", label: "Markdown blockquote" },
];

/** The reference as it appears in a copy: "John 3:16" or "John 3:16 KJV". */
export function copyReference(reference: string, translationCode?: string | null): string {
  return translationCode ? `${reference} ${translationCode}` : reference;
}

/** Lays out `text` and `reference` in `format`. Pure, so Settings can show
 * each format as a live example. */
export function formatPassage(text: string, reference: string, format: CopyFormat): string {
  const body = text.trim();
  switch (format) {
    case "text":
      return body;
    case "text-ref":
      return `${body} (${reference})`;
    case "ref-text":
      return `${reference} — ${body}`;
    case "markdown":
      return `> ${body}\n>\n> — ${reference}`;
  }
}

/** `formatPassage` for a passage already in HTML (color text): the same
 * layout, so a paste into a document matches a paste as plain text. */
export function formatPassageHtml(html: string, reference: string, format: CopyFormat): string {
  const ref = reference.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  switch (format) {
    case "text":
      return html;
    case "text-ref":
      return `${html} (${ref})`;
    case "ref-text":
      return `${ref} — ${html}`;
    case "markdown":
      return `<blockquote>${html}<br>— ${ref}</blockquote>`;
  }
}

export async function copyPassage(text: string, reference: string, format: CopyFormat, html?: string): Promise<void> {
  const plain = formatPassage(text, reference, format);
  if (html && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([formatPassageHtml(html, reference, format)], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Fall through to plain text where rich copying is refused.
    }
  }
  await navigator.clipboard.writeText(plain);
}

/** `copy(text, reference, translationCode)` bound to the reader's format
 * and "Include translation" preferences. */
export function useCopyPassage(): (text: string, reference: string, translationCode?: string | null, html?: string) => Promise<void> {
  const format = useUiStore((s) => s.copyFormat);
  const includeTranslation = useUiStore((s) => s.copyIncludeTranslation);
  return useCallback(
    (text: string, reference: string, translationCode?: string | null, html?: string) =>
      copyPassage(text, copyReference(reference, includeTranslation ? translationCode : null), format, html),
    [format, includeTranslation],
  );
}
