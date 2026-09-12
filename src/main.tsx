import React from "react";
import ReactDOM from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useUiStore, type Theme } from "./state/uiStore";
import { installCrashLogging } from "./lib/crashLog";
import { Toaster } from "./components/ui/Toaster";
import { ConfirmHost } from "./components/ui/ConfirmHost";
import { toast } from "./components/ui/toast";
import "./styles.css";

installCrashLogging();

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
  return (
    <>
      <RouterProvider router={router} />
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
