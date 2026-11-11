import { useWorkspaceStore } from "../../state/workspaceStore";
import type { Purpose } from "../onboarding/purpose";
import { usePurpose } from "../onboarding/usePurpose";

/**
 * Whether to offer "Send to sermon" and "Save as illustration" beside
 * everything that can be quoted: every verse, commentary entry, confession
 * section, lexicon entry and encyclopedia article carries the pair.
 *
 * They are a preacher's tools. To someone who came to read, or to study, or
 * to lead family worship, they were two icons of unknown purpose on every
 * entry. So they show for someone who came to preach, for someone who asked
 * for everything, for anyone here before the question was asked (no purpose
 * stored: the app as it was), and for anyone with a sermon open -- whatever
 * they said they came for, they are writing one.
 */
export function sermonToolsShown(purpose: Purpose | null, sermonOpen: boolean): boolean {
  return purpose == null || purpose === "everything" || purpose === "preaching" || sermonOpen;
}

export function useSermonTools(): boolean {
  const [purpose] = usePurpose();
  const sermonOpen = useWorkspaceStore((s) => s.panes.some((p) => p.kind === "sermon" || p.kind === "sermons" || p.kind === "illustrations"));
  return sermonToolsShown(purpose, sermonOpen);
}
