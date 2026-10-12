// Builds the web app's backend: the `sojourner-web` crate compiled to
// WebAssembly, and wasm-bindgen's JavaScript for it, into `src/web/pkg/`
// (not committed), where `src/web/worker.ts` imports it.
//
// Needs, once per machine:
//   rustup target add wasm32-unknown-unknown
//   cargo install wasm-bindgen-cli --version 0.2.129   (= the crate's pin)
//   LLVM's clang and llvm-ar (SQLite's C is compiled for wasm32 by clang;
//   on Windows `winget install LLVM.LLVM`, on Ubuntu `apt install clang llvm`)
//
// Run: npm run build:wasm            (release: the `web` profile)
//      npm run build:wasm -- --dev   (unoptimized, quicker to build)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CRATE = join(ROOT, "src-tauri", "crates", "sojourner-web");
const OUT = join(ROOT, "src", "web", "pkg");
const dev = process.argv.includes("--dev");
const profile = dev ? "dev" : "web";

const env = { ...process.env, CC_wasm32_unknown_unknown: "clang", AR_wasm32_unknown_unknown: "llvm-ar" };
// Windows spells it "Path"; a second "PATH" key would be ambiguous.
const pathKey = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
const extra = [
  // Where `cargo install` puts wasm-bindgen, in case a shell lacks it.
  join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin"),
  // winget installs LLVM here without putting it on PATH.
  "C:\\Program Files\\LLVM\\bin",
].filter((d) => existsSync(d));
env[pathKey] = [...extra, env[pathKey] ?? ""].join(delimiter);

function run(cmd, args) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env, cwd: ROOT });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// The CLI must be exactly the crate's version, or the generated JavaScript
// and the module disagree at run time.
const pinned = /wasm-bindgen = "=([\d.]+)"/.exec(readFileSync(join(CRATE, "Cargo.toml"), "utf8"))?.[1];
const cli = spawnSync("wasm-bindgen", ["--version"], { encoding: "utf8", env });
const have = /([\d.]+)/.exec(cli.stdout ?? "")?.[1];
if (!have) {
  console.error(`wasm-bindgen is not installed: cargo install wasm-bindgen-cli --version ${pinned}`);
  process.exit(1);
}
if (have !== pinned) {
  console.error(`wasm-bindgen ${have} is installed, the crate pins ${pinned}: cargo install wasm-bindgen-cli --version ${pinned} --force`);
  process.exit(1);
}

run("cargo", [
  "build",
  "--manifest-path", join(ROOT, "src-tauri", "Cargo.toml"),
  "-p", "sojourner-web",
  "--target", "wasm32-unknown-unknown",
  "--profile", profile,
]);

const dir = dev ? "debug" : profile;
const wasm = join(ROOT, "src-tauri", "target", "wasm32-unknown-unknown", dir, "sojourner_web.wasm");
rmSync(OUT, { recursive: true, force: true });
run("wasm-bindgen", [wasm, "--target", "web", "--out-dir", OUT, "--out-name", "sojourner_web"]);
console.log(`wrote ${OUT}`);
