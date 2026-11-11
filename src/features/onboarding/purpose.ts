import { ALL_ROUTES } from "../../layout/nav";

/**
 * What a reader came for, and what the app shows them first because of it.
 *
 * Sojourner serves four kinds of people -- the reader, the student, the
 * preacher, the head of a household -- and shown whole it puts 21 pages in
 * front of each of them. A new install is asked once ("What brings you
 * here?", Welcome.tsx) and the answer chooses the sidebar's pages and where
 * the app starts. Nothing is taken away: the rest waits under the sidebar's
 * More, every page answers to Go to and Search whatever the sidebar shows,
 * and Settings → Reading changes the answer or picks the pages one by one.
 *
 * Someone who was using the app before the question existed is never asked
 * and has no purpose stored, which reads as "everything": the sidebar they
 * had.
 */
export type Purpose = "reading" | "studying" | "preaching" | "family" | "everything";

/** user.db, so the answer survives a reinstall and travels with a backup. */
export const PURPOSE_SETTING = "purpose";
/** The reader's own pick of pages (routes), over the purpose's; `null` for
 * the purpose's. */
export const SIDEBAR_SETTING = "sidebar_pages";

export const PURPOSES: readonly { id: Purpose; label: string; hint: string }[] = [
  { id: "reading", label: "Reading the Bible", hint: "The text, your notes and highlights, a reading plan, prayer and memory." },
  { id: "studying", label: "Studying it deeply", hint: "Commentaries, the original languages, the confessions, an atlas and a timeline." },
  { id: "preaching", label: "Preparing to preach or teach", hint: "Everything for study, with sermons and illustrations." },
  { id: "family", label: "Leading family worship", hint: "A guided ten minutes: a reading, a psalm to sing, a catechism question, and prayer." },
  { id: "everything", label: "Show me everything", hint: "Every page in the sidebar from the start." },
];

export function isPurpose(v: unknown): v is Purpose {
  return PURPOSES.some((p) => p.id === v);
}

/** No purpose shows fewer than these: the text, and the page that says
 * where to begin. Settings cannot turn them off either. */
export const ALWAYS_SHOWN: readonly string[] = ["/today", "/"];

const READING = ["/today", "/", "/notes", "/highlights", "/plans", "/prayer", "/memory"];
const STUDYING = [...READING, "/harmony", "/lexicon", "/dictionary", "/encyclopedia", "/factbook", "/westminster", "/timeline", "/atlas", "/resources", "/guide"];
const PREACHING = [...STUDYING, "/sermons", "/illustrations"];
const FAMILY = [...READING, "/family", "/psalter", "/guide", "/westminster"];

/** The pages a purpose puts in the sidebar, as routes. */
export function pagesFor(purpose: Purpose): readonly string[] {
  switch (purpose) {
    case "reading":
      return READING;
    case "studying":
      return STUDYING;
    case "preaching":
      return PREACHING;
    case "family":
      return FAMILY;
    case "everything":
      return ALL_ROUTES;
  }
}

/** The pages the sidebar shows: the reader's own pick if they have made
 * one, else their purpose's, else (no purpose: someone here before the
 * question) all of them. Routes the app no longer has are dropped, and the
 * two that are always shown are always in. */
export function shownPages(purpose: Purpose | null, own: readonly string[] | null): ReadonlySet<string> {
  const chosen = own ?? pagesFor(purpose ?? "everything");
  return new Set([...ALWAYS_SHOWN, ...chosen.filter((r) => ALL_ROUTES.includes(r))]);
}

/** Where the app opens for a purpose (Settings → Reading → "Open on"), or
 * `null` to leave that as it is. Reading and family worship start the day
 * from Today; study and sermon work start at the text. */
export function landingFor(purpose: Purpose): "bible" | "today" | null {
  switch (purpose) {
    case "reading":
    case "family":
      return "today";
    case "studying":
    case "preaching":
      return "bible";
    case "everything":
      return null;
  }
}

/** The arrangement a new install starts in, by the name of a workspace in
 * `startingWorkspace` (Welcome.tsx), or `null` to stay on Today, where a new
 * install opens. */
export function workspaceFor(purpose: Purpose): "Study" | "Sermon prep" | "Family worship" | null {
  switch (purpose) {
    case "studying":
      return "Study";
    case "preaching":
      return "Sermon prep";
    case "family":
      return "Family worship";
    case "reading":
    case "everything":
      return null;
  }
}

/** Whether a new install should be asked. Not someone who has answered, nor
 * someone who finished or skipped the tour before the question existed, nor
 * (a phone never ran the tour) someone who has already been reading. */
export function shouldAsk(state: { purpose: Purpose | null; tourDone: boolean; hasRead: boolean }): boolean {
  return state.purpose == null && !state.tourDone && !state.hasRead;
}
