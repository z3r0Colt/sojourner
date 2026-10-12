/**
 * The reader's own data on the web: the file it is kept in (user.db), taken
 * out as a download and put back from a file. Loaded only in the web build.
 */
import { api } from "../api/client";
import { dataOp } from "./backend";

export const LAST_EXPORT_SETTING = "web_last_export_at";

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.sqlite3" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Downloads a copy of everything the reader has written. */
export async function exportUserData(prefix = "sojourner-export"): Promise<void> {
  const bytes = await dataOp("export");
  download(bytes, `${prefix}-${today()}.db`);
  await api.setSetting(LAST_EXPORT_SETTING, JSON.stringify(new Date().toISOString()));
}

/** Reads and checks a file the reader chose; rejects with why it can't be used. */
export async function checkUserDataFile(file: File): Promise<Uint8Array> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  await dataOp("check", bytes.slice());
  return bytes;
}

/** Saves a copy of the current data (as a download), replaces it with the
 * checked file, and reloads. */
export async function importUserData(bytes: Uint8Array): Promise<void> {
  download(await dataOp("export"), `sojourner-before-import-${today()}.db`);
  await dataOp("import", bytes);
  window.location.reload();
}

export type StorageStatus = { persisted: boolean | null; usage: number | null; quota: number | null };

/** Asks the browser to keep this site's data (it may refuse, or ask the
 * reader), and says how things stand. */
export async function storageStatus(ask = false): Promise<StorageStatus> {
  const s = navigator.storage;
  if (!s) return { persisted: null, usage: null, quota: null };
  let persisted: boolean | null = null;
  try {
    persisted = (await s.persisted()) || (ask && s.persist ? await s.persist() : false);
  } catch {
    /* leave it unknown */
  }
  let usage: number | null = null;
  let quota: number | null = null;
  try {
    const e = await s.estimate();
    usage = e.usage ?? null;
    quota = e.quota ?? null;
  } catch {
    /* ditto */
  }
  return { persisted, usage, quota };
}
