import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useUiStore, type Theme } from "./state/uiStore";
import { installCrashLogging } from "./lib/crashLog";
import { ErrorBoundary } from "./layout/ErrorBoundary";
import { Toaster } from "./components/ui/Toaster";
import { ConfirmHost } from "./components/ui/ConfirmHost";
import { toast } from "./components/ui/toast";
import { api } from "./api/client";
import { applyAccent } from "./lib/accent";
import { splashNote } from "./lib/splash";
import "./styles.css";

installCrashLogging();

// The bundle is here; what is left to wait on is the database. The splash
// (index.html, public/splash.js) has been up since the first paint.
splashNote("Opening your library…");

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  // Every save/delete that fails surfaces as a toast -- individual call
  // sites don't need their own error handling for the user to find out.
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Something went wrong: ${message}`);
    },
  }),
});

function resolveTheme(theme: Theme): Exclude<Theme, "system"> {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ThemedRoot() {
  const theme = useUiStore((s) => s.theme);
  const readingFont = useUiStore((s) => s.readingFont);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  React.useEffect(() => {
    // The OS setting works through its media query; the switch forces it.
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion ? "on" : "off");
  }, [reduceMotion]);
  React.useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolveTheme(theme));
    if (theme !== "system") return;
    // "System" stays live: react to the OS setting changing while the app is open.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => root.setAttribute("data-theme", resolveTheme(theme));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);
  React.useEffect(() => {
    document.documentElement.setAttribute("data-reading-font", readingFont);
  }, [readingFont]);
  // Accent (F3.8): re-applied whenever the theme changes, because the
  // contrast correction depends on the theme's ground; refreshed on focus
  // so a change made in Windows Settings shows up on returning to the app.
  const accentSource = useUiStore((s) => s.accentSource);
  React.useEffect(() => {
    if (accentSource !== "windows") {
      applyAccent(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      api.getSystemAccent().then((hex) => {
        if (!cancelled) applyAccent(hex);
      }).catch(() => {});
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refresh);
    };
  }, [accentSource, theme]);
  return (
    <>
      {/* The route has its own `errorElement`, which catches anything thrown
          under it. This is for what that cannot reach: a throw in the router
          itself, or in the provider tree above the route. */}
      <ErrorBoundary where="router">
        <RouterProvider router={router} />
      </ErrorBoundary>
      <Toaster />
      <ConfirmHost />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemedRoot />
    </QueryClientProvider>
  </React.StrictMode>,
);
