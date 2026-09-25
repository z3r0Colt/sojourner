import { sanitizeHtml } from "../../lib/sanitizeHtml";
import { formatRef, pinnedKey, refKey } from "../../lib/passage";
import { escapeHtml } from "../../lib/escapeHtml";
import { parseManuscript, refOfElement, sectionsOf } from "./editor/documentModel";
import { formatPreachDate, sermonTextLabel } from "./sermonFormat";
import type { Book, Passage, PassageRef, Sermon } from "../../api/types";

/**
 * The podium file: preaching mode, carried out of the app as one web page.
 *
 * A pulpit with a tablet on it and no laptop is common, and a church's
 * Wi-Fi is not something to preach on. So this is a single HTML file with
 * everything inline -- styles, script, and every passage's words -- that
 * opens in any browser with no network: one section to a screen, paged by a
 * tap on either side or a swipe, a clock against the target, and the type
 * as large as the preacher sets it.
 *
 * A pure function from the saved manuscript to a string, like the handout
 * and the slides, so it can be tested and can never drift from the editor's
 * markup. The manuscript goes through the same sanitizer as every other
 * view; nothing in the page runs except the script written here.
 */

export interface PodiumOptions {
  /** Rendered passages by `refKey`, in the sermon's translation, so the file
   * holds the words. */
  passages: Map<string, Passage>;
  /** Blocks pinned to a translation of their own (a comparison), by
   * `pinnedKey`; see `pinnedPassageBlocks`. */
  pinned?: Map<string, Passage>;
  books?: Book[];
  /** The sermon translation's code, for each passage's caption ("ESV"). */
  translationCode?: string | null;
  /** Code by translation id, for a pinned block's caption. */
  translationCodes?: Map<number, string>;
}

/** A passage block as the words themselves, the way ManuscriptView draws it. */
function passageHtml(ref: PassageRef, pinnedTo: number | null, options: PodiumOptions): string {
  const passage = pinnedTo != null ? options.pinned?.get(pinnedKey(pinnedTo, ref)) : options.passages.get(refKey(ref));
  const words = passage?.verses.length
    ? passage.verses.map((v) => `<sup>${v.verse}</sup>${escapeHtml(v.text)} `).join("")
    : escapeHtml(passage?.text ?? "");
  const code = pinnedTo != null ? options.translationCodes?.get(pinnedTo) : options.translationCode;
  const caption = formatRef(options.books, ref) + (code ? ` · ${code}` : "");
  return `<div class="passage"><p>${words || "…"}</p><p class="caption">${escapeHtml(caption)}</p></div>`;
}

/** One section's markup with its passages filled in, sanitized. */
function sectionBody(html: string, options: PodiumOptions): string {
  const root = parseManuscript(html).getElementById("sermon-root");
  if (!root) return "";
  for (const block of Array.from(root.querySelectorAll('[data-type="passage"]'))) {
    const ref = refOfElement(block);
    const pinnedTo = Number(block.getAttribute("data-translation-id")) || null;
    const holder = root.ownerDocument.createElement("div");
    holder.innerHTML = ref ? passageHtml(ref, pinnedTo, options) : "";
    block.replaceWith(...Array.from(holder.childNodes));
  }
  return sanitizeHtml(root.innerHTML);
}

export interface PodiumPage {
  title: string;
  html: string;
}

/** The pages, in order: one for each section, the opening one headed by the
 * sermon's title, text, and big idea. */
export function podiumPages(sermon: Sermon, options: PodiumOptions): PodiumPage[] {
  const text = sermonTextLabel(options.books, sermon);
  const date = formatPreachDate(sermon.preach_date);
  const head =
    `<header class="title"><h1>${escapeHtml(sermon.title || "Untitled sermon")}</h1>` +
    (text ? `<p class="text">${escapeHtml(text)}</p>` : "") +
    (sermon.big_idea?.trim() ? `<p class="idea">${escapeHtml(sermon.big_idea.trim())}</p>` : "") +
    (date || sermon.venue ? `<p class="meta">${escapeHtml([date, sermon.venue].filter(Boolean).join(" · "))}</p>` : "") +
    `</header>`;

  const sections = sectionsOf(sermon.body);
  const pages: PodiumPage[] = sections.map((section) => ({
    title: section.heading?.text || "Opening",
    html: sectionBody(section.html, options),
  }));
  if (pages.length === 0 || sections[0].heading) pages.unshift({ title: "Opening", html: "" });
  pages[0] = { ...pages[0], html: head + pages[0].html };
  return pages;
}

export function buildPodiumHtml(sermon: Sermon, options: PodiumOptions): string {
  const pages = podiumPages(sermon, options);
  const title = escapeHtml(sermon.title || "Sermon");
  const jump = pages.map((p, i) => `<option value="${i}">${i + 1}. ${escapeHtml(p.title)}</option>`).join("");
  const body = pages
    .map((p, i) => `<section class="page" data-index="${i}">${p.html}</section>`)
    .join("\n");
  // Numbers only, so nothing from the manuscript is ever inside the script.
  const target = sermon.target_minutes != null && Number.isFinite(sermon.target_minutes) ? Math.round(sermon.target_minutes) : 0;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark light">
<meta name="generator" content="Sojourner">
<title>${title}</title>
<style>${PODIUM_CSS}</style>
</head>
<body>
<div class="bar">
  <button type="button" id="prev" aria-label="Previous section">&#8249;</button>
  <select id="jump" aria-label="Go to a section">${jump}</select>
  <span id="count" aria-live="polite"></span>
  <button type="button" id="next" aria-label="Next section">&#8250;</button>
  <span class="grow"></span>
  <button type="button" id="clock" aria-label="Start or pause the clock">0:00</button>
  <button type="button" id="smaller" aria-label="Smaller text">A&#8722;</button>
  <button type="button" id="larger" aria-label="Larger text">A+</button>
  <button type="button" id="theme" aria-label="Light or dark">&#9680;</button>
</div>
<main id="pages">
${body}
</main>
<script>
var TARGET_MINUTES = ${target};
${PODIUM_JS}
</script>
</body>
</html>
`;
}

const PODIUM_CSS = `
*{box-sizing:border-box}
html,body{margin:0}
body{--bg:#101318;--ink:#e7e9ee;--ink2:#9aa1ad;--line:#2b313c;--accent:#8fb4de;--warn:#e0b56a;
  --explanation:#8fb4de;--illustration:#e0b56a;--application:#9fcb96;--transition:#9aa1ad;--custom:#c3a6e0;
  --size:26px;background:var(--bg);color:var(--ink);font-family:Georgia,"Iowan Old Style","Palatino Linotype",serif;
  -webkit-text-size-adjust:100%}
/* Without the script (a phone's quick preview runs none) the file is the
   whole manuscript, one section after another; the script turns on paging. */
body.paged{height:100vh;height:100dvh;overflow:hidden;display:flex;flex-direction:column}
body:not(.paged) .bar{display:none}
body:not(.paged) .page+.page{border-top:1px solid var(--line)}
body.light{--bg:#fcfcfb;--ink:#1c1e22;--ink2:#5f6570;--line:#e4e4df;--accent:#2f5f8f;--warn:#8a5a12;
  --explanation:#2f5f8f;--illustration:#9a6412;--application:#3f6b3a;--transition:#6b7280;--custom:#6d4a8f}
.bar{display:flex;align-items:center;gap:6px;padding:8px max(12px,env(safe-area-inset-right)) 8px max(12px,env(safe-area-inset-left));
  padding-top:max(8px,env(safe-area-inset-top));border-bottom:1px solid var(--line);font:14px system-ui,sans-serif;flex:none}
.bar button,.bar select{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-height:36px;white-space:nowrap;flex:none}
.bar select{flex:0 1 auto;min-width:0;max-width:40vw;text-overflow:ellipsis}
.bar .grow{flex:1}
#count{color:var(--ink2);font-variant-numeric:tabular-nums;white-space:nowrap}
#clock{font-variant-numeric:tabular-nums}
#clock.running{border-color:var(--accent);color:var(--accent)}
#clock.over{border-color:var(--warn);color:var(--warn)}
body.paged main{flex:1;overflow:hidden;position:relative}
.page{font-size:var(--size);line-height:1.5;
  padding:0.8em max(1em,env(safe-area-inset-right)) 3em max(1em,env(safe-area-inset-left));max-width:40em;margin:0 auto}
body.paged .page{height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch}
body.paged .page:not(.current){display:none}
.title h1{font-size:1.4em;margin:0.2em 0 0.3em;line-height:1.2}
.title .text{color:var(--accent);margin:0 0 0.4em}
.title .idea{font-style:italic;margin:0 0 0.4em}
.title .meta{color:var(--ink2);font-size:0.6em;margin:0 0 1em}
h2{font-size:1.1em;margin:0.6em 0 0.4em}
h3{font-size:1em;margin:0.6em 0 0.3em;color:var(--ink2)}
p{margin:0.55em 0}
ul,ol{padding-left:1.3em}
hr{border:0;border-top:1px solid var(--line);margin:1em 0}
a{color:var(--accent)}
.passage{border-left:4px solid var(--accent);padding:0.3em 0.7em;margin:0.8em 0;background:color-mix(in srgb,var(--accent) 8%,transparent)}
.passage sup{font-size:0.55em;color:var(--ink2);margin-right:0.1em}
.passage .caption{font-size:0.55em;color:var(--ink2);margin:0.2em 0 0}
blockquote{margin:0.8em 0;padding-left:0.8em;border-left:2px solid var(--line);color:var(--ink2)}
blockquote[data-label]::after{content:"\\2014\\00a0" attr(data-label);display:block;font-size:0.55em;margin-top:0.3em}
aside[data-type="callout"]{--c:var(--explanation);border-left:4px solid var(--c);padding:0.2em 0.7em;margin:0.8em 0;background:color-mix(in srgb,var(--c) 9%,transparent)}
aside[data-type="callout"]::before{content:"Explanation";display:block;font:600 0.5em system-ui,sans-serif;letter-spacing:0.06em;text-transform:uppercase;color:var(--c)}
aside[data-kind="illustration"]{--c:var(--illustration)}aside[data-kind="illustration"]::before{content:"Illustration"}
aside[data-kind="application"]{--c:var(--application)}aside[data-kind="application"]::before{content:"Application"}
aside[data-kind="transition"]{--c:var(--transition)}aside[data-kind="transition"]::before{content:"Transition"}
aside[data-kind="custom"]{--c:var(--custom)}aside[data-kind="custom"]::before{content:attr(data-label)}
[data-blank]{border-bottom:2px dotted var(--accent)}
[data-slide]{font-weight:600}
@media (max-width:520px){.bar{gap:4px}.bar button,.bar select{padding:6px 7px}.bar select{flex:1 1 auto;max-width:none}#theme,#count,.bar .grow{display:none}}
`;

// Plain ES5 on purpose: the file may be opened on an old tablet's browser.
const PODIUM_JS = `
(function () {
  var pages = [].slice.call(document.querySelectorAll(".page"));
  var jump = document.getElementById("jump");
  var count = document.getElementById("count");
  var clock = document.getElementById("clock");
  var at = 0, started = 0, banked = 0, running = false, wake = null;

  function store(key, value) { try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); } catch (e) { return null; } }

  document.body.classList.add("paged");

  function show(i) {
    if (i < 0 || i >= pages.length) return;
    pages[at].classList.remove("current");
    at = i;
    pages[at].classList.add("current");
    pages[at].scrollTop = 0;
    jump.value = String(at);
    count.textContent = (at + 1) + " / " + pages.length;
  }

  var size = Number(store("sojourner-podium-size")) || 26;
  function setSize(n) { size = Math.max(16, Math.min(56, n)); document.body.style.setProperty("--size", size + "px"); store("sojourner-podium-size", String(size)); }
  setSize(size);
  if (store("sojourner-podium-theme") === "light") document.body.classList.add("light");

  function elapsed() { return banked + (running ? Date.now() - started : 0); }
  function fmt(ms) { var s = Math.floor(ms / 1000), m = Math.floor(s / 60); s = s % 60; return m + ":" + (s < 10 ? "0" : "") + s; }
  function tick() {
    var ms = elapsed();
    clock.textContent = fmt(ms) + (TARGET_MINUTES ? " / " + TARGET_MINUTES + ":00" : "");
    clock.className = (running ? "running" : "") + (TARGET_MINUTES && ms > TARGET_MINUTES * 60000 ? " over" : "");
  }
  function keepAwake() {
    if (!running || !navigator.wakeLock) return;
    navigator.wakeLock.request("screen").then(function (l) { wake = l; }, function () {});
  }
  function toggleClock() {
    if (running) { banked += Date.now() - started; running = false; if (wake) { wake.release(); wake = null; } }
    else { started = Date.now(); running = true; keepAwake(); }
    tick();
  }
  setInterval(tick, 500);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") keepAwake(); });

  document.getElementById("prev").onclick = function () { show(at - 1); };
  document.getElementById("next").onclick = function () { show(at + 1); };
  document.getElementById("larger").onclick = function () { setSize(size + 2); };
  document.getElementById("smaller").onclick = function () { setSize(size - 2); };
  document.getElementById("theme").onclick = function () {
    var light = document.body.classList.toggle("light");
    store("sojourner-podium-theme", light ? "light" : "dark");
  };
  clock.onclick = toggleClock;
  jump.onchange = function () { show(Number(jump.value)); };

  // A tap in the outer third of the page turns it, as in the app's own
  // preaching mode; the middle is left for scrolling and reading.
  document.getElementById("pages").addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("a")) return;
    if (String(window.getSelection && window.getSelection()).length) return;
    var w = window.innerWidth;
    if (e.clientX > w * 2 / 3) show(at + 1);
    else if (e.clientX < w / 3) show(at - 1);
  });
  var x0 = null, y0 = null;
  document.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  document.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(dx < 0 ? at + 1 : at - 1);
  });
  document.addEventListener("keydown", function (e) {
    if (e.target === jump) return;
    var k = e.key;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "ArrowDown") { e.preventDefault(); show(at + 1); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "ArrowUp") { e.preventDefault(); show(at - 1); }
    else if (k === "Home") show(0);
    else if (k === "End") show(pages.length - 1);
    else if (k === "t" || k === "T") toggleClock();
    else if (k === "+" || k === "=") setSize(size + 2);
    else if (k === "-") setSize(size - 2);
  });

  show(0);
  tick();
})();
`;
