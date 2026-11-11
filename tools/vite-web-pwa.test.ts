import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headers } from "./vite-web-pwa.ts";

// The web app has Cloudflare Web Analytics, and says so in Settings → About
// and the README. Cloudflare adds the beacon to the page as it serves it;
// what this repository decides is what the page's policy lets through.

const CONTENT = "https://data.example";

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("the web app's security policy", () => {
  const policy = headers(CONTENT)["Content-Security-Policy"];

  it("lets the beacon's script load, from its own host and no other", () => {
    expect(directive(policy, "script-src")).toEqual(["'self'", "'wasm-unsafe-eval'", "https://static.cloudflareinsights.com"]);
  });

  it("lets it report, to its own host and no other", () => {
    expect(directive(policy, "connect-src")).toEqual(["'self'", CONTENT, "https://cloudflareinsights.com", "blob:", "data:"]);
  });

  it("names Cloudflare nowhere else, and never allows an inline script", () => {
    const others = policy.split("; ").filter((d) => !d.startsWith("script-src ") && !d.startsWith("connect-src "));
    expect(others.join("; ")).not.toContain("cloudflare");
    expect(directive(policy, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
  });

  it("keeps the page cross-origin isolated", () => {
    const h = headers(CONTENT);
    expect(h["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(h["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
  });
});

describe("the desktop app", () => {
  it("has no analytics: its policy names no Cloudflare host, and the page carries no beacon", () => {
    const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
    expect(conf.app.security.csp).not.toContain("cloudflare");
    const index = readFileSync("index.html", "utf8");
    expect(index).not.toContain("cloudflareinsights");
    expect(index).not.toContain("data-cf-beacon");
  });
});
