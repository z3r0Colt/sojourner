// Every tune the psalter carries, grouped by metre.
//
// Metre is the whole of the match between a psalm and a tune, so the index is
// arranged by it: the tunes under "C.M." are exactly the ones any Common
// Metre psalm can be sung to. Each can be heard on the spot, which is how you
// pick one — a tune is a thing you recognise by ear, not by name.

import { useEffect, useMemo, useRef, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { useAllPsalmTunes } from "../../api/queries";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { schedule, TunePlayer } from "./tuneEngine";
import { TuneStaff } from "./TuneStaff";
import type { PsalmTune } from "../../api/types";

/** The metres a psalter reader meets most often come first; the rest follow
 *  in the order the tunes themselves arrive. */
const FAMILIAR = ["C.M.", "S.M.", "L.M."];

export function TuneIndexPanel() {
  const { data: tunes } = useAllPsalmTunes();
  const [openId, setOpenId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const player = useRef<TunePlayer | null>(null);
  if (!player.current) player.current = new TunePlayer();

  useEffect(() => () => player.current?.stop(), []);

  const byMetre = useMemo(() => {
    const groups = new Map<string, PsalmTune[]>();
    for (const tune of tunes ?? []) {
      if (!groups.has(tune.metre)) groups.set(tune.metre, []);
      groups.get(tune.metre)!.push(tune);
    }
    return [...groups.entries()].sort(
      (a, b) =>
        (FAMILIAR.indexOf(a[0]) + 1 || 99) - (FAMILIAR.indexOf(b[0]) + 1 || 99) || a[0].localeCompare(b[0]),
    );
  }, [tunes]);

  function play(tune: PsalmTune) {
    if (playingId === tune.id) {
      player.current?.stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(tune.id);
    setOpenId(tune.id);
    player.current?.play(schedule(tune, tune.tempo), {
      onEnd: () => setPlayingId(null),
    });
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-line px-3 py-2 text-xs text-ink-3">
        Psalm tunes · {tunes?.length ?? 0} in {byMetre.length} metres
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!tunes && <LoadingState />}
        {tunes && tunes.length === 0 && <EmptyState compact title="No tunes are built in" />}

        {byMetre.map(([metre, group]) => (
          <section key={metre}>
            <h3 className="sticky top-0 z-10 border-b border-line bg-surface-2/90 px-3 py-1.5 text-xs font-semibold text-ink-2 backdrop-blur">
              {metre}
              <span className="ml-2 font-normal text-ink-4">
                {group[0].pattern.join(".")} · {group.length} tune{group.length === 1 ? "" : "s"}
              </span>
            </h3>
            <ul>
              {group.map((tune) => (
                <li key={tune.id} className="border-b border-line/60">
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => play(tune)}
                      aria-label={playingId === tune.id ? `Stop ${tune.name}` : `Play ${tune.name}`}
                    >
                      {playingId === tune.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setOpenId(openId === tune.id ? null : tune.id)}
                      aria-expanded={openId === tune.id}
                    >
                      <span className="text-sm text-ink">{tune.name}</span>
                      {tune.composer && <span className="ml-2 text-xs text-ink-4">{tune.composer.replace(/;\s*/g, "; ")}</span>}
                    </button>
                  </div>
                  {openId === tune.id && (
                    <div className="px-3 pb-3">
                      <TuneStaff tune={tune} words={[]} sounding={null} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tunes && tunes.length > 0 && (
          <p className="flex items-start gap-2 px-3 py-3 text-xs text-ink-4">
            <Music className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              A psalm is sung to any tune in its own metre. Open a Psalm with the Metrical Psalter beside it to sing one
              with its words.
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
