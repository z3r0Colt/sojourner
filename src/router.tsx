import { createHashRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";

/** The router keeps only the shell. The URL mirrors the focused pane's
 * content (see workspace/paneKinds.ts for the paths), so deep links, the
 * sidebar, and the command palette keep working; what is actually shown
 * comes from the workspace store. */
export const router = createHashRouter([{ path: "/*", element: <AppShell /> }]);
