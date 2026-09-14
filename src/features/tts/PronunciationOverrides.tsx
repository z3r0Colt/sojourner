import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useSetting } from "../../hooks/useSetting";
import { Button, IconButton } from "../../components/ui/Button";
import { inputSmClass, cx } from "../../components/ui/classes";
import { OVERRIDES_KEY, applyOverrides, loadPronunciationLexicon, lookupSpoken } from "./pronunciation";

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
