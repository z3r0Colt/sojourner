import { Check, HouseHeart, Maximize2, Play } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { cardClass, cx } from "../../components/ui/classes";
import { useSetting } from "../../hooks/useSetting";
import { openContent, targetFor } from "../../workspace/openContent";
import { usePane } from "../../workspace/PaneContext";
import { FAMILY_INVITE_SETTING } from "../family/familyWorship";
import { TonightSummary } from "../family/FamilyWorshipView";
import { beginFamilyWorship } from "../family/sessionStore";
import { useFamilyWorship } from "../family/useFamilyWorship";

/**
 * "Family worship" on Today: what the family reads, sings, learns and prays
 * for next, with Begin. Before it is set up, a one-time invitation a reader
 * can put away; after that the block shows only for a family using it.
 */
export function FamilyToday() {
  const fw = useFamilyWorship();
  const [dismissed, setDismissed, { isLoaded: inviteLoaded }] = useSetting<boolean>(FAMILY_INVITE_SETTING, false);
  const { id: paneId } = usePane();

  if (!fw.isLoaded) return null;

  if (!fw.state) {
    if (!inviteLoaded || dismissed) return null;
    return (
      <section aria-labelledby="today-family" className="mb-7">
        <h2 id="today-family" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
          Family worship
        </h2>
        <div className={cx(cardClass, "flex flex-wrap items-center gap-3")}>
          <HouseHeart className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <p className="min-w-[14rem] flex-1 text-sm text-ink-2">
            A guided ten minutes for the household: a short reading, a psalm to sing, a catechism question, and prayer. New to it? It starts you
            off with four gentle weeks.
          </p>
          <Button variant="primary" onClick={(e) => openContent("family", {}, { target: targetFor(e, paneId) })}>
            Take a look
          </Button>
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            Not now
          </Button>
        </div>
      </section>
    );
  }

  // Open the page in this pane, then begin, so the session has a pane to run in.
  const begin = (e: React.MouseEvent, large = false) => {
    if (!large) openContent("family", {}, { target: targetFor(e, paneId) });
    beginFamilyWorship(large);
  };

  return (
    <section aria-labelledby="today-family" className="mb-7">
      <h2 id="today-family" className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
        Family worship
      </h2>
      <div className={cardClass}>
        {fw.gatheredToday && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-accent">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Gathered today. Next time:
          </p>
        )}
        <TonightSummary fw={fw} compact />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={fw.gatheredToday ? "secondary" : "primary"} icon={Play} onClick={(e) => begin(e)}>
            {fw.gatheredToday ? "Gather again" : "Begin"}
          </Button>
          <Button icon={Maximize2} onClick={(e) => begin(e, true)} title="Fill the screen with large type, for a table or a television">
            Gather round
          </Button>
        </div>
      </div>
    </section>
  );
}
