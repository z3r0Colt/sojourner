import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { HtmlTagDescriptor, Plugin } from "vite";

/**
 * Makes `vite build --mode web` an installable app (docs/pwa-plan.md, phase 6):
 *
 *   manifest.webmanifest, the icons in web-public/icons/, and the tags that
 *   point at them (added to index.html in this mode only -- the desktop's page
 *   is the same file and gains nothing);
 *   sw.js, from web-public/sw.js with the list of files to keep for offline
 *   use written in, each with its content hash, so a changed file is a new
 *   service worker and an unchanged one is not;
 *   _headers, for Cloudflare Pages (the same headers `vite preview` sends, so
 *   a local preview is checked against what is deployed);
 *   visit.html and the hidden frame that holds it, when src/web/analytics.json
 *   has a token: the visit counter (see VISIT_PAGE).
 *
 * Written by hand rather than with vite-plugin-pwa: the worker is ~100 lines
 * and nothing here has to follow a plugin's release schedule.
 */

const THEME = "#274a70";
/** The launch screen's background, and on Android the navigation bar of the
 * installed app: Chrome paints that bar from the manifest and a page can't
 * change it, so it can't follow the reader's theme. The brand navy looks
 * meant under every theme (the user's choice, 2026-10-13). */
const GROUND = THEME;

/** Not kept for offline use at install: the Atlas's data (10 MB, read only
 * when the Atlas is opened; the worker keeps what is fetched) and files that
 * are the deploy's own. */
const NOT_PRECACHED = [/^atlas\//, /^sw\.js$/, /^_headers$/, /\.map$/, /^visit\.html$/];

/** Cloudflare Web Analytics: the script, and where it reports to. */
const BEACON_SCRIPT = "https://static.cloudflareinsights.com/beacon.min.js";
const BEACON_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";
const BEACON_REPORT_ORIGIN = "https://cloudflareinsights.com";

/**
 * The visit counter (src/web/analytics.json holds the site token; empty
 * means none of this is built).
 *
 * Cloudflare's beacon reports the address of the page it runs in, and this
 * app's address says what is on screen (#/lexicon/G26, #/search?q=...). Run
 * in the app's own page the beacon would send "/" and no more, because it
 * drops what follows a # or a ? -- but that is its habit, not our doing: with
 * real paths it sends each one, the last of them in its closing report even
 * under `spa: false` (both tried against the script itself, 2026-11-11). The
 * promise in Settings -> About should not rest on a habit of someone else's
 * script, nor on this app's router staying a hash router. So the beacon runs
 * in a page of its own, VISIT_PAGE, that the app holds in a hidden frame:
 * what Cloudflare hears is that /visit.html was opened, from which browser
 * and device, whatever the script chooses to report. `no-referrer` on the
 * frame keeps the app's address out of the one other place it could look.
 *
 * The cost: no page-speed figures for the app itself, since the page being
 * timed is the blank one.
 *
 * web-public/sw.js lets this page's requests through to the network, so a
 * launch with no connection is simply not counted.
 */
export const VISIT_PAGE = "/visit.html";

export function analyticsToken(token: string): string | null {
  if (token === "") return null;
  if (!/^[0-9a-f]{32}$/.test(token)) throw new Error("src/web/analytics.json: the token is 32 hex digits, from Cloudflare's Web Analytics page for the site");
  return token;
}

export function visitFrame(): HtmlTagDescriptor {
  return {
    tag: "iframe",
    attrs: { src: VISIT_PAGE, hidden: true, referrerpolicy: "no-referrer", title: "", tabindex: "-1", "aria-hidden": "true" },
    injectTo: "body",
  };
}

export function visitPage(token: string): string {
  const config = JSON.stringify({ token, spa: false });
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="robots" content="noindex" />
    <title>Sojourner</title>
  </head>
  <body>
    <script defer src="${BEACON_SCRIPT}" data-cf-beacon='${config}'></script>
  </body>
</html>
`;
}

/** The policy the web app runs under. `connect-src` names the content host;
 * `'wasm-unsafe-eval'` is for the backend's WebAssembly. Cross-origin
 * isolation (COOP + COEP) is for the parallel page fetch of phase 7
 * (SharedArrayBuffer); everything the page loads from another origin has to
 * be CORS-enabled, which R2 is (data.gentleking.org).
 *
 * `analytics`: the two Cloudflare hosts the visit counter needs, and only
 * when it is built. */
export function headers(contentOrigin: string, analytics = false): Record<string, string> {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'wasm-unsafe-eval'${analytics ? ` ${BEACON_SCRIPT_ORIGIN}` : ""}`,
      "style-src 'self' 'unsafe-inline' blob:",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${contentOrigin}${analytics ? ` ${BEACON_REPORT_ORIGIN}` : ""} blob: data:`,
      "worker-src 'self' blob:",
      "frame-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

export function webPwa(options: { contentBase: string; analyticsToken?: string }): Plugin {
  const contentOrigin = new URL(options.contentBase).origin;
  const token = analyticsToken(options.analyticsToken ?? "");
  let outDir = "dist-web";
  let root = process.cwd();
  return {
    name: "sojourner-web-pwa",
    apply: (_config, env) => env.mode === "web",

    config() {
      // `vite preview` sends what _headers will say in production.
      return { preview: { headers: headers(contentOrigin, token != null) } };
    },

    configResolved(config) {
      outDir = config.build.outDir;
      root = config.root;
    },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // The dev server serves the same page; only a build gets the worker.
        if (ctx.server) return [];
        // Under the phone's bars where the browser allows it (iOS's home
        // indicator, Chrome's edge-to-edge), so the app's own background fills
        // them; the shell keeps clear of them with the `safe-area` padding.
        // Chrome for an installed app on Android doesn't, as of 2026-10: its
        // navigation bar is GROUND.
        const viewport = 'content="width=device-width, initial-scale=1.0"';
        if (!html.includes(viewport)) throw new Error("index.html's viewport meta changed: update vite-web-pwa.ts");
        html = html.replace(viewport, 'content="width=device-width, initial-scale=1.0, viewport-fit=cover"');
        const tags: HtmlTagDescriptor[] = [
          { tag: "link", attrs: { rel: "manifest", href: "/manifest.webmanifest" }, injectTo: "head" },
          { tag: "link", attrs: { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }, injectTo: "head" },
          { tag: "meta", attrs: { name: "theme-color", content: THEME }, injectTo: "head" },
          { tag: "meta", attrs: { name: "mobile-web-app-capable", content: "yes" }, injectTo: "head" },
          { tag: "meta", attrs: { name: "apple-mobile-web-app-capable", content: "yes" }, injectTo: "head" },
          { tag: "meta", attrs: { name: "apple-mobile-web-app-title", content: "Sojourner" }, injectTo: "head" },
        ];
        if (token) tags.push(visitFrame());
        return { html, tags };
      },
    },

    closeBundle() {
      const out = join(root, outDir);
      const src = join(root, "web-public");

      mkdirSync(join(out, "icons"), { recursive: true });
      for (const name of readdirSync(join(src, "icons"))) copyFileSync(join(src, "icons", name), join(out, "icons", name));

      writeFileSync(
        join(out, "manifest.webmanifest"),
        JSON.stringify(
          {
            id: "/",
            name: "Sojourner",
            short_name: "Sojourner",
            description: "A private Bible study companion: Scripture, the historic commentaries and confessions, the original languages and an atlas.",
            start_url: "/",
            scope: "/",
            display: "standalone",
            orientation: "any",
            background_color: GROUND,
            theme_color: THEME,
            categories: ["education", "books"],
            icons: [
              { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
              { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            ],
          },
          null,
          2,
        ),
      );

      if (token) writeFileSync(join(out, "visit.html"), visitPage(token));

      // Every file, with its hash. index.html is kept under "/" too, which is
      // what a navigation asks for.
      const files = walk(out)
        .map((p) => relative(out, p).split(sep).join("/"))
        .filter((p) => !NOT_PRECACHED.some((re) => re.test(p)))
        .sort();
      const precache = files.map((p) => ({
        url: p === "index.html" ? "/" : `/${p}`,
        revision: createHash("sha256").update(readFileSync(join(out, p))).digest("hex").slice(0, 12),
      }));
      const version = createHash("sha256").update(JSON.stringify(precache)).digest("hex").slice(0, 12);
      writeFileSync(
        join(out, "sw.js"),
        `// Generated by tools/vite-web-pwa.ts from web-public/sw.js.\nself.__VERSION__ = ${JSON.stringify(version)};\nself.__PRECACHE__ = ${JSON.stringify(precache)};\n${readFileSync(join(src, "sw.js"), "utf8")}`,
      );

      const h = headers(contentOrigin, token != null);
      const lines = [
        "/*",
        ...Object.entries(h).map(([k, v]) => `  ${k}: ${v}`),
        "/assets/*",
        "  Cache-Control: public, max-age=31536000, immutable",
        "/icons/*",
        "  Cache-Control: public, max-age=86400",
        // What decides what the reader runs must never be served stale.
        "/sw.js",
        "  Cache-Control: no-cache",
        "/manifest.webmanifest",
        "  Cache-Control: no-cache",
        "/",
        "  Cache-Control: no-cache",
        "/index.html",
        "  Cache-Control: no-cache",
        "",
      ];
      writeFileSync(join(out, "_headers"), lines.join("\n"));
      console.log(`web pwa: ${precache.length} files precached, service worker ${version}`);
    },
  };
}
