import { openUrl } from "@tauri-apps/plugin-opener";
import dyslexicRegular from "../../assets/fonts/OpenDyslexic-Regular.woff2?url";
import dyslexicBold from "../../assets/fonts/OpenDyslexic-Bold.woff2?url";
import dyslexicItalic from "../../assets/fonts/OpenDyslexic-Italic.woff2?url";
import dyslexicBoldItalic from "../../assets/fonts/OpenDyslexic-Bold-Italic.woff2?url";
import { READING_LINE_HEIGHTS, type EpubWidth, type LineSpacing, type ReadingFont } from "../../state/uiStore";

/**
 * The stylesheet the reader injects into every section of an EPUB, and the
 * two repairs that CSS alone cannot make.
 *
 * An EPUB is typeset for a page: its own stylesheet assumes a box of a
 * known size, and a title page in particular tends to place each line with
 * `position: absolute` inside a container of a fixed height. Rendered as
 * one continuous scroll that container collapses to nothing and the lines
 * land on top of each other, so the layout half of this stylesheet (always
 * applied) takes those page-sized boxes apart, and
 * `unstackPositionedElements` puts what is left back into the normal flow.
 *
 * The typography half is applied unless the reader asks for the book's own
 * styling, and follows the same size, spacing, font and theme as the rest
 * of the app's reading surfaces.
 */

/** The key epub.js replaces rather than duplicates when re-injecting. */
export const EPUB_STYLE_KEY = "sojourner-reader";

/** Marks the run-out appended after the last paragraph (see `addRunOut`). */
const RUN_OUT_ATTR = "data-reader-run-out";

/** Set on a section that is a scanned page rather than text (see
 * `markScannedPage`). Everything the prose rules do -- a reading measure,
 * a gutter, opening up fixed-size boxes -- is wrong for a photograph of a
 * page, which wants the full width of the pane and nothing else. */
const SCAN_ATTR = "data-reader-scan";

/** Comfortable measures, in the spirit of 60-75 characters a line. In
 * pixels rather than rem: `rem` inside the book's frame is whatever root
 * size the book set, which would make the measure a different width from
 * one book to the next. */
const MEASURE: Record<EpubWidth, string> = {
  narrow: "540px",
  medium: "680px",
  wide: "860px",
  full: "none",
};

const FONT_VAR: Record<ReadingFont, string> = {
  serif: "--font-reading",
  sans: "--font-reading-sans",
  dyslexic: "--font-reading-dyslexic",
};

/** Block containers whose text takes the reader's size and spacing, so the
 * size control moves every paragraph and not only the ones the book left
 * unstyled. Headings keep their relative size; `span` is left alone
 * because that is where drop caps and small caps live. */
const FLOW_TEXT = "p, div, li, dd, dt, td, th, blockquote, figcaption, section, article, address";

/** Everything the theme's ink colour and reading font apply to. Anything
 * inside an `<svg>` is left as the illustration drew it, and code keeps
 * its monospace face. */
const NOT_DRAWN = ":not(svg):not(svg *)";
const NOT_CODE = ":not(pre):not(code):not(kbd):not(samp):not(pre *):not(code *)";

export interface EpubStyleSettings {
  fontSize: number;
  lineSpacing: LineSpacing;
  readingFont: ReadingFont;
  width: EpubWidth;
  /** Leave the book's own colours, fonts and sizes alone. */
  useBookStyles: boolean;
}

/** OpenDyslexic has to be declared again inside the book's frame: an
 * iframe does not inherit the app document's font faces. */
const DYSLEXIC_FACES = [
  { url: dyslexicRegular, weight: 400, style: "normal" },
  { url: dyslexicBold, weight: 700, style: "normal" },
  { url: dyslexicItalic, weight: 400, style: "italic" },
  { url: dyslexicBoldItalic, weight: 700, style: "italic" },
]
  .map(
    ({ url, weight, style }) =>
      `@font-face{font-family:"OpenDyslexic";font-weight:${weight};font-style:${style};font-display:swap;src:url("${new URL(url, document.baseURI).href}") format("woff2");}`,
  )
  .join("\n");

export function buildEpubCss(settings: EpubStyleSettings): string {
  const root = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => root.getPropertyValue(name).trim() || fallback;
  const measure = MEASURE[settings.width];
  const gutter = settings.width === "full" ? "40px" : "28px";

  // Always: undo the page-sized boxes, and keep wide content inside the
  // pane instead of pushing a sideways scrollbar under the text.
  const layout = `
html {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
  -webkit-text-size-adjust: 100%;
}
body {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 auto !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  columns: auto !important;
  column-count: 1 !important;
  overflow-wrap: break-word;
}
html:not([${SCAN_ATTR}]) body {
  max-width: ${measure} !important;
  padding: 28px ${gutter} 0 !important;
}
html:not([${SCAN_ATTR}]) body :where(div, section, article, header, footer, aside, nav, main, figure, p, blockquote, dl, ul, ol) {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  max-width: 100% !important;
  overflow: visible !important;
}
html:not([${SCAN_ATTR}]) body :where(img, svg, video, canvas, object, embed, iframe) {
  max-width: 100% !important;
  height: auto !important;
}
body :where(table) { max-width: 100% !important; }
body :where(pre) { white-space: pre-wrap !important; overflow-wrap: break-word !important; }
body [${RUN_OUT_ATTR}] { display: block; height: 64px; }
/* The frame is as wide as the pane, so a book squeezed into a narrow pane
   gives its gutters back to the text. */
@media (max-width: 460px) {
  html:not([${SCAN_ATTR}]) body { padding-left: 16px !important; padding-right: 16px !important; }
}

/* A scanned page is the page: it runs the full width of the pane, because
   a photograph of type cannot be reflowed and shrinking it is the same as
   making the book unreadable. A page that carries its own fixed size (an
   OCR text layer pinned over the image, say) is scaled to fit by
   \`fitScannedPage\` instead, so the image and its layer move together. */
html[${SCAN_ATTR}] body {
  max-width: none !important;
  padding: 0 !important;
}
html[${SCAN_ATTR}] body :where(img, svg) {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  max-height: none !important;
  height: auto !important;
  margin: 0 auto !important;
}
`;

  if (settings.useBookStyles) return `${DYSLEXIC_FACES}\n${layout}`;

  const ink = token("--color-ink", "#1c1e22");
  const surface = token("--color-surface", "#ffffff");
  const accent = token("--color-accent", "#2f5f8f");
  const line = token("--color-line", "#e4e4df");
  const family = token(FONT_VAR[settings.readingFont], "serif");
  const lineHeight = READING_LINE_HEIGHTS[settings.lineSpacing];

  const typography = `
/* The frame's own canvas, which a webview paints white by default, is what
   shows through a book that leaves html and body transparent. It has to be
   painted rather than cleared, or a dark theme's text lands on white. */
html { background: ${surface} !important; }
body {
  background: transparent !important;
  color: ${ink} !important;
  font-family: ${family} !important;
  font-size: ${settings.fontSize}px !important;
  line-height: ${lineHeight} !important;
  hyphens: auto;
  -webkit-hyphens: auto;
}
body *${NOT_DRAWN}${NOT_CODE} { font-family: inherit !important; }
body *${NOT_DRAWN}:not(a):not(a *) {
  color: inherit !important;
  background-color: transparent !important;
}
body a${NOT_DRAWN}, body a *${NOT_DRAWN} {
  color: ${accent} !important;
  background-color: transparent !important;
}
body :where(${FLOW_TEXT}):not(sup):not(sub):not(sup *):not(sub *) {
  font-size: inherit !important;
  line-height: inherit !important;
}
/* A heading typeset at line-height 1 (or less) overlaps the line above it
   the moment it wraps, which is how title pages usually break. */
body :where(h1, h2, h3, h4, h5, h6) { line-height: 1.25 !important; }
body :where(hr) {
  border: 0 !important;
  border-top: 1px solid ${line} !important;
  margin: 1.75em auto !important;
}
::selection { background: color-mix(in srgb, ${accent} 30%, transparent); }
`;

  return `${DYSLEXIC_FACES}\n${layout}\n${typography}`;
}

/**
 * Pins text the book made invisible on purpose, before the reader's own
 * colours land on it.
 *
 * A searchable scan is a photograph of a page with its OCR laid over it in
 * transparent text, so the words can be selected and copied from where
 * they appear. Forcing the theme's ink onto that layer would print the
 * OCR over the page in the reader's font; an inline `!important` outranks
 * the injected stylesheet and keeps it invisible.
 *
 * Returns the elements it pinned, which are also the ones the flow repairs
 * must leave alone.
 */
export function pinInvisibleText(doc: Document): Set<HTMLElement> {
  const body = doc.body;
  const view = doc.defaultView;
  const pinned = new Set<HTMLElement>();
  if (!body || !view) return pinned;
  const elements = body.querySelectorAll<HTMLElement>("*");
  if (elements.length > NORMALIZE_LIMIT) return pinned;
  for (const element of elements) {
    if (!element.textContent?.trim()) continue;
    const color = view.getComputedStyle(element).color;
    if (!/^rgba\(.*,\s*0\)$/.test(color) && color !== "transparent") continue;
    element.style.setProperty("color", "transparent", "important");
    pinned.add(element);
  }
  return pinned;
}

/**
 * Decides whether a section is a scanned page rather than text, and marks
 * the document if it is.
 *
 * The test is what is actually there to read: a section that shows an
 * image and carries no prose of its own is a picture of a page (or a
 * cover), whatever the book's stylesheet claims. Text hidden behind a scan
 * -- an OCR layer -- does not count as prose, which is why the pinned set
 * is subtracted.
 */
const SCAN_TEXT_LIMIT = 240;

export function markScannedPage(doc: Document, invisible: Set<HTMLElement>): boolean {
  const body = doc.body;
  if (!body) return false;
  const scan = body.querySelector("img, image, svg") != null && visibleTextLength(body, invisible) < SCAN_TEXT_LIMIT;
  if (scan) doc.documentElement.setAttribute(SCAN_ATTR, "");
  else doc.documentElement.removeAttribute(SCAN_ATTR);
  return scan;
}

function visibleTextLength(body: HTMLElement, invisible: Set<HTMLElement>): number {
  let length = (body.textContent ?? "").trim().length;
  for (const element of invisible) {
    // Only the outermost pinned elements, or nesting would subtract twice.
    if (element.parentElement && invisible.has(element.parentElement)) continue;
    length -= (element.textContent ?? "").trim().length;
  }
  return Math.max(0, length);
}

/**
 * Scales a scanned page that carries its own fixed size so it fits the
 * pane's width.
 *
 * `zoom` rather than a transform because it is part of layout: the page
 * image, the OCR layer pinned over it and the height epub.js measures for
 * the frame all move together, so selecting a word still selects the word
 * under the pointer. A page whose image simply fills its box already fits
 * and is left alone.
 */
const MAX_SCAN_ZOOM = 2;

export function fitScannedPage(doc: Document): void {
  const body = doc.body;
  if (!body) return;
  body.style.removeProperty("zoom");
  const pane = doc.documentElement.clientWidth;
  const content = body.scrollWidth;
  if (pane <= 0 || content <= 0) return;
  const scale = Math.min(MAX_SCAN_ZOOM, pane / content);
  if (scale > 0.995 && scale < 1.005) return;
  body.style.setProperty("zoom", String(Math.round(scale * 1000) / 1000));
}

/**
 * Puts absolutely placed text back into the normal flow.
 *
 * Nothing in CSS can say "static, but only where the book said absolute",
 * so it is done element by element. Ancestors of anything moved are opened
 * up as well: the container it was placed inside is usually a page-height
 * box with `overflow: hidden`, which would otherwise clip the lines that
 * have just been given a height of their own.
 */
const NORMALIZE_LIMIT = 3000;

export function unstackPositionedElements(doc: Document, invisible: Set<HTMLElement>): void {
  const body = doc.body;
  const view = doc.defaultView;
  if (!body || !view) return;
  const elements = body.querySelectorAll<HTMLElement>("*");
  // A chapter this long is prose, not a title page, and walking it would
  // cost more than the repair is worth.
  if (elements.length === 0 || elements.length > NORMALIZE_LIMIT) return;

  const ancestors = new Set<HTMLElement>();
  for (const element of elements) {
    if (invisible.has(element)) continue;
    const position = view.getComputedStyle(element).position;
    if (position !== "absolute" && position !== "fixed") continue;
    element.style.setProperty("position", "static", "important");
    for (const side of ["top", "right", "bottom", "left"]) element.style.setProperty(side, "auto", "important");
    element.style.setProperty("transform", "none", "important");
    element.style.setProperty("float", "none", "important");
    element.style.setProperty("max-width", "100%", "important");
    for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) ancestors.add(parent);
  }

  for (const parent of ancestors) {
    parent.style.setProperty("position", "static", "important");
    parent.style.setProperty("height", "auto", "important");
    parent.style.setProperty("min-height", "0", "important");
    parent.style.setProperty("overflow", "visible", "important");
  }
}

/**
 * Adds breathing room after the last paragraph. It has to be a real
 * element rather than padding on `body`: epub.js sizes the section's frame
 * from the bottom of its content, so bottom padding is simply cut off. It
 * is appended, never inserted, so the child positions every CFI is counted
 * from stay where they were.
 */
export function addRunOut(doc: Document): void {
  const body = doc.body;
  if (!body || body.querySelector(`[${RUN_OUT_ATTR}]`)) return;
  const spacer = doc.createElement("div");
  spacer.setAttribute(RUN_OUT_ATTR, "");
  spacer.setAttribute("aria-hidden", "true");
  body.appendChild(spacer);
}

/**
 * Sends a link out of the book to the browser. epub.js marks external
 * links `target="_blank"`, which inside a webview either does nothing or
 * opens a second, chromeless window.
 */
export function routeExternalLinks(doc: Document): void {
  doc.addEventListener("click", (event) => {
    const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    const href = anchor?.getAttribute("href");
    if (!href || !/^(https?|mailto):/i.test(href)) return;
    event.preventDefault();
    openUrl(href).catch(() => {});
  });
}
