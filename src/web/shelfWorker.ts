/**
 * Library shelves, in the backend's worker (the page's side is shelves.ts).
 * A shelf is `library.db` on R2, read over HTTP; adding one attaches it and
 * gives its books rows in user.db, removing it detaches it
 * (src-tauri/crates/sojourner-web/src/shelves.rs). Which shelves the reader
 * has added is the setting `web_shelves`, a JSON list of ids, so it travels
 * with their data.
 */
import { call, shelf_attach, shelf_remove, shelves_sync } from "@sojourner/wasm";
import type { StartConfig } from "./protocol";

const SETTING = "web_shelves";
/** Pages kept in the browser's files per shelf. */
const CACHE_MB = 96;
const MANIFESTS = "sojourner-shelf-manifests";

function savedIds(): string[] {
  try {
    const raw = JSON.parse(call("get_setting", JSON.stringify({ key: SETTING }))) as string | null;
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((i): i is string => typeof i === "string") : [];
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  call("set_setting", JSON.stringify({ key: SETTING, value: JSON.stringify(ids) }));
}

/** A shelf folder's manifest.json. A folder never changes once made, so the
 * copy kept from the first read is the one: the shelf then starts offline. */
async function manifestText(url: string): Promise<string> {
  const cache = await caches.open(MANIFESTS).catch(() => null);
  const kept = await cache?.match(url);
  if (kept) return kept.text();
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    throw `Couldn't reach ${new URL(url).host}: are you online?`;
  }
  if (!r.ok) throw `${url}: HTTP ${r.status}`;
  const text = await r.text();
  await cache?.put(url, new Response(text, { headers: { "Content-Type": "application/json" } })).catch(() => {});
  return text;
}

async function attach(shelves: StartConfig["shelves"], id: string): Promise<void> {
  const entry = shelves.list.find((s) => s.id === id);
  if (!entry) throw `This version of Sojourner doesn't know the ${id} shelf.`;
  const base = `${shelves.base}${id}/${entry.version}/`;
  await shelf_attach(id, base, await manifestText(`${base}manifest.json`), CACHE_MB);
}

/** At start: attaches the shelves the reader added, then brings the book
 * rows in step with them. If one can't be attached (offline, never read
 * before), the rows are left alone: syncing without it would retire its
 * books. */
export async function attachSaved(shelves: StartConfig["shelves"]): Promise<void> {
  const ids = savedIds();
  let all = true;
  for (const id of ids) {
    try {
      await attach(shelves, id);
    } catch (e) {
      all = false;
      console.warn(`The ${id} shelf could not be opened:`, e);
    }
  }
  if (ids.length && all) shelves_sync();
}

/** Adds or removes a shelf; rejects with a sentence for the reader. */
export async function shelfOp(shelves: StartConfig["shelves"], op: "add" | "remove", id: string): Promise<void> {
  const ids = savedIds();
  if (op === "add") {
    await attach(shelves, id);
    shelves_sync();
    if (!ids.includes(id)) save([...ids, id]);
  } else {
    shelf_remove(id);
    save(ids.filter((i) => i !== id));
    // The pages it cached are no use to anything now.
    try {
      const root = await navigator.storage.getDirectory();
      const cache = await root.getDirectoryHandle("sojourner-cache");
      await cache.removeEntry(`shelf-${id}`, { recursive: true });
    } catch {
      /* none, or still held: it is emptied when the shelf is next added */
    }
  }
}
