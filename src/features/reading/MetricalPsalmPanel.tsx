import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp, Download, Music, Pause, Play, Repeat } from "lucide-react";
import { useMetricalPsalm, usePsalmTunes } from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import { Button } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { STAFF_LYRIC_PX, TuneStaff } from "../psalter/TuneStaff";
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

/** Room the stanza's Previous / Next row takes above the staff. */
const STANZA_NAV_PX = 40;
/** How much of the Sing step the staff may take; the psalm's text has the rest. */
const STAFF_SHARE = 0.85;
/** Below this height the bars above the psalm scroll with it (see `short`). */
const SHORT_PANE_PX = 400;

/** One metrical line, with each verse number set where the verse actually
 *  begins -- which is regularly part-way along the line, since a stanza does
 *  not respect the verse divisions. */
function MetricalLine({ line, numberStyle }: { line: MetricalPsalmLine; numberStyle?: CSSProperties }) {
  const words = line.text.split(" ");
  const marks = new Map(line.marks.map((m) => [m.word, m.verse]));
  return (
    <>
      {words.map((word, i) => (
        <span key={i}>
          {marks.has(i) && (
            <sup className="mr-0.5 select-none font-sans text-xs font-semibold text-ink-4" style={numberStyle}>
              {marks.get(i)}
            </sup>
          )}
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </>
  );
}

/** `fontSize` sets the words' size outright, for family worship's gather-round
 *  view; without it they follow the reading preferences. The staff's words
 *  grow with it. `singing` is family worship's Sing step: the stanza being
 *  sung keeps its whole staff in view, drawn as large as the room allows,
 *  and the psalm's text scrolls beneath it. `zoom` is the Psalter page's
 *  zoom (1 is its own size): the staff and the words grow together. */
export function MetricalPsalmPanel({
  psalm,
  fontSize,
  singing = false,
  zoom = 1,
}: {
  psalm: number;
  fontSize?: number;
  singing?: boolean;
  zoom?: number;
}) {
  const { data: versions } = useMetricalPsalm(psalm);
  const [versionIdx, setVersionIdx] = useState(0);
  const version = versions?.[Math.min(versionIdx, (versions?.length ?? 1) - 1)];
  const readingTypography = useReadingTypography(0.9);
  const typography = { ...readingTypography, fontSize: (fontSize ?? Number(readingTypography.fontSize)) * zoom };
  // The verse numbers in the words zoom with them.
  const numberStyle: CSSProperties | undefined = zoom === 1 ? undefined : { fontSize: `${0.75 * zoom}rem` };

  // In a pane too short for the bars above the psalm to stay put and still
  // leave the staff room, the bars scroll away with the psalm instead of
  // taking half the pane. The Sing step keeps its own layout.
  const panel = useRef<HTMLDivElement>(null);
  const [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const el = panel.current;
    if (singing || !el || typeof ResizeObserver === "undefined") return;
    const measure = () => setShort(el.clientHeight > 0 && el.clientHeight < SHORT_PANE_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [singing]);
  // Outside the Sing step the bars' controls sit in a centred column, over
  // the centred staff and words, rather than strung along a wide pane.
  const column = singing ? "" : "mx-auto w-full max-w-3xl";

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
  const texts = sung.map((line) => line.text);
  // A doubled tune's last pass may have one stanza left for it (Psalm 137
  // has seven stanzas for a tune that takes two): that stanza is sung to the
  // tune's first half, and only that half is shown and played -- never a
  // half of the tune with no words under it.
  const shownTune = useMemo(
    () => (tune && words.length > 0 && words.length < tune.lines.length ? { ...tune, lines: tune.lines.slice(0, words.length) } : tune),
    [tune, words.length],
  );
  const lastStanza = Math.min(stanzaIdx + stanzaStep, stanzas.length);

  // The room the Sing step's staff is drawn to fit: its share of the step's
  // height, less its padding, the stanza row, and the note under a half
  // tune.
  const staffRoom = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = staffRoom.current;
    if (!singing || !el) return;
    const measure = () => setRoom({ width: el.clientWidth - 24, height: el.clientHeight * STAFF_SHARE - 24 - STANZA_NAV_PX - 24 });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [singing]);

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
    const left = Math.max(stanzas.length - stanzaIdx, 1);
    const remaining = Math.ceil(left / stanzaStep);
    // Where the last pass has fewer stanzas than the tune takes, it sings
    // only as many of the tune's lines as it has words for.
    const short = left % stanzaStep;
    const lastPassLines = short && version ? short * version.pattern.length : undefined;
    const from = stanzaIdx;
    const notes = singThrough
      ? schedule(tune, beat, { transpose, passes: remaining, lastPassLines })
      : schedule(shownTune ?? tune, beat, { transpose });
    player.current?.play(notes, {
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
    <div ref={panel} className={short ? "h-full w-full overflow-y-auto" : "flex h-full w-full flex-col"}>
      <div className="border-b border-line px-3 py-2 text-xs text-ink-3">
        <div className={`flex flex-wrap items-baseline gap-x-2 ${column}`}>
          <span>1650 Scottish Metrical Psalter · Psalm {psalm}</span>
          {version && <span className="ml-auto font-medium text-ink-2">{version.metre}</span>}
        </div>
      </div>

      {versions && versions.length > 1 && (
        <div className="border-b border-line px-2 py-1.5">
          <div className={`flex flex-wrap gap-1 ${column}`}>
            {versions.map((v, i) => (
              <Button key={i} size="sm" variant="ghost" active={i === versionIdx} onClick={() => setVersionIdx(i)}>
                {v.label ?? `Version ${i + 1}`}
              </Button>
            ))}
          </div>
        </div>
      )}

      {version && (
        <div className="border-b border-line px-2 py-1.5 text-xs">
          <div className={`flex flex-wrap items-center gap-2 ${column}`}>
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
        </div>
      )}

      <div
        ref={staffRoom}
        className={singing ? "flex min-h-0 flex-1 flex-col" : short ? "p-3" : "min-h-0 flex-1 overflow-y-auto p-3"}
      >
        {!versions && <LoadingState />}
        {versions && versions.length === 0 && <EmptyState compact title="No metrical setting for this psalm" />}

        {/* A setting whose metre no tune in the library is written in is
            still sung -- to a tune the family knows -- but there is no staff
            to show, and the page says so rather than showing nothing. */}
        {version && tunes && tunes.length === 0 && version.stanzas.length > 0 && (
          <p className={`${singing ? "m-3 mb-0" : `mb-4 ${column}`} rounded-md border border-dashed border-line px-3 py-2 text-xs text-ink-3`}>
            No tune in this psalter is written in {version.metre.replace(/\.$/, "")}, so there is no staff for this setting. The words
            are below, to be sung to any tune of that metre.
          </p>
        )}

        {tune && shownTune && (
          <div
            className={singing ? "min-h-0 shrink overflow-y-auto border-b border-line p-3" : "mb-4"}
            style={singing ? { flexBasis: "auto", maxHeight: `${STAFF_SHARE * 100}%` } : undefined}
          >
            {stanzas.length > 1 && (
              <div className="mb-2 flex flex-wrap items-center justify-center gap-x-2 text-xs text-ink-3">
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
                  {lastStanza > stanzaIdx + 1 && `–${lastStanza}`} of {stanzas.length}
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
              tune={shownTune}
              words={words}
              texts={texts}
              sounding={sounding ? { line: sounding.line, syllable: sounding.syllable } : null}
              lyricPx={(fontSize ? Math.max(STAFF_LYRIC_PX, fontSize * 0.8) : singing ? STAFF_LYRIC_PX * 1.3 : STAFF_LYRIC_PX) * zoom}
              fit={singing && room ? { ...room, minLyricPx: fontSize ? Math.max(STAFF_LYRIC_PX, fontSize * 0.6) : undefined } : undefined}
            />
            {shownTune !== tune && (
              <p className="mt-1 text-center text-xs text-ink-4">
                {tune.name} takes {stanzaStep} stanzas at a time; the last is sung to its first half.
              </p>
            )}
          </div>
        )}

        <div className={`reading-font ${singing ? "min-h-[5rem] flex-1 overflow-y-auto p-3" : ""}`} style={typography}>
          {/* The stanzas as a block centred under the staff, their lines
              set flush left within it as the book sets them; prose verses
              keep a readable measure. */}
          <div className={`mx-auto [overflow-wrap:anywhere] ${version?.stanzas.length ? "w-fit max-w-full" : "max-w-[46em]"}`}>
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
                        <MetricalLine line={line} numberStyle={numberStyle} />
                      </span>
                    ))}
                  </p>
                ))
              : version?.verses.map((v) => (
                  <p key={v.verse} className="mb-3 whitespace-pre-line">
                    <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4" style={numberStyle}>
                    {v.verse}
                  </sup>
                    {v.text}
                  </p>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
