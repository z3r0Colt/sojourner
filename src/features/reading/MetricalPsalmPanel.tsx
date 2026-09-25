import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Download, Music, Pause, Play, Repeat } from "lucide-react";
import { useMetricalPsalm, usePsalmTunes } from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { TuneStaff } from "../psalter/TuneStaff";
import { defaultTuneId } from "../psalter/properTunes";
import { schedule, toMidiFile, TunePlayer, type ScheduledNote } from "../psalter/tuneEngine";
import type { MetricalPsalmLine, MetricalPsalmStanza, PsalmTune } from "../../api/types";
import { toast } from "../../components/ui/toast";

/** Remembers the tune chosen, both for the psalm ("psalm:23") and for its
 *  metre, so the psalter keeps singing the tune you last picked rather than
 *  resetting psalm by psalm -- see defaultTuneId for which wins. */
const TUNE_PREFERENCE = "psalter.tune";

function readTunePreference(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TUNE_PREFERENCE) ?? "{}");
  } catch {
    return {};
  }
}

function writeTunePreference(psalm: number, metre: string, tuneId: string) {
  try {
    localStorage.setItem(TUNE_PREFERENCE, JSON.stringify({ ...readTunePreference(), [metre]: tuneId, [`psalm:${psalm}`]: tuneId }));
  } catch {
    // A psalter that cannot remember the tune still sings it.
  }
}

/** One metrical line, with each verse number set where the verse actually
 *  begins -- which is regularly part-way along the line, since a stanza does
 *  not respect the verse divisions. */
function MetricalLine({ line }: { line: MetricalPsalmLine }) {
  const words = line.text.split(" ");
  const marks = new Map(line.marks.map((m) => [m.word, m.verse]));
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          {marks.has(i) && (
            <sup className="mr-0.5 select-none font-sans text-xs font-semibold text-ink-4">{marks.get(i)}</sup>
          )}
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** `fontSize` sets the words' size outright, for family worship's gather-round
 *  view; without it they follow the reading preferences. */
export function MetricalPsalmPanel({ psalm, fontSize }: { psalm: number; fontSize?: number }) {
  const { data: versions } = useMetricalPsalm(psalm);
  const [versionIdx, setVersionIdx] = useState(0);
  const version = versions?.[Math.min(versionIdx, (versions?.length ?? 1) - 1)];
  const readingTypography = useReadingTypography(0.9);
  const typography = fontSize ? { ...readingTypography, fontSize } : readingTypography;

  const { data: tunes } = usePsalmTunes(version?.metre ?? null);
  const [tuneId, setTuneId] = useState<string | null>(null);
  const tune = useMemo(
    () => tunes?.find((t) => t.id === tuneId) ?? tunes?.[0] ?? null,
    [tunes, tuneId],
  );

  // A doubled metre takes two stanzas at a time, which is how a psalter
  // offers it -- so the stanza step follows the tune, not the psalm.
  const stanzaStep = tune && version ? Math.max(1, tune.pattern.length / version.pattern.length) : 1;
  const [stanzaIdx, setStanzaIdx] = useState(0);
  const [tempo, setTempo] = useState<number | null>(null);
  // Semitones up or down, so a tune printed high can be brought within reach.
  const [transpose, setTranspose] = useState(0);
  // Whether Play sings the one stanza or goes on through the whole psalm.
  const [singThrough, setSingThrough] = useState(false);
  const [sounding, setSounding] = useState<ScheduledNote | null>(null);
  const player = useRef<TunePlayer | null>(null);
  const [playing, setPlaying] = useState(false);

  if (!player.current) player.current = new TunePlayer();

  // Stop the organ when the psalm, the tune or the pane goes away.
  useEffect(() => {
    return () => {
      player.current?.stop();
    };
  }, []);
  useEffect(() => {
    player.current?.stop();
    setPlaying(false);
    setSounding(null);
    setStanzaIdx(0);
  }, [psalm, versionIdx, tuneId]);

  useEffect(() => {
    if (!version || !tunes?.length) return;
    const prefs = readTunePreference();
    setTuneId(defaultTuneId(psalm, version.metre, tunes, { psalm: prefs[`psalm:${psalm}`], metre: prefs[version.metre] }));
  }, [psalm, version?.metre, tunes]);

  const beat = tempo ?? tune?.tempo ?? 92;

  const stanzas: MetricalPsalmStanza[] = version?.stanzas ?? [];
  // The lines the tune is carrying right now: one stanza, or two where the
  // tune is a doubled metre.
  const sung = stanzas.slice(stanzaIdx, stanzaIdx + stanzaStep).flatMap((s) => s.lines);
  const words = sung.map((line) => line.syllables);

  function play() {
    if (!tune) return;
    if (playing) {
      player.current?.stop();
      setPlaying(false);
      setSounding(null);
      return;
    }
    setPlaying(true);
    // Singing through starts where you are and carries on to the end.
    const remaining = Math.max(Math.ceil((stanzas.length - stanzaIdx) / stanzaStep), 1);
    const from = stanzaIdx;
    player.current?.play(schedule(tune, beat, { transpose, passes: singThrough ? remaining : 1 }), {
      onNote: (note) => {
        setSounding(note);
        // Follow the words: each pass through the tune is the next stanza.
        if (note && singThrough) setStanzaIdx(from + note.pass * stanzaStep);
      },
      onEnd: () => {
        setPlaying(false);
        setSounding(null);
      },
    });
  }

  function saveMidi(tune: PsalmTune) {
    const file = toMidiFile(tune, beat, singThrough ? Math.max(stanzas.length, 1) : 1, transpose);
    const url = URL.createObjectURL(new Blob([file as BlobPart], { type: "audio/midi" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${tune.name.replace(/\s+/g, "-").toLowerCase()}.mid`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Saved ${tune.name}.mid`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-baseline gap-2 border-b border-line px-3 py-2 text-xs text-ink-3">
        <span>1650 Scottish Metrical Psalter · Psalm {psalm}</span>
        {version && <span className="ml-auto font-medium text-ink-2">{version.metre}</span>}
      </div>

      {versions && versions.length > 1 && (
        <div className="flex gap-1 border-b border-line px-2 py-1.5">
          {versions.map((v, i) => (
            <Button key={i} size="sm" variant="ghost" active={i === versionIdx} onClick={() => setVersionIdx(i)}>
              {v.label ?? `Version ${i + 1}`}
            </Button>
          ))}
        </div>
      )}

      {version && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-2 py-1.5 text-xs">
          <Music className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden />
          {tunes?.length ? (
            <>
              <select
                className="min-w-0 rounded border border-line bg-surface px-1.5 py-1 text-xs text-ink"
                value={tune?.id ?? ""}
                onChange={(e) => {
                  setTuneId(e.target.value);
                  writeTunePreference(psalm, version.metre, e.target.value);
                }}
                aria-label="Tune"
              >
                {tunes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {/* A doubled tune sings two stanzas at a time. */}
                    {t.metre === version.metre ? t.name : `${t.name} (${t.metre})`}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="ghost" onClick={play} aria-label={playing ? "Stop" : "Play the tune"}>
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <label className="flex items-center gap-1.5 text-ink-3">
                {/* Crotchets a minute, as a score marks it -- a tune whose
                    notes are mostly minims is marked twice as fast as one
                    written in crotchets, so the range has to cover both. */}
                <input
                  type="range"
                  min={40}
                  max={200}
                  step={2}
                  value={beat}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  className="w-20"
                  aria-label="Tempo"
                />
                <span className="tabular-nums">{beat}</span>
              </label>
              <div className="flex items-center gap-0.5 text-ink-3">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTranspose((t) => Math.max(t - 1, -12))}
                  aria-label="Pitch the tune lower"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <span className="w-7 text-center tabular-nums" title="Semitones up or down">
                  {transpose > 0 ? `+${transpose}` : transpose}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTranspose((t) => Math.min(t + 1, 12))}
                  aria-label="Pitch the tune higher"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
              </div>
              {version.stanzas.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  active={singThrough}
                  onClick={() => setSingThrough((v) => !v)}
                  aria-label="Sing through every stanza"
                  title="Sing through every stanza"
                >
                  <Repeat className="h-3.5 w-3.5" />
                </Button>
              )}
              {tune && (
                <Button size="sm" variant="ghost" onClick={() => saveMidi(tune)} aria-label="Save as MIDI">
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              {tune?.composer && <span className="truncate text-ink-4">{tune.composer.replace(/;\s*/g, "; ")}</span>}
            </>
          ) : (
            <span className="text-ink-4">No tune carried for {version.metre}</span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!versions && <LoadingState />}
        {versions && versions.length === 0 && <EmptyState compact title="No metrical setting for this psalm" />}

        {tune && (
          <div className="mb-4">
            {stanzas.length > 1 && (
              <div className="mb-2 flex items-center gap-2 text-xs text-ink-3">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stanzaIdx === 0}
                  onClick={() => setStanzaIdx((i) => Math.max(0, i - stanzaStep))}
                >
                  Previous
                </Button>
                <span className="tabular-nums">
                  Stanza {stanzaIdx + 1}
                  {stanzaStep > 1 && `–${Math.min(stanzaIdx + stanzaStep, stanzas.length)}`} of {stanzas.length}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={stanzaIdx + stanzaStep >= stanzas.length}
                  onClick={() => setStanzaIdx((i) => Math.min(stanzas.length - 1, i + stanzaStep))}
                >
                  Next
                </Button>
              </div>
            )}
            <TuneStaff
              tune={tune}
              words={words}
              sounding={sounding ? { line: sounding.line, syllable: sounding.syllable } : null}
            />
          </div>
        )}

        <div className="reading-font" style={typography}>
          {version?.stanzas.length
            ? version.stanzas.map((stanza) => (
                <p
                  key={stanza.number}
                  className={`mb-3 ${
                    tune && stanza.number > stanzaIdx && stanza.number <= stanzaIdx + stanzaStep ? "" : "text-ink-2"
                  }`}
                >
                  {stanza.lines.map((line, i) => (
                    <span key={i} className="block">
                      <MetricalLine line={line} />
                    </span>
                  ))}
                </p>
              ))
            : version?.verses.map((v) => (
                <p key={v.verse} className="mb-3 whitespace-pre-line">
                  <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">{v.verse}</sup>
                  {v.text}
                </p>
              ))}
        </div>
      </div>
    </div>
  );
}
