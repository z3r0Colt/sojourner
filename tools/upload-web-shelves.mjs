// Uploads the library shelves (content/web-shelves/, from
// `build_web_content --shelf`, see `npm run build:web-shelves`) to R2:
// shelves/<id>/<version>/ -- library.db in pieces, skeleton.bin, books/ and
// manifest.json -- served at https://data.gentleking.org/shelves/..., and pins
// what is there in src/web/shelves.json, which the web app is built with
// (commit it).
//
// A folder is never changed once complete: manifest.json goes last, so a
// half-finished upload is never what an app reads. Run it again to resume.
//
// Run: npm run upload:web-shelves

import { join } from "node:path";
import { PUBLIC_ORIGIN, checkCors, uploadAll } from "./r2.mjs";
import { builtShelves, pinShelves } from "./web-shelves-pin.mjs";

for (const { id, version, folder, manifest: m } of builtShelves()) {
  const files = [...m.chunks.map((c) => c.file), m.skeleton.file, ...m.books.map((b) => `books/${b.file}`)].map((f) => ({
    key: `shelves/${id}/${version}/${f}`,
    path: join(folder, f),
  }));
  console.log(`${id} ${version}: ${m.shelf.name}, ${m.books.length} books, ${files.length} files`);
  await uploadAll(files, { parallel: 6 });
  await uploadAll([{ key: `shelves/${id}/${version}/manifest.json`, path: join(folder, "manifest.json") }]);
}
const shelves = pinShelves(`${PUBLIC_ORIGIN}shelves/`);
await checkCors(`${PUBLIC_ORIGIN}shelves/${shelves[0].id}/${shelves[0].version}/manifest.json`);
console.log("pinned in src/web/shelves.json");
