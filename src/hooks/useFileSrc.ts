import { useEffect, useState } from "react";
import { convertFileSrc, onWeb } from "../lib/platform";

/** A library file as a URL its reader can open, or null while the web build
 * is still taking it out of the browser's storage. On the desktop it is
 * `convertFileSrc`, at once, as before. */
export function useFileSrc(filePath: string): string | null {
  const [web, setWeb] = useState<{ path: string; url: string } | null>(null);
  useEffect(() => {
    // Written out here, as a test that is true: `onWeb` does not fold across
    // modules, and the web code would then ride along in the desktop bundle.
    if (import.meta.env.VITE_TARGET === "web") {
      let cancelled = false;
      void import("../web/files")
        .then(({ blobUrl }) => blobUrl(filePath))
        .then(
          (url) => !cancelled && setWeb({ path: filePath, url }),
          () => !cancelled && setWeb({ path: filePath, url: "" }),
        );
      return () => {
        cancelled = true;
      };
    }
  }, [filePath]);
  if (!onWeb) return convertFileSrc(filePath);
  return web?.path === filePath ? web.url : null;
}
