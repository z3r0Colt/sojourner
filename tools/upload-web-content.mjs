// Uploads the web build's content (content/web/, from `npm run build:content:web`)
// to R2: bucket sojourner-data, folder content/<version>/, served at
// https://data.gentleking.org/content/<version>/. Then pins that version in
// src/web/content.json, which the web app is built with (commit it).
//
// The folder is never changed once complete: every file is uploaded as
// immutable, and manifest.json goes last, so a half-finished upload is
// never what an app reads. Run it again to resume: files already there at
// the right size are skipped.
//
// Needs wrangler signed in to the Cloudflare account: `npx wrangler login`
// once, or $CLOUDFLARE_API_TOKEN and $CLOUDFLARE_ACCOUNT_ID set (as in CI).
//
// Run: npm run upload:content:web [-- <content dir>]

import { spawnSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = process.argv[2] ?? join(ROOT, "content", "web");
const BUCKET = "sojourner-data";
const PUBLIC = "https://data.gentleking.org/content/";
const WRANGLER = "wrangler@4.149.0";
const PINNED = join(ROOT, "src", "web", "content.json");

const manifest = JSON.parse(readFileSync(join(DIR, "manifest.json"), "utf8"));
const v = manifest.version;
const files = [...manifest.chunks.map((c) => c.file), manifest.skeleton.file, "manifest.json"];
console.log(`content ${v} (schema ${manifest.schema}): ${files.length} files to ${PUBLIC}${v}/`);

/** The size of the copy already at the public address, or null. */
async function uploadedSize(file) {
  try {
    const r = await fetch(`${PUBLIC}${v}/${file}`, { method: "HEAD", cache: "no-store" });
    return r.ok ? Number(r.headers.get("content-length")) : null;
  } catch {
    return null;
  }
}

for (const file of files) {
  const path = join(DIR, file);
  const size = statSync(path).size;
  if ((await uploadedSize(file)) === size) {
    console.log(`  ${file}: already there`);
    continue;
  }
  console.log(`  ${file}: uploading ${(size / 1e6).toFixed(1)} MB`);
  // npx is npx.cmd on Windows, which only a shell runs: quote what has spaces.
  const win = process.platform === "win32";
  const args = [
    "--yes",
    WRANGLER,
    "r2",
    "object",
    "put",
    `${BUCKET}/content/${v}/${file}`,
    "--remote",
    `--file=${path}`,
    `--content-type=${file.endsWith(".json") ? "application/json" : "application/octet-stream"}`,
    "--cache-control=public, max-age=31536000, immutable",
  ];
  const r = spawnSync("npx", win ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args, {
    stdio: ["ignore", "inherit", "inherit"],
    shell: win,
  });
  if (r.status !== 0) {
    console.error(`upload of ${file} failed; run again to resume`);
    process.exit(1);
  }
}

// What the app will do: a Range read from another origin, so CORS matters.
for (const origin of ["http://localhost:1420", "https://app.gentleking.org"]) {
  const r = await fetch(`${PUBLIC}${v}/${files[0]}`, { headers: { Range: "bytes=0-99", Origin: origin }, cache: "no-store" });
  const allowed = r.headers.get("access-control-allow-origin");
  const ok = r.status === 206 && (allowed === origin || allowed === "*");
  console.log(`  read from ${origin}: HTTP ${r.status}, allow-origin ${allowed ?? "(none)"}${ok ? "" : "  <-- check the bucket's CORS policy"}`);
}

writeFileSync(PINNED, JSON.stringify({ base: PUBLIC, version: v }, null, 2) + "\n");
console.log(`pinned ${v} in src/web/content.json`);
