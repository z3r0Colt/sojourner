import { useMemo, useState } from "react";
import { BookOpen, ListOrdered } from "lucide-react";
import { useBookAliases, useBooks, useCreateUserReadingPlan, useUpdateUserReadingPlan } from "../../api/queries";
import type { Book, PlanReadingInput, ReadingPlan } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { Tabs } from "../../components/ui/Tabs";
import { toast } from "../../components/ui/toast";
import { checkboxClass, cx, inputClass, inputSmClass, textareaClass } from "../../components/ui/classes";
import { buildBookLookup } from "../../hooks/useReferenceParser";
import { WEEKDAYS, divideChapters, parsePlanLine, totalChapters } from "./planBuilder";

/**
 * "New plan" (F4.2): two builders in one modal. A book in N days picks
 * books and a length and divides their chapters evenly; From a list takes
 * one line per day of references. Both share a title, a description, and
 * the days of the week the plan is read on. Editing an existing plan opens
 * the list builder with its days written out.
 */

type Mode = "book" | "list";

export interface PlanBuilderInitial {
  plan: ReadingPlan;
  /** One line per day, the readings' labels joined with "; ". */
  lines: string[];
}

const ALL_WEEKDAYS = WEEKDAYS.map((w) => w.value);

function WeekdayPicker({ value, onChange }: { value: number[]; onChange: (next: number[]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-ink">Reading days</legend>
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((w) => {
          const on = value.includes(w.value);
          return (
            <label key={w.value} className={cx("flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-sm", on ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-ink-2 hover:bg-hover")}>
              <input
                type="checkbox"
                className={checkboxClass}
                checked={on}
                aria-label={w.label}
                onChange={() => onChange(on ? value.filter((d) => d !== w.value) : [...value, w.value].sort((a, b) => a - b))}
              />
              {w.short}
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-ink-3">{value.length >= 7 ? "Every day." : value.length === 0 ? "Pick at least one day." : "Days off are skipped: the plan's dates fall only on these days."}</p>
    </fieldset>
  );
}

function BookPicker({ books, selected, onChange }: { books: Book[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [filter, setFilter] = useState("");
  const shown = books.filter((b) => b.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const setAll = (ids: number[]) => onChange(ids);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter books" aria-label="Filter books" className={cx(inputSmClass, "w-40")} />
        <Button size="sm" variant="ghost" onClick={() => setAll(books.map((b) => b.id))}>
          All
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(books.filter((b) => b.testament === "OT").map((b) => b.id))}>
          Old Testament
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll(books.filter((b) => b.testament === "NT").map((b) => b.id))}>
          New Testament
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAll([])} disabled={selected.length === 0}>
          None
        </Button>
      </div>
      <div role="group" aria-label="Books" className="grid max-h-56 grid-cols-2 gap-x-3 overflow-y-auto rounded-md border border-line bg-surface p-2 sm:grid-cols-3">
        {shown.map((b) => {
          const on = selected.includes(b.id);
          return (
            <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm text-ink-2 hover:bg-hover">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={on}
                onChange={() => onChange(on ? selected.filter((id) => id !== b.id) : [...selected, b.id])}
              />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
              <span className="text-xs tabular-nums text-ink-4">{b.chapter_count}</span>
            </label>
          );
        })}
        {shown.length === 0 && <p className="col-span-full p-2 text-sm text-ink-3">No book matches.</p>}
      </div>
    </div>
  );
}

export function PlanBuilderModal({ initial, onClose, onSaved }: { initial?: PlanBuilderInitial; onClose: () => void; onSaved: (plan: ReadingPlan) => void }) {
  const { data: books } = useBooks();
  const { data: aliases } = useBookAliases();
  const lookup = useMemo(() => buildBookLookup(books ?? [], aliases ?? []), [books, aliases]);
  const create = useCreateUserReadingPlan();
  const update = useUpdateUserReadingPlan();

  const [mode, setMode] = useState<Mode>(initial ? "list" : "book");
  const [title, setTitle] = useState(initial?.plan.title ?? "");
  const [description, setDescription] = useState(initial?.plan.description ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(initial?.plan.weekdays ?? ALL_WEEKDAYS);
  const [selectedBooks, setSelectedBooks] = useState<number[]>([19]);
  const [lengthText, setLengthText] = useState("30");
  const [text, setText] = useState(initial?.lines.join("\n") ?? "");

  const chapterTotal = totalChapters(books ?? [], selectedBooks);
  const length = Math.max(1, Math.min(Math.floor(Number(lengthText) || 0), Math.max(1, chapterTotal)));
  const bookDays = useMemo(() => (mode === "book" && books ? divideChapters(books, selectedBooks, length) : []), [mode, books, selectedBooks, length]);

  const listParsed = useMemo(() => {
    if (mode !== "list") return [];
    return text
      .split(/\r?\n/)
      .map((line, i) => ({ line, n: i + 1 }))
      .filter((l) => l.line.trim() !== "")
      .map((l) => ({ ...l, result: parsePlanLine(l.line, lookup) }));
  }, [mode, text, lookup]);
  const listErrors = listParsed.filter((l) => !l.result.ok);
  const listDays: PlanReadingInput[][] = listParsed.flatMap((l) => (l.result.ok ? [l.result.readings] : []));

  const days = mode === "book" ? bookDays : listDays;
  const problems: string[] = [];
  if (!title.trim()) problems.push("Give the plan a title.");
  if (weekdays.length === 0) problems.push("Pick at least one reading day.");
  if (mode === "book" && selectedBooks.length === 0) problems.push("Pick at least one book.");
  if (mode === "list" && listParsed.length === 0) problems.push("Add at least one line.");
  if (mode === "list" && listErrors.length > 0) problems.push(`${listErrors.length} ${listErrors.length === 1 ? "line" : "lines"} could not be read.`);
  const canSave = problems.length === 0 && days.length > 0 && !create.isPending && !update.isPending;
  const dirty = title !== (initial?.plan.title ?? "") || text !== (initial?.lines.join("\n") ?? "") || (!initial && selectedBooks.join() !== "19");

  function save() {
    const input = { title: title.trim(), description: description.trim() || undefined, weekdays: weekdays.length >= 7 ? null : weekdays, days };
    if (initial) {
      update.mutate(
        { planCode: initial.plan.code, ...input },
        {
          onSuccess: (plan) => {
            toast.success("Plan saved");
            onSaved(plan);
          },
        },
      );
    } else {
      create.mutate(input, {
        onSuccess: (plan) => {
          toast.success(`Plan created: ${plan.title}`);
          onSaved(plan);
        },
      });
    }
  }

  const preview = days.slice(0, 4);
  const perDay = chapterTotal > 0 ? chapterTotal / length : 0;

  return (
    <Modal
      title={initial ? "Edit plan" : "New reading plan"}
      onClose={onClose}
      dirty={dirty}
      size="lg"
      footer={
        <>
          <span className="mr-auto text-xs text-ink-3" aria-live="polite">
            {problems[0] ?? `${days.length} ${days.length === 1 ? "day" : "days"}`}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {initial ? "Save changes" : "Create plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">Title</span>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Psalms in 30 days" className={cx(inputClass, "w-full")} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink">
              Description <span className="font-normal text-ink-3">(optional)</span>
            </span>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={cx(inputClass, "w-full")} />
          </label>
        </div>
        <WeekdayPicker value={weekdays} onChange={setWeekdays} />

        {!initial && (
          <Tabs<Mode>
            items={[
              { key: "book", label: "A book in N days", icon: BookOpen },
              { key: "list", label: "From a list", icon: ListOrdered },
            ]}
            value={mode}
            onChange={setMode}
            size="sm"
          />
        )}

        {mode === "book" && books && (
          <div className="space-y-3">
            <BookPicker books={books} selected={selectedBooks} onChange={setSelectedBooks} />
            <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
              <span className="font-medium">Read it in</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, chapterTotal)}
                value={lengthText}
                onChange={(e) => setLengthText(e.target.value)}
                aria-label="Number of days"
                className={cx(inputSmClass, "w-20 tabular-nums")}
              />
              <span className="font-medium">days</span>
              <span className="text-xs text-ink-3">
                {chapterTotal} {chapterTotal === 1 ? "chapter" : "chapters"}
                {chapterTotal > 0 && `, about ${perDay < 1.05 ? "one" : perDay.toFixed(1).replace(/\.0$/, "")} a day`}
              </span>
            </label>
          </div>
        )}

        {mode === "list" && (
          <div className="space-y-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink">One line per day</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                spellCheck={false}
                placeholder={"Psalms 1-5\nPsalms 6-10; Proverbs 1\nJohn 3:16-21"}
                className={cx(textareaClass, "w-full font-mono text-sm")}
              />
            </label>
            <p className="text-xs text-ink-3">A line can hold a book (all of it), a chapter, a chapter range, or verses; separate several readings with a semicolon.</p>
            {listErrors.length > 0 && (
              <ul className="space-y-0.5 text-xs text-danger" role="alert">
                {listErrors.slice(0, 5).map((l) => (
                  <li key={l.n}>
                    Line {l.n}: {l.result.ok ? "" : l.result.error}
                  </li>
                ))}
                {listErrors.length > 5 && <li>…and {listErrors.length - 5} more</li>}
              </ul>
            )}
          </div>
        )}

        {preview.length > 0 && (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Preview</div>
            <ol className="space-y-0.5">
              {preview.map((d, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-12 shrink-0 text-xs text-ink-3">Day {i + 1}</span>
                  <span className="text-ink-2">{d.map((r) => r.label).join("; ")}</span>
                </li>
              ))}
              {days.length > preview.length && <li className="text-xs text-ink-3">…{days.length - preview.length} more {days.length - preview.length === 1 ? "day" : "days"}</li>}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
