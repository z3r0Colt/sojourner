/**
 * The one gate every stored HTML string passes through before it is put on
 * screen.
 *
 * Note bodies, sermon manuscripts and commentary entries are all rendered
 * with `dangerouslySetInnerHTML`, and a user.db is a file that can be handed
 * from one person to another (Settings → Data & backups → Import). So the
 * markup in it is not this app's markup: it is whoever made that file's
 * markup, running inside a webview that has the whole Tauri command surface
 * behind it. An allowlist is the only defensible answer -- anything not
 * named here is not displayed, whatever it is.
 *
 * The shape of the allowlist is what the rich-text editor can actually
 * produce, plus what the commentary importer emits, and nothing else.
 */

/** Elements kept as themselves. */
const ALLOWED_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "SUP", "SUB",
  "UL", "OL", "LI", "BLOCKQUOTE",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "CODE", "PRE", "HR", "SPAN", "DIV", "A", "MARK",
]);

/**
 * Elements removed along with everything inside them. Every other unknown
 * element is unwrapped instead (its text survives, the tag does not) -- but
 * the contents of these carry no prose worth keeping and plenty worth
 * dropping: a script's source, a style sheet's rules, a form's controls.
 */
const DROP_WITH_CONTENTS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT",
]);

/**
 * Attributes kept on any allowed element. `class` carries the styling the
 * app's own stylesheets key off; `data-osis` is how an imported commentary
 * states which verse a reference points at, and `data-ref` is what the
 * hover-preview decorator writes. `data-blank` marks a word the handout
 * leaves blank, and is what `.sermon-html [data-blank]` underlines.
 *
 * Nothing else survives -- including `style` (an inline rule can cover the
 * window with an invisible overlay) and every `on*` handler.
 */
const ALLOWED_ATTRS = new Set(["class", "data-osis", "data-ref", "data-blank"]);

/** Link schemes a displayed `href` may use: the web, and the app's own. */
const ALLOWED_SCHEMES = new Set(["http:", "https:", "bsapp:"]);

/**
 * True if `href` names one of the schemes above. A scheme-less href is
 * rejected too: inside a webview a relative link navigates the app window
 * itself out of the app, which is the same harm as `javascript:` by a
 * quieter route.
 */
function isAllowedHref(href: string): boolean {
  // Whitespace and control characters are ignored by the URL parser, so
  // "java\nscript:" is a live link unless they come out before the check.
  const cleaned = Array.from(href)
    .filter((c) => c > " ")
    .join("");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(cleaned);
  return scheme != null && ALLOWED_SCHEMES.has(scheme[1].toLowerCase());
}

/** Moves an element's children up into its place, then removes it. */
function unwrap(el: Element): void {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function scrubAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name === "href" && el.tagName.toUpperCase() === "A") {
      if (!isAllowedHref(attr.value)) el.removeAttribute(attr.name);
      continue;
    }
    // `on*` is covered by the attribute allowlist, but say so explicitly:
    // this is the rule that must not be lost if the allowlist ever grows.
    if (name.startsWith("on") || !ALLOWED_ATTRS.has(name)) el.removeAttribute(attr.name);
  }
}

function clean(node: ChildNode): void {
  if (node.nodeType === Node.TEXT_NODE) return;
  if (node.nodeType !== Node.ELEMENT_NODE) {
    // Comments and processing instructions carry nothing to display.
    node.remove();
    return;
  }
  const el = node as Element;
  // SVG and MathML elements report a lower-case `tagName`, so normalize.
  const tag = el.tagName.toUpperCase();
  if (DROP_WITH_CONTENTS.has(tag)) {
    el.remove();
    return;
  }
  // Children first, so an unwrap lifts already-clean nodes.
  for (const child of Array.from(el.childNodes)) clean(child);
  if (!ALLOWED_TAGS.has(tag)) {
    unwrap(el);
    return;
  }
  scrubAttributes(el);
}

/** Sanitizes an element's subtree in place. */
export function sanitizeElement(root: Element): void {
  for (const child of Array.from(root.childNodes)) clean(child);
}

/**
 * Sanitizes an HTML string. Parsing goes through `DOMParser`, whose document
 * is inert -- nothing runs and nothing is fetched while the markup is being
 * looked at, which assigning to a live element's `innerHTML` cannot promise.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  sanitizeElement(doc.body);
  return doc.body.innerHTML;
}
