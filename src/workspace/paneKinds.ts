import {
  BookA,
  BookMarked,
  BookOpen,
  BookOpenText,
  Brain,
  CalendarCheck,
  Columns3,
  HeartHandshake,
  Highlighter,
  Languages,
  Library,
  Lightbulb,
  Link2,
  MapPin,
  MessageSquareText,
  Mic,
  Music,
  NotebookPen,
  ScrollText,
  Settings,
  StickyNote,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import type {
  AtlasPlace,
  Book,
  CommentarySource,
  DictionaryEntrySummary,
  IsbeEntrySummary,
  Resource,
  Sermon,
  Translation,
  WestminsterDocument,
} from "../api/types";
import { bookName } from "../lib/passage";
import { PASSAGE_KINDS, type PaneContent, type PaneKind, type ParamsOf } from "../state/workspaceStore";

/**
 * The pane-kind registry: what each kind is called, how wide it opens, and
 * whether it follows a passage. Components live in `paneComponents.tsx` so
 * this module stays importable from anywhere (views, the store, the shell)
 * without a circular import through the views themselves.
 *
 * Routes: the URL mirrors the focused pane's content so deep links, the
 * sidebar, and the command palette keep working. `routeFor` renders a
 * pane's content as a path; `parseRoute` reads one back as a partial
 * content request that `openContent` completes with defaults.
 */

export interface TitleContext {
  books?: Book[];
  translations?: Translation[];
  commentarySources?: CommentarySource[];
  resources?: Resource[];
  westminsterDocs?: WestminsterDocument[];
  dictionaryIndex?: DictionaryEntrySummary[];
  isbeIndex?: IsbeEntrySummary[];
  atlasPlaces?: AtlasPlace[];
  sermons?: Sermon[];
}

export interface PaneKindMeta<K extends PaneKind = PaneKind> {
  kind: K;
  /** Menu label ("Commentary", "Cross references"). */
  label: string;
  icon: LucideIcon;
  /** Header title for a specific pane ("Romans 8 · KJV"). */
  title: (params: ParamsOf<K>, ctx: TitleContext) => string;
  /** Flex weight: 1000 is a full reading column, 420 a study column. */
  defaultWidth: number;
  acceptsPassage: boolean;
  /** Offered in the "Change content" menu and the Add pane strip. Hidden
   * kinds (a resource, a commentary book) are reached from their pages. */
  listed: boolean;
}

function passageTitle(prefix: string, params: { bookId: number; chapter: number; verse: number | null }, ctx: TitleContext) {
  return `${prefix} · ${bookName(ctx.books, params.bookId)} ${params.chapter}${params.verse ? `:${params.verse}` : ""}`;
}

type Registry = { [K in PaneKind]: PaneKindMeta<K> };

export const PANE_KINDS: Registry = {
  bible: {
    kind: "bible",
    label: "Bible",
    icon: BookOpen,
    title: (p, ctx) => {
      const code = ctx.translations?.find((t) => t.id === p.translationId)?.code;
      return `${bookName(ctx.books, p.bookId)} ${p.chapter}${code ? ` · ${code}` : ""}`;
    },
    defaultWidth: 1000,
    acceptsPassage: true,
    listed: true,
  },
  interlinear: {
    kind: "interlinear",
    label: "Interlinear",
    icon: Languages,
    title: (p, ctx) => `Interlinear · ${bookName(ctx.books, p.bookId)} ${p.chapter}`,
    defaultWidth: 900,
    acceptsPassage: true,
    listed: true,
  },
  commentary: {
    kind: "commentary",
    label: "Commentary",
    icon: MessageSquareText,
    title: (p, ctx) => {
      const source = ctx.commentarySources?.find((s) => s.id === p.sourceId) ?? ctx.commentarySources?.[0];
      return passageTitle(source?.author ?? source?.title ?? "Commentary", p, ctx);
    },
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  crossrefs: {
    kind: "crossrefs",
    label: "Cross references",
    icon: Link2,
    title: (p, ctx) => passageTitle("Cross refs", p, ctx),
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  "confession-for-passage": {
    kind: "confession-for-passage",
    label: "Confessions on this passage",
    icon: ScrollText,
    title: (p, ctx) => passageTitle("Confessions", p, ctx),
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  tunes: {
    kind: "tunes",
    label: "Psalm tunes",
    icon: Music,
    title: () => "Psalm tunes",
    defaultWidth: 420,
    acceptsPassage: false,
    listed: true,
  },
  metrical: {
    kind: "metrical",
    label: "Metrical Psalter",
    icon: Music,
    title: (p) => `Metrical · Psalm ${p.chapter}`,
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  mine: {
    kind: "mine",
    label: "Mine",
    icon: StickyNote,
    title: (p, ctx) => passageTitle("Mine", p, ctx),
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  westminster: {
    kind: "westminster",
    label: "Confessions",
    icon: ScrollText,
    title: (p, ctx) => ctx.westminsterDocs?.find((d) => d.code === p.docCode)?.title ?? "Confessions",
    defaultWidth: 900,
    acceptsPassage: false,
    listed: true,
  },
  lexicon: {
    kind: "lexicon",
    label: "Lexicon",
    icon: Languages,
    title: (p) => (p.id ? `Lexicon · ${p.id}` : "Lexicon"),
    defaultWidth: 900,
    acceptsPassage: false,
    listed: true,
  },
  dictionary: {
    kind: "dictionary",
    label: "Dictionary",
    icon: BookA,
    title: (p, ctx) => {
      const term = p.slug ? ctx.dictionaryIndex?.find((e) => e.slug === p.slug)?.term : undefined;
      return term ? `Dictionary · ${term}` : "Dictionary";
    },
    defaultWidth: 900,
    acceptsPassage: false,
    listed: true,
  },
  "encyclopedia-for-passage": {
    kind: "encyclopedia-for-passage",
    label: "Encyclopedia for passage",
    icon: BookMarked,
    title: (p, ctx) => passageTitle("Encyclopedia", { ...p, verse: p.verse }, ctx),
    defaultWidth: 420,
    acceptsPassage: true,
    listed: true,
  },
  encyclopedia: {
    kind: "encyclopedia",
    label: "Encyclopedia",
    icon: BookMarked,
    title: (p, ctx) => {
      const term = p.slug ? ctx.isbeIndex?.find((e) => e.slug === p.slug)?.term : undefined;
      return term ? `Encyclopedia · ${term}` : "Encyclopedia";
    },
    defaultWidth: 900,
    acceptsPassage: false,
    listed: true,
  },
  atlas: {
    kind: "atlas",
    label: "Atlas",
    icon: MapPin,
    title: (p, ctx) => {
      const place = p.slug ? ctx.atlasPlaces?.find((e) => e.slug === p.slug)?.name : undefined;
      return place ? `Atlas · ${place}` : "Atlas";
    },
    defaultWidth: 900,
    acceptsPassage: true,
    listed: true,
  },
  resource: {
    kind: "resource",
    label: "Resource",
    icon: BookOpenText,
    title: (p, ctx) => ctx.resources?.find((r) => r.id === p.id)?.title ?? "Resource",
    defaultWidth: 900,
    acceptsPassage: false,
    listed: false,
  },
  resources: {
    kind: "resources",
    label: "Resources",
    icon: Library,
    title: () => "Resources",
    defaultWidth: 900,
    acceptsPassage: false,
    listed: true,
  },
  "commentary-book": {
    kind: "commentary-book",
    label: "Commentary as a book",
    icon: BookOpenText,
    title: (p, ctx) => {
      const source = ctx.commentarySources?.find((s) => s.id === p.sourceId);
      const book = p.bookId != null ? bookName(ctx.books, p.bookId) : null;
      return [source?.author ?? source?.title ?? "Commentary", book].filter(Boolean).join(" · ");
    },
    defaultWidth: 900,
    acceptsPassage: false,
    listed: false,
  },
  today: { kind: "today", label: "Today", icon: Sunrise, title: () => "Today", defaultWidth: 900, acceptsPassage: false, listed: true },
  notes: { kind: "notes", label: "Notes", icon: NotebookPen, title: () => "Notes", defaultWidth: 900, acceptsPassage: false, listed: true },
  highlights: { kind: "highlights", label: "Highlights", icon: Highlighter, title: () => "Highlights", defaultWidth: 900, acceptsPassage: false, listed: true },
  prayer: { kind: "prayer", label: "Prayer", icon: HeartHandshake, title: () => "Prayer", defaultWidth: 900, acceptsPassage: false, listed: true },
  memory: { kind: "memory", label: "Memory", icon: Brain, title: () => "Memory", defaultWidth: 900, acceptsPassage: false, listed: true },
  plans: { kind: "plans", label: "Reading plans", icon: CalendarCheck, title: () => "Reading plans", defaultWidth: 900, acceptsPassage: false, listed: true },
  harmony: { kind: "harmony", label: "Harmony", icon: Columns3, title: () => "Harmony of the Gospels", defaultWidth: 900, acceptsPassage: false, listed: true },
  sermons: { kind: "sermons", label: "Sermons", icon: Mic, title: () => "Sermons", defaultWidth: 900, acceptsPassage: false, listed: true },
  // The title is the sermon's own; the pane fills it in through the title
  // context, which the manager keeps up to date as sermons are renamed.
  sermon: {
    kind: "sermon",
    label: "Sermon",
    icon: Mic,
    title: (p, ctx) => ctx.sermons?.find((s) => s.id === p.id)?.title || "Sermon",
    defaultWidth: 1000,
    acceptsPassage: false,
    listed: false,
  },
  illustrations: { kind: "illustrations", label: "Illustrations", icon: Lightbulb, title: () => "Illustrations", defaultWidth: 900, acceptsPassage: false, listed: true },
  settings: { kind: "settings", label: "Settings", icon: Settings, title: () => "Settings", defaultWidth: 900, acceptsPassage: false, listed: true },
};

export function paneMeta(kind: PaneKind): PaneKindMeta {
  return PANE_KINDS[kind] as PaneKindMeta;
}

export function paneTitle(content: PaneContent, ctx: TitleContext): string {
  // Each kind's title takes its own params; the union is narrowed by construction.
  return (PANE_KINDS[content.kind].title as (p: unknown, c: TitleContext) => string)(content.params, ctx);
}

/** The kinds offered wherever the reader picks content for a pane. */
export const PANE_KIND_LIST_LISTED: readonly PaneKind[] = (Object.keys(PANE_KINDS) as PaneKind[]).filter((k) => PANE_KINDS[k].listed);

/** The study-panel kinds, in the order the Add pane strip shows them. */
export const STUDY_STRIP_KINDS: readonly PaneKind[] = ["commentary", "crossrefs", "encyclopedia-for-passage", "confession-for-passage", "atlas", "metrical", "mine"];

export { PASSAGE_KINDS };

// ---------------------------------------------------------------------------
// Routes

/** A pane content request with whatever params the URL carried; the rest
 * are filled in by `openContent`. */
export type ContentRequest = { [K in PaneKind]: { kind: K; params: Partial<ParamsOf<K>> } }[PaneKind];

export function routeFor(content: PaneContent): string {
  switch (content.kind) {
    case "bible":
      return "/";
    case "interlinear":
      return "/interlinear";
    case "commentary":
      return "/study/commentary";
    case "crossrefs":
      return "/study/crossrefs";
    case "confession-for-passage":
      return "/study/confessions";
    case "encyclopedia-for-passage":
      return "/study/encyclopedia";
    case "metrical":
      return "/study/metrical";
    case "tunes":
      return "/study/tunes";
    case "mine":
      return "/study/mine";
    case "westminster":
      return content.params.docCode
        ? `/westminster/${content.params.docCode}${content.params.sectionId != null ? `/${content.params.sectionId}` : ""}`
        : "/westminster";
    case "lexicon":
      return content.params.id ? `/lexicon/${encodeURIComponent(content.params.id)}` : "/lexicon";
    case "dictionary":
      return content.params.slug ? `/dictionary/${encodeURIComponent(content.params.slug)}` : "/dictionary";
    case "encyclopedia":
      return content.params.slug ? `/encyclopedia/${encodeURIComponent(content.params.slug)}` : "/encyclopedia";
    case "atlas":
      if (content.params.journey) return `/atlas/journey/${encodeURIComponent(content.params.journey)}`;
      return content.params.slug ? `/atlas/${encodeURIComponent(content.params.slug)}` : "/atlas";
    case "resource":
      return `/resources/${content.params.id}`;
    case "resources":
      return "/resources";
    case "commentary-book": {
      const { sourceId, bookId, sectionId } = content.params;
      if (sourceId == null) return "/commentary";
      return `/commentary/${sourceId}${bookId != null ? `/${bookId}${sectionId != null ? `/${sectionId}` : ""}` : ""}`;
    }
    case "today":
      return "/today";
    case "notes":
      return "/notes";
    case "highlights":
      return "/highlights";
    case "prayer":
      return "/prayer";
    case "memory":
      return "/memory";
    case "plans":
      return "/plans";
    case "harmony":
      return "/harmony";
    case "sermons":
      return "/sermons";
    case "sermon":
      return `/sermons/${content.params.id}`;
    case "illustrations":
      return "/illustrations";
    case "illustrations":
      return "/illustrations";
    case "settings":
      return content.params.section ? `/settings?section=${encodeURIComponent(content.params.section)}` : "/settings";
  }
}

function num(s: string | undefined): number | null {
  if (s == null || s === "") return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

/** Reads a path (and optional query string) back as a content request.
 * Returns null for paths the app does not know. */
export function parseRoute(pathname: string, search = ""): ContentRequest | null {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const [head, a, b, c] = parts;
  if (parts.length === 0) return { kind: "bible", params: {} };
  switch (head) {
    case "interlinear":
      return { kind: "interlinear", params: {} };
    case "study":
      if (a === "commentary") return { kind: "commentary", params: {} };
      if (a === "crossrefs") return { kind: "crossrefs", params: {} };
      if (a === "confessions") return { kind: "confession-for-passage", params: {} };
      if (a === "encyclopedia") return { kind: "encyclopedia-for-passage", params: {} };
      if (a === "metrical") return { kind: "metrical", params: {} };
      if (a === "tunes") return { kind: "tunes", params: {} };
      if (a === "mine") return { kind: "mine", params: {} };
      return null;
    case "westminster":
      return { kind: "westminster", params: { docCode: a ?? null, sectionId: num(b) } };
    case "lexicon":
      return { kind: "lexicon", params: { id: a ?? null } };
    case "dictionary":
      return { kind: "dictionary", params: { slug: a ?? null } };
    case "encyclopedia":
      return { kind: "encyclopedia", params: { slug: a ?? null } };
    case "atlas":
      if (a === "journey") return { kind: "atlas", params: { journey: b ?? null, slug: null } };
      return { kind: "atlas", params: { slug: a ?? null, journey: null } };
    case "resources": {
      const id = num(a);
      return id != null ? { kind: "resource", params: { id } } : { kind: "resources", params: {} };
    }
    case "commentary":
      return { kind: "commentary-book", params: { sourceId: num(a), bookId: num(b), sectionId: num(c) } };
    case "today":
      return { kind: "today", params: {} };
    case "notes":
      return { kind: "notes", params: {} };
    case "highlights":
      return { kind: "highlights", params: {} };
    case "prayer":
      return { kind: "prayer", params: {} };
    case "memory":
      return { kind: "memory", params: {} };
    case "plans":
      return { kind: "plans", params: {} };
    case "harmony":
      return { kind: "harmony", params: {} };
    case "sermons": {
      const id = num(a);
      return id != null ? { kind: "sermon", params: { id } } : { kind: "sermons", params: {} };
    }
    case "illustrations":
      return { kind: "illustrations", params: {} };
    case "settings": {
      const section = new URLSearchParams(search).get("section");
      return { kind: "settings", params: { section } };
    }
    default:
      return null;
  }
}
