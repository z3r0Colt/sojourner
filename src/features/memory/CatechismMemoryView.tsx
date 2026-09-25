import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, Play, Plus, ScrollText, Trash2 } from "lucide-react";
import {
  useWestminsterDocuments,
  useWestminsterSections,
  useWestminsterSection,
  useCatechismMemory,
  useDueCatechismMemory,
  useCreateCatechismMemory,
  useSetCatechismMemoryMode,
  useDeleteCatechismMemory,
  useReviewCatechismMemory,
} from "../../api/queries";
import { useReadingTypography } from "../../state/uiStore";
import { applyMemoryMode, diffTyped, diffAccuracy } from "./memoryText";
import { MemoryModeSelect } from "./MemoryModeSelect";
import { GradeButtons } from "./GradeButtons";
import { usePracticeKeys } from "./practiceKeys";
import type { CatechismMemory, MemoryMode } from "../../api/types";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { Kbd } from "../../components/ui/Page";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, selectClass, textareaClass } from "../../components/ui/classes";
import { usePaneNavigate } from "../../workspace/PaneContext";

/** Catechism Study mode: pairs a question from the Shorter or Larger
 * Catechism, the Heidelberg Catechism, or the Catechism for Young Children
 * with its answer for
 * spaced-repetition memorization, the same SM-2 engine and three practice
 * modes as Scripture Memory, just keyed to a Westminster question instead of
 * a Bible passage. */
const CATECHISM_CODES = ["wsc", "wlc", "heidelberg", "cyc"];

export function CatechismMemoryView() {
  const { data: docs } = useWestminsterDocuments();
  const catechismDocs = useMemo(() => docs?.filter((d) => CATECHISM_CODES.includes(d.code)) ?? [], [docs]);
  const [addDocId, setAddDocId] = useState<number | "">("");
  const [addSectionId, setAddSectionId] = useState<number | "">("");
  const [newMode, setNewMode] = useState<MemoryMode>("type-it");
  const { data: sectionsForAdd } = useWestminsterSections(addDocId === "" ? null : addDocId);

  const { data: all } = useCatechismMemory();
  const { data: due } = useDueCatechismMemory();
  const createCard = useCreateCatechismMemory();
  const setMode = useSetCatechismMemoryMode();
  const deleteCard = useDeleteCatechismMemory();

  const [practicing, setPracticing] = useState(false);
  const [queue, setQueue] = useState<CatechismMemory[]>([]);
  const [history, setHistory] = useState<CatechismMemory[]>([]);

  function addCard() {
    if (addSectionId === "") return;
    createCard.mutate({ westminsterSectionId: addSectionId, mode: newMode }, { onSuccess: () => toast.success("Question added to your deck") });
    setAddSectionId("");
  }

  function startPractice() {
    if (!due || due.length === 0) return;
    setQueue(due);
    setHistory([]);
    setPracticing(true);
  }

  function practiceOne(c: CatechismMemory) {
    setQueue([c]);
    setHistory([]);
    setPracticing(true);
  }

  // From the current render's state, never nested in another updater
  // (StrictMode runs updaters twice and would duplicate the card).
  function nextCard() {
    const [done, ...rest] = queue;
    if (!done) return;
    setHistory((h) => [...h, done]);
    setQueue(rest);
  }

  function previousCard() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setQueue((q) => [last, ...q]);
  }

  if (practicing && queue.length > 0) {
    return (
      <div className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-ink-3">
            {queue.length} question{queue.length === 1 ? "" : "s"} remaining
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={previousCard} disabled={history.length === 0} title="Previous question (Backspace)">
              Back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPracticing(false)}>
              Stop
            </Button>
          </div>
        </div>
        <CatechismPracticeCard key={queue[0].id} card={queue[0]} onDone={nextCard} onBack={history.length > 0 ? previousCard : undefined} />
      </div>
    );
  }

  if (practicing && queue.length === 0) {
    return (
      <div className="py-10 text-center">
        <h2 className="mb-4 text-xl font-semibold text-ink">Session complete</h2>
        <Button onClick={() => setPracticing(false)}>Done</Button>
      </div>
    );
  }

  const hasAny = (all?.length ?? 0) > 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-surface-2 p-3">
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Catechism</span>
          <select
            value={addDocId}
            onChange={(e) => {
              setAddDocId(e.target.value === "" ? "" : Number(e.target.value));
              setAddSectionId("");
            }}
            className={selectClass}
          >
            <option value="">Choose…</option>
            {catechismDocs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs font-medium text-ink-3">Question</span>
          <select
            value={addSectionId}
            onChange={(e) => setAddSectionId(e.target.value === "" ? "" : Number(e.target.value))}
            disabled={addDocId === ""}
            className={cx(selectClass, "w-full")}
          >
            <option value="">Choose…</option>
            {sectionsForAdd?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.prompt ? `${s.heading} — ${s.prompt}` : s.heading}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-ink-3">Practice mode</span>
          <MemoryModeSelect value={newMode} onChange={setNewMode} />
        </label>
        <Button variant="primary" icon={Plus} onClick={addCard} disabled={addSectionId === ""}>
          Add
        </Button>
      </div>

      {hasAny && (
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-3">{due && due.length > 0 ? `${due.length} due for review today` : "Nothing due today"}</p>
          <Button variant="primary" icon={Play} onClick={startPractice} disabled={!due || due.length === 0}>
            Practice what's due
          </Button>
        </div>
      )}

      {!hasAny && (
        <EmptyState
          icon={ScrollText}
          title="No catechism questions in your deck"
          description="Pick a catechism and a question above. Typing the answer from memory and checking it word for word is the most effective mode."
        />
      )}

      <ul className="space-y-2">
        {all?.map((c) => (
          <CardRow
            key={c.id}
            card={c}
            onPractice={() => practiceOne(c)}
            onSetMode={(mode) => setMode.mutate({ id: c.id, mode })}
            onDelete={async (label) => {
              if (await confirmDelete(`${label} from your deck`, "Your review history for it is lost.")) {
                deleteCard.mutate(c.id, { onSuccess: () => toast.info("Removed from deck") });
              }
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function CardRow({
  card,
  onPractice,
  onSetMode,
  onDelete,
}: {
  card: CatechismMemory;
  onPractice: () => void;
  onSetMode: (mode: MemoryMode) => void;
  onDelete: (label: string) => void;
}) {
  const { data: section } = useWestminsterSection(card.westminster_section_id);
  const label = section?.heading ?? `#${card.westminster_section_id}`;
  return (
    <li className={cx(cardClass, "flex flex-wrap items-center gap-2")}>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-ink">{label}</span>
        {section?.prompt && <span className="ml-2 text-sm text-ink-2">{section.prompt}</span>}
        <div className="text-xs text-ink-3">
          due {new Date(card.due_at).toLocaleDateString()} · {card.repetitions} review{card.repetitions === 1 ? "" : "s"}
        </div>
      </div>
      <Button size="sm" variant="secondary" icon={Play} onClick={onPractice}>
        Practice
      </Button>
      <MemoryModeSelect small value={card.mode} onChange={onSetMode} />
      <IconButton icon={Trash2} label="Remove from deck" size="sm" onClick={() => onDelete(label)} />
    </li>
  );
}

function CatechismPracticeCard({ card, onDone, onBack }: { card: CatechismMemory; onDone: () => void; onBack?: () => void }) {
  const { data: section } = useWestminsterSection(card.westminster_section_id);
  const { data: docs } = useWestminsterDocuments();
  const review = useReviewCatechismMemory();
  const typography = useReadingTypography(1.05);
  const navigate = usePaneNavigate();
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const answer = section?.body ?? "";
  const typeIt = card.mode === "type-it";
  const answerShowing = !!answer && (typeIt ? checked : revealed);
  const docCode = section ? docs?.find((d) => d.id === section.document_id)?.code : undefined;

  const grade = useCallback(
    (quality: number) => {
      review.mutate({ id: card.id, quality });
      setRevealed(false);
      setChecked(false);
      setTyped("");
      onDone();
    },
    [review, card.id, onDone],
  );
  const reveal = useCallback(() => setRevealed(true), []);
  const check = useCallback(() => setChecked(true), []);

  usePracticeKeys({
    onReveal: answer && !typeIt && !revealed ? reveal : undefined,
    onCheck: answer && typeIt && !checked ? check : undefined,
    onGrade: answerShowing ? grade : undefined,
    onBack,
  });

  const diff = answer && checked ? diffTyped(answer, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  const suggestedQuality = accuracy == null ? null : accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.5 ? 3 : 1;

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-sm font-semibold text-ink-3">{section?.heading ?? `#${card.westminster_section_id}`}</div>
        {docCode && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
            title="Open this question in the Confessions with its proof texts (Ctrl+click for a new pane)"
            onClick={(e) => navigate(`/westminster/${docCode}/${card.westminster_section_id}`, e)}
            onAuxClick={(e) => e.button === 1 && navigate(`/westminster/${docCode}/${card.westminster_section_id}`, e)}
          >
            <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
            Read in context
          </button>
        )}
      </div>
      {!section && <LoadingState />}
      {section?.prompt && (
        <p className="reading-font mb-4 font-medium italic text-ink" style={typography}>
          {section.prompt}
        </p>
      )}

      {answer && !typeIt && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            {revealed || card.mode === "type-it" ? answer : applyMemoryMode(answer, card.mode)}
          </p>
          {!revealed ? (
            <Button onClick={reveal} aria-keyshortcuts="Space">
              Reveal
              <Kbd>Space</Kbd>
            </Button>
          ) : (
            <GradeButtons onGrade={grade} />
          )}
        </>
      )}

      {answer && typeIt && (
        <>
          {!checked ? (
            <>
              <textarea
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={4}
                placeholder="Type the answer from memory… (Enter checks, Shift+Enter for a new line)"
                className={cx(textareaClass, "reading-font mb-3 w-full")}
                style={typography}
              />
              <Button variant="primary" onClick={check} aria-keyshortcuts="Enter">
                Check
                <Kbd>Enter</Kbd>
              </Button>
            </>
          ) : (
            <>
              <p className="reading-font mb-1 text-ink" style={typography}>
                {diff!.map((t, i) => (
                  <span
                    key={i}
                    className={
                      t.status === "correct"
                        ? undefined
                        : t.status === "wrong"
                          ? "rounded bg-red-100 text-red-800 line-through dark:bg-red-950/50 dark:text-red-400"
                          : "rounded bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
                    }
                  >
                    {t.word}{" "}
                  </span>
                ))}
              </p>
              <p className="mb-4 text-xs text-ink-3">{Math.round((accuracy ?? 0) * 100)}% of words recalled correctly.</p>
              <GradeButtons onGrade={grade} suggested={suggestedQuality} />
            </>
          )}
        </>
      )}
    </div>
  );
}
