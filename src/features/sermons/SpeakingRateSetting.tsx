import { useSpeakingRate } from "../../api/queries";
import { useSetting } from "../../hooks/useSetting";
import { Button } from "../../components/ui/Button";
import { toast } from "../../components/ui/toast";
import { cx, inputSmClass } from "../../components/ui/classes";
import { DEFAULT_SPEAKING_WPM, SPEAKING_WPM_SETTING } from "./sermonStats";

/** Settings → Reading → Speaking rate (SB2.4): what the app has measured
 * from real runs, and the rate it falls back on until it has measured
 * enough. Every "about N minutes" in the sermon builder uses one or the
 * other, and says which. */
export function SpeakingRateSetting() {
  const { data: measured } = useSpeakingRate();
  const [wpm, setWpm] = useSetting<number>(SPEAKING_WPM_SETTING, DEFAULT_SPEAKING_WPM);

  return (
    <div className="space-y-2">
      {measured ? (
        <p className="text-sm text-ink-2">
          Your measured rate: <span className="font-medium text-ink">{measured.wpm} wpm</span> from{" "}
          {measured.rehearsals} {measured.rehearsals === 1 ? "rehearsal" : "rehearsals"}
          {measured.preachings > 0 && ` and ${measured.preachings} ${measured.preachings === 1 ? "sermon" : "sermons"}`}.
        </p>
      ) : (
        <p className="text-sm text-ink-3">
          Nothing measured yet. Time two runs of a sermon -- a rehearsal or a preaching -- and the app works your rate out
          from them instead.
        </p>
      )}
      <label className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <span>Until then, assume</span>
        <input
          type="number"
          min={60}
          max={260}
          value={wpm}
          onChange={(e) => setWpm(Math.max(60, Math.min(260, Number(e.target.value) || DEFAULT_SPEAKING_WPM)))}
          aria-label="Words a minute"
          className={cx(inputSmClass, "w-20")}
        />
        <span>words a minute</span>
        {wpm !== DEFAULT_SPEAKING_WPM && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWpm(DEFAULT_SPEAKING_WPM);
              toast.info(`Speaking rate reset to ${DEFAULT_SPEAKING_WPM} wpm`);
            }}
          >
            Reset
          </Button>
        )}
      </label>
      <p className="text-xs text-ink-3">
        A measured rate always wins. Runs that work out slower than 80 or faster than 220 words a minute are treated as
        mis-timed and left out; delete one from a sermon's History list to drop it for good.
      </p>
    </div>
  );
}
