import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VISIT_PAGE, analyticsToken, headers, visitFrame, visitPage } from "./vite-web-pwa.ts";
import analytics from "../src/web/analytics.json";

// The web app counts visits with Cloudflare Web Analytics and promises, in
// Settings → About and the README, that this is all it does. These hold the
// build to that promise.

const CONTENT = "https://data.example";
const TOKEN = "0123456789abcdef0123456789abcdef";

function directive(policy: string, name: string): string[] {
  const found = policy.split("; ").find((d) => d.startsWith(`${name} `));
  return found ? found.split(" ").slice(1) : [];
}

describe("the web app's security policy", () => {
  it("names no Cloudflare analytics host when the counter is not built", () => {
    expect(headers(CONTENT)["Content-Security-Policy"]).not.toContain("cloudflareinsights");
  });

  it("opens to the beacon's script and its report address, and nothing wider", () => {
    const off = headers(CONTENT)["Content-Security-Policy"];
    const on = headers(CONTENT, true)["Content-Security-Policy"];
    expect(directive(on, "script-src")).toEqual([...directive(off, "script-src"), "https://static.cloudflareinsights.com"]);
    expect(directive(on, "connect-src").filter((s) => !directive(off, "connect-src").includes(s))).toEqual(["https://cloudflareinsights.com"]);
    // Every other directive, and every other header, is as it was.
    const rest = (p: string) => p.split("; ").filter((d) => !d.startsWith("script-src ") && !d.startsWith("connect-src "));
    expect(rest(on)).toEqual(rest(off));
    expect({ ...headers(CONTENT, true), "Content-Security-Policy": "" }).toEqual({ ...headers(CONTENT), "Content-Security-Policy": "" });
    expect(on).not.toContain("unsafe-inline' https");
    expect(directive(on, "script-src")).not.toContain("'unsafe-inline'");
  });
});

describe("the visit counter", () => {
  it("runs the beacon in a page of its own, told not to follow the app's pages", () => {
    const page = visitPage(TOKEN);
    expect(page).toContain('src="https://static.cloudflareinsights.com/beacon.min.js"');
    expect(page).toContain(`data-cf-beacon='{"token":"${TOKEN}","spa":false}'`);
    // One script, and it is not inline: the policy would refuse an inline one.
    expect(page.match(/<script/g)).toHaveLength(1);
    expect(page).not.toMatch(/<script>/);
  });

  it("is held in a hidden frame that hands over no referrer", () => {
    const { tag, attrs } = visitFrame();
    expect(tag).toBe("iframe");
    expect(attrs).toMatchObject({ src: VISIT_PAGE, hidden: true, referrerpolicy: "no-referrer", "aria-hidden": "true", tabindex: "-1" });
  });

  it("builds nothing without a token, and refuses one that is not a token", () => {
    expect(analyticsToken("")).toBeNull();
    expect(analyticsToken(TOKEN)).toBe(TOKEN);
    expect(() => analyticsToken("paste-the-token-here")).toThrow();
    expect(() => analyticsToken(`${TOKEN}'><script>`)).toThrow();
  });

  it("has a token that builds, or none", () => {
    expect(() => analyticsToken(analytics.token)).not.toThrow();
  });

  it("is never the app's own page: index.html carries no beacon, on the desktop or the web", () => {
    const index = readFileSync("index.html", "utf8");
    expect(index).not.toContain("cloudflareinsights");
    expect(index).not.toContain("data-cf-beacon");
  });

  it("is left to the network by the service worker, which answers every other navigation with the app", () => {
    const sw = readFileSync("web-public/sw.js", "utf8");
    const bypass = sw.indexOf(`url.pathname === "${VISIT_PAGE}"`);
    expect(bypass).toBeGreaterThan(-1);
    expect(bypass).toBeLessThan(sw.indexOf("event.respondWith"));
  });
});
