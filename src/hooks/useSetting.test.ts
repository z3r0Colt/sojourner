import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const stored = new Map<string, string>();
vi.mock("../api/client", () => ({
  api: {
    getSetting: async (key: string) => stored.get(key) ?? null,
    setSetting: async (key: string, value: string) => void stored.set(key, value),
  },
}));

const { useSetting } = await import("./useSetting");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useSetting", () => {
  it("keeps every update made in the same tick", async () => {
    stored.set("list", JSON.stringify([]));
    let set!: (next: (prev: string[]) => string[]) => void;
    let value: string[] = [];
    function Probe() {
      const [v, s] = useSetting<string[]>("list", []);
      value = v;
      set = s;
      return null;
    }
    const qc = new QueryClient();
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(QueryClientProvider, { client: qc }, createElement(Probe))));

    await act(async () => {
      set((prev) => [...prev, "a"]);
      set((prev) => [...prev, "b"]);
    });

    expect(value).toEqual(["a", "b"]);
    expect(JSON.parse(stored.get("list")!)).toEqual(["a", "b"]);
    root.unmount();
  });
});
