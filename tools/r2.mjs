// Shared by tools/upload-web-maps.mjs and tools/upload-web-shelves.mjs:
// puts a file into the sojourner-data bucket with wrangler (signed in with
// `npx wrangler login` once, or $CLOUDFLARE_API_TOKEN and $CLOUDFLARE_ACCOUNT_ID
// set, as in CI), skipping what is already there at the right size so a run
// that stopped can be run again.

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const BUCKET = "sojourner-data";
export const PUBLIC_ORIGIN = "https://data.gentleking.org/";
const WRANGLER = "wrangler@4.149.0";

/** The size of the copy already at the public address, or null. Every key is
 * immutable once written, so size is enough to say "this one is there". */
export async function uploadedSize(key) {
  try {
    const r = await fetch(`${PUBLIC_ORIGIN}${key.split("/").map(encodeURIComponent).join("/")}`, { method: "HEAD", cache: "no-store" });
    return r.ok ? Number(r.headers.get("content-length")) : null;
  } catch {
    return null;
  }
}

const TYPES = { json: "application/json", epub: "application/epub+zip", pdf: "application/pdf" };

function put(key, path) {
  const ext = key.split(".").pop().toLowerCase();
  const args = [
    "--yes",
    WRANGLER,
    "r2",
    "object",
    "put",
    `${BUCKET}/${key}`,
    "--remote",
    `--file=${path}`,
    `--content-type=${TYPES[ext] ?? "application/octet-stream"}`,
    "--cache-control=public, max-age=31536000, immutable",
  ];
  // npx's own script run by node, with no shell: a book's file name can hold
  // `&` and `;`, which cmd.exe would take for its own.
  const npx = join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  const [cmd, argv] = existsSync(npx) ? [process.execPath, [npx, ...args]] : ["npx", args];
  return new Promise((resolve) => {
    const p = spawn(cmd, argv, { stdio: ["ignore", "ignore", "inherit"] });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Uploads `files` ([{ key, path }]) `parallel` at a time, in order; the last
 * `after` keys (a manifest) only once everything before them is up. Exits the
 * process on a failure, saying to run again.
 */
export async function uploadAll(files, { parallel = 4, label = (f) => f.key } = {}) {
  let next = 0;
  let done = 0;
  const failed = [];
  async function worker() {
    while (next < files.length) {
      const f = files[next++];
      const size = statSync(f.path).size;
      if ((await uploadedSize(f.key)) === size) {
        done++;
        continue;
      }
      const t = Date.now();
      // Checked at its public address afterwards: wrangler took a `#` in a
      // book's name for the start of a URL fragment and stored the book under
      // the name cut short there, reporting success (Vindiciæ Evangelicæ,
      // 2026-10-13). An upload is done only when the app can read it.
      const ok = (await put(f.key, f.path)) && (await uploadedSize(f.key)) === size;
      done++;
      if (ok) console.log(`  [${done}/${files.length}] ${label(f)} ${(size / 1e6).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(0)} s`);
      else failed.push(f.key);
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  if (failed.length) {
    console.error(`${failed.length} upload(s) failed or can't be read back (${failed.slice(0, 3).join(", ")}...); run again to resume`);
    console.error("A name wrangler can't store (one with #) needs another way up: the R2 REST API with the key URL-encoded.");
    process.exit(1);
  }
}

/** Reads `url` with a Range from each origin the app runs on and says whether
 * CORS lets it through (the R2 bucket's policy). */
export async function checkCors(url) {
  for (const origin of ["http://localhost:1420", "https://app.gentleking.org"]) {
    const r = await fetch(url, { headers: { Range: "bytes=0-99", Origin: origin }, cache: "no-store" });
    const allowed = r.headers.get("access-control-allow-origin");
    const ok = r.status === 206 && (allowed === origin || allowed === "*");
    console.log(`  read from ${origin}: HTTP ${r.status}, allow-origin ${allowed ?? "(none)"}${ok ? "" : "  <-- check the bucket's CORS policy"}`);
  }
}
