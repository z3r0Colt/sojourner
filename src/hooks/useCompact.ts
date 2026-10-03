import { useSyncExternalStore } from "react";

/**
 * A phone-sized screen: Sojourner opened in a phone's browser from another
 * room (Settings → Other devices). The desktop window never gets this narrow
 * (its minimum width is 1100), so this is the browser's alone. The shell then
 * shows one pane at a time, the sidebar as a drawer, and a slimmer header.
 */
const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

function snapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
