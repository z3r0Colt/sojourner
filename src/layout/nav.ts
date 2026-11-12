import { BookA, BookMarked, BookOpen, Brain, CalendarCheck, CalendarRange, Columns3, GraduationCap, HeartHandshake, Highlighter, HouseHeart, Languages, Library, Lightbulb, ListMusic, MapPin, Mic, NotebookPen, ScrollText, Sunrise, Users, type LucideIcon } from "lucide-react";

/**
 * Every page the sidebar can offer, in the order it offers them. The
 * sidebar draws from this; `features/onboarding/purpose.ts` chooses which of
 * them a reader sees first, and Settings lets the reader choose for
 * themselves. A page added here is in "Everything" at once; give it a place
 * in a purpose there too if it belongs to one.
 */
export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** A small count after the label (a dot when the sidebar is collapsed);
   * hidden at zero. Memory shows what is due today (F2.7); the Today page
   * and prayer nudges can reuse it. */
  badge?: { count: number; title: string };
}

export interface NavGroup {
  /** Names the group for the tour (`data-tour="sidebar-<id>"`). */
  id: string;
  label: string;
  items: NavItem[];
}

/** The home screen, pinned above the groups: it is a dashboard over all of
 * them rather than a peer of any one. */
export const TODAY: NavItem = { to: "/today", label: "Today", icon: Sunrise };

/** Five groups, each answering "why is this here?" rather than "whose is
 * it?": the text itself, the books that answer "what is this word, this
 * person, this place?", works someone else wrote, work you wrote, and the
 * practices you keep daily. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "scripture",
    label: "Scripture",
    items: [
      { to: "/", label: "Bible", icon: BookOpen, end: true },
      { to: "/harmony", label: "Harmony", icon: Columns3 },
    ],
  },
  {
    id: "lookup",
    label: "Look up",
    items: [
      { to: "/lexicon", label: "Lexicon", icon: Languages },
      { to: "/dictionary", label: "Dictionary", icon: BookA },
      { to: "/encyclopedia", label: "Encyclopedia", icon: BookMarked },
      { to: "/factbook", label: "Factbook", icon: Users },
    ],
  },
  {
    id: "library",
    label: "Library",
    items: [
      { to: "/westminster", label: "Confessions", icon: ScrollText },
      { to: "/timeline", label: "Timeline", icon: CalendarRange },
      { to: "/atlas", label: "Atlas", icon: MapPin },
      { to: "/resources", label: "Books", icon: Library },
    ],
  },
  {
    id: "notebook",
    label: "Notebook",
    items: [
      { to: "/notes", label: "Notes", icon: NotebookPen },
      { to: "/highlights", label: "Highlights", icon: Highlighter },
      { to: "/sermons", label: "Sermons", icon: Mic },
      { to: "/illustrations", label: "Illustrations", icon: Lightbulb },
    ],
  },
  {
    id: "devotion",
    label: "Devotion",
    items: [
      { to: "/guide", label: "Guided study", icon: GraduationCap },
      { to: "/plans", label: "Reading plans", icon: CalendarCheck },
      { to: "/prayer", label: "Prayer", icon: HeartHandshake },
      { to: "/memory", label: "Memory", icon: Brain },
      { to: "/psalter", label: "Psalter", icon: ListMusic },
      { to: "/family", label: "Family worship", icon: HouseHeart },
    ],
  },
];

/** Every page's route: Today, then the groups in order. */
export const ALL_ROUTES: readonly string[] = [TODAY.to, ...NAV_GROUPS.flatMap((g) => g.items.map((i) => i.to))];
