import { createHashRouter, useRouteError } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { AppCrashScreen, logCrash } from "./layout/ErrorBoundary";

/** What the router shows when a render under the route threw. React Router
 * catches the error itself and hands it over here, so the boundary in
 * `main.tsx` never sees it -- which is why this logs on its own. */
function RouteCrashScreen() {
  const error = useRouteError();
  logCrash(error, "route");
  return <AppCrashScreen error={error} />;
}

/** The router keeps only the shell. The URL mirrors the focused pane's
 * content (see workspace/paneKinds.ts for the paths), so deep links, the
 * sidebar, and the command palette keep working; what is actually shown
 * comes from the workspace store. */
export const router = createHashRouter([
  { path: "/*", element: <AppShell />, errorElement: <RouteCrashScreen /> },
]);
