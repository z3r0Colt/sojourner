/**
 * The last thing standing when a render throws.
 *
 * React unmounts the whole tree when an error escapes a render, so without a
 * boundary anywhere the window simply goes white -- with, quite possibly, an
 * unsaved manuscript behind it. `installCrashLogging` writes the error to
 * `logs/`, but the reader is shown nothing at all and has no way to tell a
 * crash from a hang.
 *
 * Everything here is deliberately self-contained: no design-system imports,
 * no stores, no query client, and colors written as inline styles with
 * literal fallbacks behind the theme tokens. This is the code that has to
 * render when the rest of the app could not, so it depends on as little of
 * the app as it can -- `invoke` is the one non-React import, and it is only
 * ever called inside a `try`.
 */
import { Component, useEffect, useState, type CSSProperties, type ErrorInfo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

/** The message to show for whatever was thrown. A thrown non-Error (a
 * string, a rejected value) still has to read as something. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/** Sends a crash to the same `logs/` folder the panic hook and
 * `installCrashLogging` write to. Best-effort in the strictest sense: this
 * runs while the app is already failing. */
export function logCrash(error: unknown, where: string): void {
  try {
    void invoke("log_frontend_error", {
      message: `${where}: ${errorMessage(error)}`,
      stack: error instanceof Error ? (error.stack ?? null) : null,
    }).catch(() => {});
  } catch {
    // Nothing further to try.
  }
}

const MONOSPACE = "ui-monospace, SFMono-Regular, Consolas, monospace";

/** Where the log of this crash was written. Left out entirely if the call
 * for it fails -- this screen has to render regardless. */
function LogsPath() {
  const [dir, setDir] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoke<string>("get_logs_dir")
      .then((d) => {
        if (!cancelled) setDir(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!dir) return null;
  return (
    <p style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "var(--color-ink-3, #5f6570)" }}>
      A log of this was written to <code style={{ fontFamily: MONOSPACE, wordBreak: "break-all" }}>{dir}</code>
    </p>
  );
}

function Details({ error }: { error: unknown }) {
  const stack = error instanceof Error ? error.stack : null;
  if (!stack) return null;
  return (
    <details style={{ marginTop: "0.75rem" }}>
      <summary style={{ cursor: "pointer", fontSize: "0.8125rem", color: "var(--color-ink-3, #5f6570)" }}>
        Technical details
      </summary>
      <pre
        style={{
          marginTop: "0.5rem",
          maxHeight: "12rem",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: MONOSPACE,
          fontSize: "0.75rem",
          color: "var(--color-ink-3, #5f6570)",
        }}
      >
        {stack}
      </pre>
    </details>
  );
}

function ErrorText({ error }: { error: unknown }) {
  return (
    <p
      style={{
        marginTop: "0.75rem",
        padding: "0.625rem 0.75rem",
        borderRadius: "0.375rem",
        background: "var(--color-surface-2, #f4f4f1)",
        fontFamily: MONOSPACE,
        fontSize: "0.8125rem",
        wordBreak: "break-word",
      }}
    >
      {errorMessage(error)}
    </p>
  );
}

function button(): CSSProperties {
  return {
    marginTop: "1.25rem",
    padding: "0.5rem 1rem",
    borderRadius: "0.375rem",
    border: "none",
    cursor: "pointer",
    background: "var(--color-accent, #2f5f8f)",
    color: "#ffffff",
    font: "inherit",
    fontWeight: 500,
  };
}

/**
 * The whole-window crash screen: what went wrong, where the log of it was
 * written, and a way back. Reloading the webview is enough to recover from a
 * render that threw -- nothing in the backend has died.
 */
export function AppCrashScreen({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--color-bg, #fcfcfb)",
        color: "var(--color-ink, #1c1e22)",
        font: "14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: "34rem", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: "0.5rem", color: "var(--color-ink-2, #3f434a)" }}>
          The app ran into an error it could not recover from on its own. Your notes, sermons and
          highlights live in the database and are not affected -- reloading should bring the window
          back.
        </p>
        <ErrorText error={error} />
        <LogsPath />
        <Details error={error} />
        <button type="button" onClick={() => window.location.reload()} style={button()}>
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * The same thing sized for one pane, so a view that throws costs the reader
 * that view and not the workspace around it. "Try again" re-renders the pane
 * in place; a transient failure (a query that threw on bad data, say) clears
 * without disturbing anything else the reader has open.
 */
export function PaneCrashCard({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="alert"
      style={{
        height: "100%",
        overflow: "auto",
        padding: "1.5rem",
        background: "var(--color-bg, #fcfcfb)",
        color: "var(--color-ink, #1c1e22)",
        font: "14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
      }}
    >
      <div style={{ maxWidth: "28rem" }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>This pane could not be shown</h2>
        <p style={{ marginTop: "0.5rem", color: "var(--color-ink-2, #3f434a)" }}>
          The rest of your workspace is still open. Nothing has been lost.
        </p>
        <ErrorText error={error} />
        <Details error={error} />
        <button type="button" onClick={onRetry} style={button()}>
          Try again
        </button>
      </div>
    </div>
  );
}

interface Props {
  children: ReactNode;
  /** Names what failed, so the written log says which part of the app it was. */
  where: string;
  /** What to show instead of `children`. Defaults to the full crash screen. */
  fallback?: (error: unknown, reset: () => void) => ReactNode;
}

interface State {
  error: unknown;
}

/**
 * Catches a throw from anywhere in `children`.
 *
 * `componentDidCatch` forwards to the same `log_frontend_error` command the
 * window-level handlers use, so a crash caught here still reaches `logs/`
 * rather than being swallowed by the very boundary that let the app survive
 * it.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    const component = info.componentStack?.trim().split("\n")[0]?.trim();
    logCrash(error, component ? `${this.props.where} (in ${component})` : this.props.where);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error == null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <AppCrashScreen error={this.state.error} />;
  }
}
