// Writes src/web/shelves.json from what is in content/web-shelves/: which
// shelves the web app knows and which version of each (the newest folder).
// Run by build-web-shelves.mjs (for dev) and upload-web-shelves.mjs (after
// the upload, so what is pinned is what is on R2).

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SHELVES_DIR = join(ROOT, "content", "web-shelves");

/** The newest built folder of each shelf, with its manifest. */
export function builtShelves() {
  const out = [];
  for (const id of readdirSync(SHELVES_DIR)) {
    const folders = readdirSync(join(SHELVES_DIR, id)).filter((v) => !v.startsWith("_"));
    if (!folders.length) continue;
    folders.sort((a, b) => statSync(join(SHELVES_DIR, id, a)).mtimeMs - statSync(join(SHELVES_DIR, id, b)).mtimeMs);
    const version = folders[folders.length - 1];
    const folder = join(SHELVES_DIR, id, version);
    out.push({ id, version, folder, manifest: JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) });
  }
  return out;
}

export function pinShelves(base) {
  const shelves = builtShelves().map(({ id, version, manifest: m }) => ({
    id,
    name: m.shelf.name,
    version,
    packVersion: m.shelf.packVersion,
    builtAt: m.shelf.builtAt ?? null,
    bookCount: m.shelf.bookCount,
    bookBytes: m.shelf.bookBytes,
    dbBytes: m.size,
  }));
  // The Puritan and Reformed shelf first, then by name.
  shelves.sort((a, b) => (a.id === "library" ? -1 : b.id === "library" ? 1 : a.name.localeCompare(b.name)));
  writeFileSync(join(ROOT, "src", "web", "shelves.json"), JSON.stringify({ base, shelves }, null, 2) + "\n");
  return shelves;
}
