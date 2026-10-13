// Lays every library shelf pack in packs/ (the newest of each) out for the web:
// content/web-shelves/<id>/<version>/ (docs/pwa-plan.md, phase 7). One call of
// `build_web_content --shelf` per pack; needs the tools build of it:
//   cargo build --release --features tools --bin build_web_content
//
// Run: npm run build:web-shelves [-- packs/Church-Fathers-0.3.6.sjpack ...]

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinShelves } from "./web-shelves-pin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const exe = join(ROOT, "src-tauri", "target", "release", process.platform === "win32" ? "build_web_content.exe" : "build_web_content");
if (!existsSync(exe)) {
  console.error("build it first: cargo build --release --features tools --bin build_web_content --manifest-path src-tauri/Cargo.toml");
  process.exit(1);
}

let packs = process.argv.slice(2);
if (!packs.length) {
  // Book packs are named <Shelf>-<version>.sjpack; the map packs are not shelves.
  const newest = new Map();
  for (const f of readdirSync(join(ROOT, "packs")).filter((f) => f.endsWith(".sjpack") && !/Terrain|Imagery/.test(f)).sort()) {
    newest.set(f.replace(/-[\d.]+\.sjpack$/, "").replace(/-library$/i, ""), f);
  }
  // The first pack carries its own version number apart from the shelves'
  // (Sojourner-Library-0.3.6 beside Church-Fathers-0.3.6); the newest wins.
  packs = [...newest.values()].map((f) => join(ROOT, "packs", f));
}
for (const pack of packs) {
  console.log(`\n${pack}`);
  const r = spawnSync(exe, ["--shelf", pack], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// For dev (`npm run dev:web`): the app learns which shelves, and which
// versions, from shelves.json. The upload writes it again for R2.
const pinned = pinShelves("https://data.gentleking.org/shelves/");
console.log(`
pinned ${pinned.map((s) => `${s.id} ${s.version}`).join(", ")} in src/web/shelves.json`);
