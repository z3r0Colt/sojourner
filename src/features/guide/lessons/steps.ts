import type { Doc, HenryAsk, Passage, QuizQuestion, Standard, Step, StepOpen } from "../course";
import { HIGHLIGHT_TIP, NOTE_TIP } from "./tips";

/**
 * The steps most lessons share, so a lesson file reads as its content.
 * Step ids are fixed by kind ("before", "answer", "check"...), which keeps
 * a lesson's progress if its steps are reordered; a lesson with two steps of
 * one kind passes its own id to the second.
 */

/** Book ids, as the app numbers them. */
export const B = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8, "1Sam": 9, "2Sam": 10, "1Kgs": 11, "2Kgs": 12,
  "1Chr": 13, "2Chr": 14, Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19, Prov: 20, Eccl: 21, Song: 22, Isa: 23, Jer: 24,
  Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29, Amos: 30, Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36,
  Hag: 37, Zech: 38, Mal: 39, Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45, "1Cor": 46, "2Cor": 47, Gal: 48,
  Eph: 49, Phil: 50, Col: 51, "1Thess": 52, "2Thess": 53, "1Tim": 54, "2Tim": 55, Titus: 56, Phlm: 57, Heb: 58, Jas: 59,
  "1Pet": 60, "2Pet": 61, "1John": 62, "2John": 63, "3John": 64, Jude: 65, Rev: 66,
} as const;

/** `p("Rom", 3, 21, 28)`: Romans 3:21–28. */
export function p(book: keyof typeof B, chapter: number, verse?: number, to?: number): Passage {
  return { book: B[book], chapter, ...(verse != null ? { verse } : {}), ...(to != null ? { to } : {}) };
}

export function before(text: string, placeholder?: string): Step {
  return { id: "before", title: "Before you read", text, check: { type: "answer", placeholder } };
}

/** Read a passage and highlight in it. */
export function read(title: string, text: string, passage: Passage, mark: Passage = passage, opts: { id?: string; openLabel?: string; tip?: string | null } = {}): Step {
  return {
    id: opts.id ?? "observe",
    title,
    text,
    tip: opts.tip === null ? undefined : (opts.tip ?? HIGHLIGHT_TIP),
    open: { pane: "bible", passage },
    openLabel: opts.openLabel,
    check: { type: "highlight", passage: mark },
  };
}

/** A step done by opening something and looking. */
export function look(id: string, title: string, text: string, open: StepOpen, opts: { tip?: string; openLabel?: string; optional?: boolean } = {}): Step {
  return { id, title, text, open, check: { type: "opened" }, ...opts };
}

/** The Catechism's answer, opened in the Confessions. */
export function answer(question: number, text: string, tip?: string): Step {
  return look("answer", "The Catechism’s answer", text, { pane: "westminster", doc: "wsc", n: question }, { tip, openLabel: `Open Question ${question}` });
}

/** A Larger Catechism question or a Confession paragraph. */
export function standards(text: string, doc: Standard | Doc, n: number, section?: number, title = "The Larger Catechism and the Confession"): Step {
  const label = doc === "wlc" ? `Open WLC ${n}` : doc === "wcf" ? `Open WCF ${n}${section ? `.${section}` : ""}` : undefined;
  return look("standards", title, text, { pane: "westminster", doc, n, section }, { openLabel: label });
}

const AUTHORS: Record<string, string> = {
  whyte: "Whyte",
  flavel: "Flavel",
  fisher: "Fisher",
  vincent: "Vincent",
  henry: "Henry",
  "beattie-wsc": "Beattie",
};

/** An old expositor on the question, in the Confessions' commentary panel. */
export function teaching(question: number, source: keyof typeof AUTHORS, text: string): Step {
  return look("teaching", "Teaching", text, { pane: "westminster", doc: "wsc", n: question, commentary: source }, {
    openLabel: `Read ${AUTHORS[source]} on Q${question}`,
  });
}

/** Watson's sermon on the question, opened at `find`; Whyte on the question
 * when the library has not got the book. */
export function classic(
  text: string,
  book: "A Body of Divinity" | "The Ten Commandments" | "The Lord's Prayer",
  find: string,
  question: number,
  fallback: keyof typeof AUTHORS = "flavel",
): Step {
  return look("classic", "A classic reading", text, { pane: "book", title: book, find, fallback: { doc: "wsc", n: question, commentary: fallback } }, {
    openLabel: "Open Watson",
    optional: true,
  });
}

/** Questions on the answer, then Henry's. */
export function quiz(own: QuizQuestion[], henry: [number, string][], text?: string): Step {
  const asks: HenryAsk[] = henry.map(([question, ask]) => ({ question, ask }));
  return {
    id: "check",
    title: "Check your understanding",
    text:
      text ??
      (asks.length
        ? "A question on the answer, then some of Matthew Henry’s from A Scripture Catechism (1703), each answered from Scripture."
        : "Questions on what you have read."),
    check: { type: "quiz", questions: own, henry: asks },
  };
}

export function write(text: string, passage: Passage, tag: string, openLabel?: string): Step {
  return { id: "write", title: "Write it", text, tip: NOTE_TIP, open: { pane: "bible", passage }, openLabel, check: { type: "note", passage, tag } };
}

export function keep(text: string, questions: number[], verse?: Passage, tip?: string): Step {
  return { id: "keep", title: "Keep it", text, tip, check: { type: "memory", questions, verse } };
}

export function sing(psalm: number, text: string, tip?: string): Step {
  return { id: "sing", title: "Sing", text, tip, open: { pane: "psalter", psalm }, openLabel: `Open Psalm ${psalm}`, check: { type: "opened" }, optional: true };
}

/** Prayer in the prayer journal, tagged with the lesson. */
export function pray(text: string, tag: string, tip?: string): Step {
  return { id: "pray", title: "Pray", text, tip, open: { pane: "prayer" }, openLabel: "Open the prayer journal", check: { type: "prayer", tag } };
}

/** Prayer with no tool (before the prayer journal is introduced). */
export function prayQuietly(text: string): Step {
  return { id: "pray", title: "Pray", text, optional: true };
}
