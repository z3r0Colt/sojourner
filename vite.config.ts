import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { readFileSync } from "node:fs";
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

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss(), devContentSecurityPolicy()],

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
  },

  // The frontend's unit tests (`npm test`). jsdom, because what is tested
  // here is DOM work -- parsing and walking markup the way the webview does.
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
}));
