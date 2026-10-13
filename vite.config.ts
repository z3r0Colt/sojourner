import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Connect } from "vite";
import { webPwa } from "./tools/vite-web-pwa.ts";
import pinnedContent from "./src/web/content.json" with { type: "json" };
const host = process.env.TAURI_DEV_HOST;

/**
 * Serves the app's content security policy in dev.
 *
 * Tauri applies `app.security.csp` as a response header on its own custom
 * protocol, which only exists in a packaged build. Under `tauri dev` the
 * page comes from this dev server instead and carries no policy at all, so
 * a violation introduced while working would stay invisible until somebody
 * built an installer -- which is exactly how the EPUB stylesheet breakage
 * was nearly missed. The policy is read out of tauri.conf.json rather than
 * copied, so the two cannot drift apart.
 *
 * `script-src` is relaxed here and only here: Vite and React Fast Refresh
 * inject inline module scripts that `'self'` alone would block. Script
 * sources are therefore genuinely enforced only in a packaged build;
 * everything else -- images, media, styles, connections, frames, workers --
 * is checked in dev, which is where every violation so far has come from.
 */
function devContentSecurityPolicy() {
  return {
    name: "sojourner-dev-csp",
    apply: "serve" as const,
    transformIndexHtml(html: string) {
      const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
      const csp: string | null = config.app?.security?.csp ?? null;
      if (!csp) return html;
      const relaxed = csp
        .split(";")
        .map((directive: string) =>
          directive.trim().startsWith("script-src") ? `${directive.trimEnd()} 'unsafe-inline'` : directive,
        )
        .join(";");
      return html.replace("</head>", `  <meta http-equiv="Content-Security-Policy" content="${relaxed}" />
  </head>`);
    },
  };
}

/**
 * Sojourner on the web, in dev (`npm run dev:web`): content.db and its
 * skeleton from content/web/ (`npm run build:content:web`; or
 * $SOJOURNER_WEB_CONTENT) at
 * /dev-content/, with the Range requests the backend's HTTP VFS reads them
 * by. The built web app reads them from data.gentleking.org instead.
 */
function devWebContent() {
  const dir = process.env.SOJOURNER_WEB_CONTENT ?? fileURLToPath(new URL("./content/web/", import.meta.url));
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const name = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
    if (!/^[\w.-]+$/.test(name)) return next();
    const file = `${dir}/${name}`;
    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", name.endsWith(".json") ? "application/json" : "application/octet-stream");
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
    if (!range) {
      res.setHeader("Content-Length", size);
      return createReadStream(file).pipe(res);
    }
    const start = Number(range[1]);
    const end = Math.min(range[2] ? Number(range[2]) : size - 1, size - 1);
    if (start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    res.setHeader("Content-Length", end - start + 1);
    createReadStream(file, { start, end }).pipe(res);
  };
  return {
    name: "sojourner-dev-web-content",
    apply: "serve" as const,
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use("/dev-content", serve);
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `--mode web`: Sojourner on the web (src/web/, `onWeb` in platform.ts).
  const web = mode === "web";
  return {
    plugins: [react(), tailwindcss(), web ? devWebContent() : devContentSecurityPolicy(), webPwa({ contentBase: process.env.VITE_CONTENT_BASE ?? pinnedContent.base })],

    // Fixed at build time: the target, so `if (onWeb)` folds away and the
    // desktop bundle carries none of the web code; and the version, for the
    // web build's Settings → About (the desktop asks Tauri).
    define: {
      "import.meta.env.VITE_TARGET": JSON.stringify(web ? "web" : "desktop"),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(JSON.parse(readFileSync("package.json", "utf8")).version),
    },

    // The backend's WebAssembly, built by `npm run build:wasm` (src/web/wasm.d.ts).
    resolve: {
      alias: { "@sojourner/wasm": fileURLToPath(new URL("./src/web/pkg/sojourner_web.js", import.meta.url)) },
    },

    build: { outDir: web ? "dist-web" : "dist" },

    // The Atlas's map engine runs in a worker, which src/features/atlas
    // imports with `?worker&url` so Vite bundles it whole; ES output, because
    // MapLibre starts it as a module worker.
    worker: { format: "es" as const },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
      // 4. Settings → Other devices in dev: a browser opening this server gets
      // its commands, files and tiles from the app's own (src-tauri/src/remote.rs),
      // as it does from the built page the app serves itself. The `sj_key`
      // cookie is the app's to set: open the app's port with `?key=` once.
      proxy: web ? undefined : Object.fromEntries(["/api", "/files", "/sjtiles"].map((p) => [p, "http://127.0.0.1:8765"])),
    },

    // The frontend's unit tests (`npm test`). jsdom, because what is tested
    // here is DOM work -- parsing and walking markup the way the webview does.
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.ts"],
    },
  };
});
