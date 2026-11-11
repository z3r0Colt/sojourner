import { BookOpen, GraduationCap, HouseHeart, LayoutGrid, Mic, type LucideIcon } from "lucide-react";
import { useCommentarySources } from "../../api/queries";
import { Modal } from "../../components/ui/Modal";
import { isCompact } from "../../hooks/useCompact";
import { useUiStore } from "../../state/uiStore";
import { PRESET_WORKSPACES, STUDY_START, applyWorkspace, type SavedWorkspace } from "../../workspace/presets";
import { useLandingPage } from "../today/landing";
import { PURPOSES, landingFor, workspaceFor, type Purpose } from "./purpose";
import { usePurpose } from "./usePurpose";

const ICONS: Record<Purpose, LucideIcon> = {
  reading: BookOpen,
  studying: GraduationCap,
  preaching: Mic,
  family: HouseHeart,
  everything: LayoutGrid,
};

/** The arrangement a purpose starts in, if it has one. */
function startingWorkspace(purpose: Purpose): SavedWorkspace | null {
  const name = workspaceFor(purpose);
  if (name == null) return null;
  if (name === STUDY_START.name) return STUDY_START;
  return PRESET_WORKSPACES.find((w) => w.name === name) ?? null;
}

/**
 * The question at the door (purpose.ts): asked once, of a new install, before
 * the tour. One tap answers it; closing the dialog any other way is "show me
 * everything", which is what the app was before it asked.
 *
 * The answer sets the sidebar's pages, where the app opens, and (with room
 * for panes) the arrangement it starts in. A phone shows one pane at a time,
 * so there only an arrangement of one pane is applied.
 */
export function Welcome() {
  const [, setPurpose] = usePurpose();
  const [, setLanding] = useLandingPage();
  const { data: commentarySources } = useCommentarySources();

  function choose(purpose: Purpose) {
    setPurpose(purpose);
    const landing = landingFor(purpose);
    if (landing) setLanding(landing);
    const workspace = startingWorkspace(purpose);
    if (workspace && (!isCompact() || workspace.panes.length === 1)) applyWorkspace(workspace, commentarySources, { keepPassage: false });
    // A newcomer gets the study strip with its names showing (Workspace.tsx);
    // someone here before the question keeps the strip they had.
    useUiStore.getState().setStudyStripLabels(true);
  }

  return (
    <Modal onClose={() => choose("everything")} size="md" bodyClassName="p-5 max-md:p-4">
      <h2 className="text-lg font-semibold text-ink">Welcome to Sojourner</h2>
      <p className="mt-1 text-sm text-ink-3">
        What brings you here? Your answer sets the app up to suit you. Everything else stays one click away, and you can change this in Settings.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {PURPOSES.map((p) => {
          const Icon = ICONS[p.id];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choose(p.id)}
              data-purpose={p.id}
              className="flex items-start gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft"
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{p.label}</span>
                <span className="block text-xs text-ink-3">{p.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
