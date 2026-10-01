import { api } from "../../api/client";
import type { CommentarySource } from "../../api/types";
import { toast } from "../../components/ui/toast";
import { findPane, useWorkspaceStore, type PaneKind, type ParamsOf } from "../../state/workspaceStore";
import { openContent, openPassage } from "../../workspace/openContent";
import { applyWorkspace, indexTree, type SavedPane } from "../../workspace/presets";
import { sectionId, type Lesson, type Passage, type StepOpen } from "./course";

/**
 * Opening a step's pane beside the Guide.
 *
 * A step never replaces the Guide itself: what it opens goes into a pane of
 * that kind already on screen, else a new one beside the Guide. A study pane
 * (cross references, confessions on a passage) turns the Bible to its passage
 * first and opens from the Bible pane, so it joins the Bible's link group and
 * goes on following it as the student reads on.
 */

function existingPane(kind: PaneKind, guidePaneId: string) {
  const { panes } = useWorkspaceStore.getState();
  return panes.find((p) => p.kind === kind && p.id !== guidePaneId);
}

/** Into the pane of that kind already open; else a new tab in the study
 * column (the last pane that is neither the Guide nor the Bible); else a new
 * pane beside the Bible, or beside the Guide. Never into the Guide's own
 * slot, where a new tab would cover the lesson. */
function openBeside<K extends PaneKind>(kind: K, params: Partial<ParamsOf<K>>, guidePaneId: string) {
  const pane = existingPane(kind, guidePaneId);
  if (pane) {
    openContent(kind, params, { target: pane.id });
    return;
  }
  const { panes } = useWorkspaceStore.getState();
  const others = panes.filter((p) => p.id !== guidePaneId && p.kind !== "bible");
  const host = others[others.length - 1];
  if (host) {
    openContent(kind, params, { target: "new", from: host.id, asTab: true });
    return;
  }
  const bible = existingPane("bible", guidePaneId);
  openContent(kind, params, { target: "new", from: bible?.id ?? guidePaneId });
}

/** Turns the Bible pane on screen to `passage`, or opens one beside the
 * Guide. */
function openBible(passage: Passage, guidePaneId: string): void {
  const pos = { bookId: passage.book, chapter: passage.chapter, verse: passage.verse };
  const bible = existingPane("bible", guidePaneId);
  openPassage(pos, bible ? { target: bible.id } : { target: "new", from: guidePaneId });
}

function passageParams(passage: Passage) {
  return { bookId: passage.book, chapter: passage.chapter, verse: passage.verse ?? null };
}

export async function openStep(open: StepOpen, guidePaneId: string): Promise<void> {
  switch (open.pane) {
    case "bible":
      openBible(open.passage, guidePaneId);
      return;
    case "interlinear":
    case "crossrefs":
    case "confession-for-passage":
    case "citations":
    case "commentary":
    case "factbook-for-passage":
    case "timeline-for-passage": {
      openBible(open.passage, guidePaneId);
      openBeside(open.pane, passageParams(open.passage), guidePaneId);
      return;
    }
    case "westminster":
      openBeside(
        "westminster",
        { docCode: open.doc, sectionId: sectionId(open.doc, open.n, open.section), commentary: open.commentary ?? null },
        guidePaneId,
      );
      return;
    case "wordstudy":
      openBeside("wordstudy", { id: open.strongs }, guidePaneId);
      return;
    case "lexicon":
      openBeside("lexicon", { id: open.strongs }, guidePaneId);
      return;
    case "webster": {
      const found = await api.websterLookup(open.word).catch(() => null);
      const entry = found?.entries[0];
      openBeside("dictionary", { slug: null, work: "webster", webster: entry?.id ?? null }, guidePaneId);
      return;
    }
    case "psalter":
      openBeside("psalter", { psalm: open.psalm }, guidePaneId);
      return;
    case "search":
      openBeside("search", { query: open.query }, guidePaneId);
      return;
    case "book": {
      const resources = await api.listResources().catch(() => []);
      const want = open.title.toLowerCase();
      const book = resources.find((r) => r.title.toLowerCase() === want) ?? resources.find((r) => r.title.toLowerCase().includes(want));
      if (book) {
        openBeside("resource", { id: book.id, find: open.find ? { text: open.find, occurrence: 1 } : null }, guidePaneId);
        return;
      }
      // Not in this library (it needs a pack): the Standards commentary on
      // the same question ships with every install.
      const f = open.fallback;
      openBeside("westminster", { docCode: f.doc, sectionId: sectionId(f.doc, f.n), commentary: f.commentary }, guidePaneId);
      toast.info(`“${open.title}” isn’t in your library, so the commentary on this question is open instead. It comes with the Sojourner library packs.`);
      return;
    }
    default:
      openBeside(open.pane, {}, guidePaneId);
  }
}

/**
 * The panes a lesson is studied in, in place of the workspace on screen:
 *
 *   [ Guide | Bible | study pane     ]
 *   [       |       | Confessions    ]   (a third pane is a tab there)
 *
 * The Bible opens on the lesson's passage, and the study panes follow it in
 * link group A. The reader's own workspaces are untouched; the Workspaces
 * menu goes back to any of them.
 */
export function layOutLesson(lesson: Lesson, commentarySources: CommentarySource[] | undefined): void {
  const ws = lesson.workspace;
  const passage = passageParams(ws.passage);
  const panes: SavedPane[] = [
    { kind: "guide", params: { lessonId: lesson.id }, linkGroup: null },
    { kind: "bible", params: { ...passage, activeVerse: passage.verse }, linkGroup: "A" },
    ...ws.study.map((kind): SavedPane => ({ kind, params: passage, linkGroup: "A" })),
  ];
  if (ws.question != null) {
    panes.push({ kind: "westminster", params: { docCode: "wsc", sectionId: sectionId("wsc", ws.question) }, linkGroup: null });
  }
  // The right-hand column: the study panes and the Confessions, stacked
  // two high, any more as tabs in the lower slot.
  const right = panes.length - 2;
  const layout = right >= 2 ? "three-plus-one" : right === 1 ? "three" : "two";
  const widths = panes.map((p) => (p.kind === "guide" ? 560 : p.kind === "bible" ? 1000 : 460));
  applyWorkspace({ name: lesson.title, tree: indexTree(layout, widths), panes }, commentarySources, { keepPassage: false });

  // The Guide keeps the focus, so the student reads on from the lesson.
  const s = useWorkspaceStore.getState();
  const guide = s.panes.find((p) => p.kind === "guide");
  if (guide && findPane(s.panes, guide.id)) s.focusPane(guide.id);
}
