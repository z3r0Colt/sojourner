// Uploads the Atlas's PMTiles (content/web-maps/, from tools/build-web-maps.py)
// to R2: maps/<id>/<version>/<id>.pmtiles, served at
// https://data.gentleking.org/maps/..., and pins what is there in
// src/web/maps.json, which the web app is built with (commit it).
//
// Run: npm run upload:web-maps

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ORIGIN, checkCors, uploadAll } from "./r2.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "content", "web-maps");

const packs = [];
for (const id of readdirSync(DIR)) {
  const versions = readdirSync(join(DIR, id)).sort();
  const version = versions[versions.length - 1];
  packs.push(JSON.parse(readFileSync(join(DIR, id, version, "map.json"), "utf8")));
}
console.log(`map packs: ${packs.map((p) => `${p.id} ${p.version}`).join(", ")}`);

await uploadAll(
  packs.flatMap((p) => p.files.map((f) => ({ key: `maps/${p.id}/${p.version}/${f.file}`, path: join(DIR, p.id, p.version, f.file) }))),
  { parallel: 2 },
);
await checkCors(`${PUBLIC_ORIGIN}maps/${packs[0].id}/${packs[0].version}/${packs[0].files[0].file}`);

writeFileSync(join(ROOT, "src", "web", "maps.json"), JSON.stringify({ base: `${PUBLIC_ORIGIN}maps/`, packs }, null, 2) + "\n");
console.log("pinned in src/web/maps.json");
