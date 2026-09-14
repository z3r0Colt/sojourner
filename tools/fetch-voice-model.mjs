// Fetches the Kokoro neural voice model into `models/`, the way
// `build:content` fills `content/`: a build-time step on the developer's
// machine, so the shipped app carries the model inside it and never reaches
// the network to speak.
//
// The weights are Apache-2.0 (hexgrad/Kokoro-82M). fp16 is the quality/size
// compromise the app ships: ~156 MB against ~310 MB for full precision and a
// clearly rougher ~88 MB for the int8 build.
//
// Run: npm run fetch:voices

import { createWriteStream } from "node:fs";
import { mkdir, stat, rename, readdir } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEST = join(ROOT, "models", "kokoro");

const MODEL = { url: `${REPO}/onnx/model_fp16.onnx`, path: join(DEST, "model.onnx") };

// Every English voice: "a" is American, "b" British. Half a megabyte each, so
// shipping all of them costs little and is the whole point of the exercise.
const VOICES = [
  "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore",
  "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
  "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
  "am_onyx", "am_puck", "am_santa",
  "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
  "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
];

async function sizeOf(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

/** Downloads to a temporary name and renames on success, so an interrupted
 * run never leaves a half-file that later runs mistake for a finished one. */
async function download(url, path, label) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${label}: ${res.status} ${res.statusText}`);
  const expected = Number(res.headers.get("content-length") ?? 0);

  const existing = await sizeOf(path);
  if (expected > 0 && existing === expected) {
    console.log(`  ${label}: already have it`);
    res.body?.cancel();
    return;
  }

  const tmp = `${path}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, path);
  const mb = ((await sizeOf(path)) / 1024 / 1024).toFixed(1);
  console.log(`  ${label}: ${mb} MB`);
}

await mkdir(join(DEST, "voices"), { recursive: true });

console.log("Kokoro voice model -> models/kokoro");
await download(MODEL.url, MODEL.path, "model.onnx");
for (const voice of VOICES) {
  await download(`${REPO}/voices/${voice}.bin`, join(DEST, "voices", `${voice}.bin`), voice);
}

const voiceCount = (await readdir(join(DEST, "voices"))).filter((f) => f.endsWith(".bin")).length;
const totalMb = ((await sizeOf(MODEL.path)) / 1024 / 1024).toFixed(1);
console.log(`done: model ${totalMb} MB, ${voiceCount} voice(s)`);
