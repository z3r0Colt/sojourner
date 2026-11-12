import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import conf from "../src-tauri/tauri.conf.json";

// The version is declared in three places (README: Build), and a release
// build stops if they disagree -- after its runner has spent some minutes
// getting that far. This says so in a second, on every push.
describe("the app's version", () => {
  it("is the same in package.json, tauri.conf.json and Cargo.toml", () => {
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
    // The [package] table's own version, not a dependency's.
    const cargoVersion = /\[package\][^[]*?\nversion\s*=\s*"([^"]+)"/.exec(cargo)?.[1];
    expect(cargoVersion, "src-tauri/Cargo.toml [package] version").toBeDefined();
    expect(conf.version).toBe(pkg.version);
    expect(cargoVersion).toBe(pkg.version);
  });

  it("has an entry in the changelog", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    expect(changelog).toContain(`## ${pkg.version} `);
  });
});
