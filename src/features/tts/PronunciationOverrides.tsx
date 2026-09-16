import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSetting } from "../../hooks/useSetting";
import { Button, IconButton } from "../../components/ui/Button";
import { inputSmClass, cx } from "../../components/ui/classes";
import { OVERRIDES_KEY, applyOverrides, loadPronunciationLexicon, lookupSpoken } from "./pronunciation";
import { ttsEngines } from "./ttsEngine";
import { useTtsStore } from "../../state/ttsStore";

type Overrides = Record<string, string>;

/**
 * The reader's own corrections, for the names ISBE's 1915 ear got differently
 * from ours or that a particular voice still trips over. They live in user.db
 * rather than local storage, so they survive a reinstall and travel with a
 * backup -- a list built up by ear over months is not something to lose.
 */
export function PronunciationOverrides() {
  const [overrides, setOverrides] = useSetting<Overrides>(OVERRIDES_KEY, {});
  const [word, setWord] = useState("");
  const [spoken, setSpoken] = useState("");

  // The editor shows what is currently said for a word, which means the
  // lexicon has to be in memory even if nothing has been read aloud yet.
  useEffect(() => {
    void loadPronunciationLexicon();
  }, []);

  const commit = (next: Overrides) => {
    setOverrides(next);
    void applyOverrides(next);
  };

  const add = () => {
    const key = word.trim().toUpperCase();
    const say = spoken.trim();
    if (!key || !say) return;
    commit({ ...overrides, [key]: say });
    setWord("");
    setSpoken("");
  };

  const remove = (key: string) => {
    const next = { ...overrides };
    delete next[key];
    commit(next);
  };

  // The natural voice reads from a dictionary and spells out what it cannot
  // find, so a respelling can come back as "K, O, V" rather than a word. It
  // knows the answer without speaking, so the reader is told before saving
  // rather than left to work it out by ear.
  const engineId = useTtsStore((s) => s.engineId);
  const [unsayable, setUnsayable] = useState(false);
  useEffect(() => {
    const say = spoken.trim();
    const engine = ttsEngines[engineId];
    if (!say || !engine?.canSay) {
      setUnsayable(false);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      void engine.canSay!(say).then((ok) => {
        if (alive) setUnsayable(!ok);
      });
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [spoken, engineId]);

  const typed = word.trim();
  const currently = typed ? lookupSpoken(typed) : null;
  const entries = Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-3">Fix a pronunciation</label>
      <div className="flex gap-1">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Word"
          aria-label="Word to fix"
          className={cx(inputSmClass, "min-w-0 flex-1")}
        />
        <input
          value={spoken}
          onChange={(e) => setSpoken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="say it like this"
          aria-label="How to say it"
          className={cx(inputSmClass, "min-w-0 flex-1")}
        />
        <Button size="sm" onClick={add} disabled={!word.trim() || !spoken.trim()}>
          Add
        </Button>
      </div>
      {unsayable && (
        <p className="mt-1 text-xs text-danger">
          This voice would spell that out letter by letter. Try syllables it can read as words -- "ya-cove" rather than "ya-kov".
        </p>
      )}
      <p className="mt-1 text-xs text-ink-3">
        {currently ? (
          <>
            Now said as <span className="text-ink-2">{currently}</span>. Spell it in syllables: mel-kiz-e-dek.
          </>
        ) : (
          "Spell it in syllables, the way it sounds: mel-kiz-e-dek."
        )}
      </p>

      {entries.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entries.map(([key, say]) => (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-ink-2">
                <span className="font-medium text-ink">{key}</span> → {say}
              </span>
              <IconButton icon={Trash2} label={`Remove the correction for ${key}`} size="sm" onClick={() => remove(key)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
