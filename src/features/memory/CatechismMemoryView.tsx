import { useMemo, useState } from "react";
import { Play, Plus, ScrollText, Trash2 } from "lucide-react";
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
import type { CatechismMemory, MemoryMode } from "../../api/types";
import { Button, IconButton } from "../../components/ui/Button";
import { EmptyState, LoadingState } from "../../components/ui/EmptyState";
import { confirmDelete } from "../../components/ui/confirm";
import { toast } from "../../components/ui/toast";
import { cardClass, cx, selectClass, textareaClass } from "../../components/ui/classes";

/** Catechism Study mode: pairs a Shorter (or Larger) Catechism question with
 * its answer for spaced-repetition memorization, the same SM-2 engine and
 * three practice modes as Scripture Memory, just keyed to a Westminster
 * question instead of a Bible passage. */
export function CatechismMemoryView() {
  const { data: docs } = useWestminsterDocuments();
  const catechismDocs = useMemo(() => docs?.filter((d) => d.code === "wsc" || d.code === "wlc") ?? [], [docs]);
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

  function addCard() {
    if (addSectionId === "") return;
    createCard.mutate({ westminsterSectionId: addSectionId, mode: newMode }, { onSuccess: () => toast.success("Question added to your deck") });
    setAddSectionId("");
  }

  function startPractice() {
    if (!due || due.length === 0) return;
    setQueue(due);
    setPracticing(true);
  }

  function practiceOne(c: CatechismMemory) {
    setQueue([c]);
    setPracticing(true);
  }

  function nextCard() {
    setQueue((q) => q.slice(1));
  }

  if (practicing && queue.length > 0) {
    return (
      <div className="py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm text-ink-3">
            {queue.length} question{queue.length === 1 ? "" : "s"} remaining
          </div>
          <Button size="sm" variant="ghost" onClick={() => setPracticing(false)}>
            Stop
          </Button>
        </div>
        <CatechismPracticeCard key={queue[0].id} card={queue[0]} onDone={nextCard} />
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
                {s.heading}
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

function CatechismPracticeCard({ card, onDone }: { card: CatechismMemory; onDone: () => void }) {
  const { data: section } = useWestminsterSection(card.westminster_section_id);
  const review = useReviewCatechismMemory();
  const typography = useReadingTypography(1.05);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);

  const answer = section?.body ?? "";

  function grade(quality: number) {
    review.mutate({ id: card.id, quality });
    setRevealed(false);
    setChecked(false);
    setTyped("");
    onDone();
  }

  const diff = answer && checked ? diffTyped(answer, typed) : null;
  const accuracy = diff ? diffAccuracy(diff) : null;
  const suggestedQuality = accuracy == null ? null : accuracy >= 0.95 ? 5 : accuracy >= 0.8 ? 4 : accuracy >= 0.5 ? 3 : 1;

  return (
    <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <div className="mb-1 text-sm font-semibold text-ink-3">{section?.heading ?? `#${card.westminster_section_id}`}</div>
      {!section && <LoadingState />}
      {section?.prompt && (
        <p className="reading-font mb-4 font-medium italic text-ink" style={typography}>
          {section.prompt}
        </p>
      )}

      {answer && card.mode !== "type-it" && (
        <>
          <p className="reading-font mb-5 text-ink" style={typography}>
            {revealed ? answer : applyMemoryMode(answer, card.mode)}
          </p>
          {!revealed ? <Button onClick={() => setRevealed(true)}>Reveal</Button> : <GradeButtons onGrade={grade} />}
        </>
      )}

      {answer && card.mode === "type-it" && (
        <>
          {!checked ? (
            <>
              <textarea
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                rows={4}
                placeholder="Type the answer from memory…"
                className={cx(textareaClass, "reading-font mb-3 w-full")}
                style={typography}
              />
              <Button variant="primary" onClick={() => setChecked(true)}>
                Check
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
