import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { BookOpen, Check, ChevronDown, ChevronRight, ExternalLink, GraduationCap, Presentation } from "lucide-react";
import { api } from "../../api/client";
import { useBooks, useCreateSermon, useResources } from "../../api/queries";
import type { WestminsterParallel } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { cardClass, cx } from "../../components/ui/classes";
import { toast } from "../../components/ui/toast";
import { bookName } from "../../lib/passage";
import { usePane } from "../../workspace/PaneContext";
import { openContent } from "../../workspace/openContent";
import { DEEPER_PREFIX, markDone, sectionId, type Lesson, type LessonProgress, type Passage, type StepOpen } from "./course";
import { FURTHER_READING, PARALLEL_COMMENTARY, fisherQuestion, lessonReadings, mainQuestion, keyVerse, originalLanguage, parallelPlace, teachItManuscript } from "./deeper";
import { findBook, openStep } from "./openStep";
import { useCatechismAnswers } from "./useGuideData";

interface Item {
  key: string;
  title: string;
  text: string;
  /** One button per place; most items have one. */
  opens: { label: string; open: StepOpen }[];
  missing?: boolean;
}

/** The Larger Catechism questions and Confession paragraphs that teach what
 * the lesson's questions teach, once each, in the order the database gives. */
function useParallels(lesson: Lesson): WestminsterParallel[] | undefined {
  const results = useQueries({
    queries: lesson.questions.map((q) => ({
      queryKey: ["westminsterParallels", sectionId("wsc", q)],
      queryFn: () => api.getWestminsterParallels(sectionId("wsc", q)),
      staleTime: Infinity,
    })),
  });
  const key = results.map((r) => r.dataUpdatedAt).join(",");
  return useMemo(() => {
    if (results.some((r) => r.data === undefined)) return undefined;
    const seen = new Set<string>();
    return results.flatMap((r) => r.data ?? []).filter((p) => {
      const k = `${p.document_code} ${p.label}`;
      if (seen.has(k) || (p.document_code !== "wlc" && p.document_code !== "wcf")) return false;
      seen.add(k);
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function parallelLabel(p: Pick<WestminsterParallel, "document_code" | "label">): string {
  return `${p.document_code.toUpperCase()} ${p.label}`;
}

/**
 * The lesson's "Go deeper" section: closed unless the student opens it, and
 * kept open for every lesson once they do. Its items tick like steps but
 * never count toward finishing the lesson.
 */
export function DeeperSection({
  lesson,
  open,
  onToggle,
  progress,
  update,
}: {
  lesson: Lesson;
  open: boolean;
  onToggle: () => void;
  progress: LessonProgress | undefined;
  update: (change: (p: LessonProgress) => LessonProgress) => void;
}) {
  const { id: paneId } = usePane();
  const { data: books } = useBooks();
  const { data: resources } = useResources();
  const parallels = useParallels(lesson);
  const answers = useCatechismAnswers(open ? lesson.questions : []);
  const createSermon = useCreateSermon();

  if (lesson.review) return null;

  const verse = keyVerse(lesson);
  const ref = (p: Passage) => `${bookName(books, p.book)} ${p.chapter}${p.verse ? `:${p.verse}${p.to ? `–${p.to}` : ""}` : ""}`;
  const first = mainQuestion(lesson);
  const fisher = fisherQuestion(lesson);

  const items: Item[] = [];
  if (parallels?.length) {
    const wlc = parallels.filter((p) => p.document_code === "wlc");
    const wcf = parallels.filter((p) => p.document_code === "wcf");
    items.push({
      key: "standards",
      title: "The Larger Catechism and the Confession",
      text: `The Assembly taught the same doctrine at greater length in the Larger Catechism (${wlc.length ? wlc.map((p) => p.label).join(", ") : "none on this subject"}) and the Confession of Faith (${wcf.length ? wcf.map((p) => p.label).join(", ") : "none on this subject"}). Each opens with a commentary beside it: Thomas Ridgley (1731) on the Larger Catechism, A. A. Hodge (1869) on the Confession.`,
      opens: parallels.flatMap((p) => {
        const place = parallelPlace(p.document_code, p.label);
        return place ? [{ label: parallelLabel(p), open: { pane: "westminster" as const, ...place, commentary: PARALLEL_COMMENTARY[place.doc] } }] : [];
      }),
    });
  }
  items.push(
    {
      key: "beattie",
      title: "The three Standards together",
      text: "Francis Beattie’s The Presbyterian Standards (1896) follows the Shorter Catechism and gathers what the Larger Catechism and the Confession say on each subject into one chapter.",
      opens: [{ label: `Read Beattie on Q${first}`, open: { pane: "westminster", doc: "wsc", n: first, commentary: "beattie-wsc" } }],
    },
    {
      key: "fisher",
      title: "Fisher’s questions",
      text: "James Fisher and Ebenezer Erskine (1753) take each answer apart in many short questions, with a proof for each answer. Try answering before you read theirs.",
      opens: [{ label: `Read Fisher on Q${fisher}`, open: { pane: "westminster", doc: "wsc", n: fisher, commentary: "fisher" } }],
    },
    {
      key: "original",
      title: `${ref(verse)} in ${originalLanguage(verse)}`,
      text: `Read the verse this lesson keeps in the ${originalLanguage(verse)}, word by word. Click a word to see its lexicon entry and where else it is used.`,
      opens: [{ label: `Interlinear on ${ref(verse)}`, open: { pane: "interlinear", passage: verse } }],
    },
    {
      key: "cited",
      title: "Who has preached on it",
      text: `Every place your library cites ${ref(verse)}: the Fathers, the Reformers and the Puritans on the same verse.`,
      opens: [{ label: `Cited in your library: ${ref(verse)}`, open: { pane: "citations", passage: verse } }],
    },
  );
  for (const r of FURTHER_READING[lesson.id] ?? []) {
    const have = resources ? !!findBook(resources, r.title, r.author) : true;
    items.push({
      key: `read-${r.title}`,
      title: `Further reading: ${r.title}`,
      text: r.why,
      missing: !have,
      opens: [{ label: `Open ${r.author}`, open: { pane: "book", title: r.title, author: r.author, fallback: { doc: "wsc", n: first, commentary: "beattie-wsc" } } }],
    });
  }

  const done = (key: string) => !!progress?.done[DEEPER_PREFIX + key];
  const tick = (key: string) => update((p) => markDone(p, DEEPER_PREFIX + key, new Date().toISOString()));

  const teach = async () => {
    if (!answers) return;
    const { title, body } = teachItManuscript({
      lesson,
      answers: lesson.questions.flatMap((n) => {
        const s = answers.get(n);
        return s ? [{ n, prompt: s.prompt ?? s.heading, body: s.body }] : [];
      }),
      parallels: (parallels ?? []).map(parallelLabel),
    });
    try {
      // The first passage the lesson reads is the outline's text.
      const text = lessonReadings(lesson)[0];
      const passages = text ? [{ role: "text" as const, book_id: text.book, chapter: text.chapter, verse_start: text.verse ?? null, verse_end: text.to ?? text.verse ?? null }] : [];
      const sermon = await createSermon.mutateAsync({ title, body, passages, status: "draft", stage: "outline", tags: ["catechism", lesson.id] });
      tick("teach");
      openContent("sermon", { id: sermon.id }, { target: "new", from: paneId });
    } catch (e) {
      toast.error(`Couldn’t make the outline: ${String(e)}`);
    }
  };

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md py-1 text-left text-base font-semibold text-ink hover:text-accent"
      >
        {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
        <GraduationCap className="h-4 w-4" aria-hidden="true" />
        Go deeper
        {!open && <span className="text-sm font-normal text-ink-3">· the other Standards, the original, the Puritans, teaching it</span>}
      </button>
      {open && (
        <>
          <p className="mb-3 mt-1 text-sm text-ink-3">For when you have more time, or have studied the Catechism before. None of it is needed to finish the lesson.</p>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.key} className={cx(cardClass, done(item.key) && "border-accent/30")}>
                <h3 className="flex items-center gap-2 font-medium text-ink">
                  {done(item.key) ? <Check className="h-4 w-4 text-accent" aria-label="Opened" /> : <BookOpen className="h-4 w-4 text-ink-4" aria-hidden="true" />}
                  {item.title}
                </h3>
                <p className="mt-1 text-sm text-ink-2">{item.text}</p>
                {item.missing && <p className="mt-1 text-xs text-ink-3">Not in your library: it comes with the Sojourner library packs.</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {item.opens.map((o) => (
                    <Button
                      key={o.label}
                      size="sm"
                      icon={ExternalLink}
                      onClick={async () => {
                        await openStep(o.open, paneId);
                        tick(item.key);
                      }}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
            <li className={cx(cardClass, done("teach") && "border-accent/30")}>
              <h3 className="flex items-center gap-2 font-medium text-ink">
                {done("teach") ? <Check className="h-4 w-4 text-accent" aria-label="Made" /> : <Presentation className="h-4 w-4 text-ink-4" aria-hidden="true" />}
                Teach it
              </h3>
              <p className="mt-1 text-sm text-ink-2">
                The best way to learn an answer is to teach it. Make a lesson outline in Sermons: the question and answer, the passages, the other Standards
                to consult, and this lesson’s questions for discussion. Fill in the explanation and application, then print it as a handout.
              </p>
              <div className="mt-2">
                <Button size="sm" icon={Presentation} disabled={!answers || createSermon.isPending} onClick={teach}>
                  Make a lesson outline
                </Button>
              </div>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
