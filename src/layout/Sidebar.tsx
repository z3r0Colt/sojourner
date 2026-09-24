import { Link, useLocation } from "react-router-dom";
import { BookA, BookMarked, BookOpen, Brain, CalendarCheck, Columns3, HeartHandshake, Highlighter, Languages, Library, Lightbulb, MapPin, Mic, NotebookPen, PanelLeftClose, PanelLeftOpen, ScrollText, Settings, Sunrise, Users, type LucideIcon } from "lucide-react";
import { useDueCatechismMemory, useDueMemoryVerses } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { cx } from "../components/ui/classes";
import { parseRoute } from "../workspace/paneKinds";
import { openContent } from "../workspace/openContent";

/** Ctrl+click or middle-click on a sidebar item opens it in a new pane;
 * a plain click goes through the router and lands in the focused pane. */
function openInNewPane(e: React.MouseEvent, to: string) {
  const [pathname, search] = to.split("?");
  const parsed = parseRoute(pathname, search ? `?${search}` : "");
  if (!parsed) return;
  e.preventDefault();
  openContent(parsed.kind, parsed.params as never, { target: "new" });
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** A small count after the label (a dot when the sidebar is collapsed);
   * hidden at zero. Memory shows what is due today (F2.7); the Today page
   * and prayer nudges can reuse it. */
  badge?: { count: number; title: string };
}

/** The home screen, pinned above the groups: it is a dashboard over all of
 * them rather than a peer of any one. */
const TODAY: NavItem = { to: "/today", label: "Today", icon: Sunrise };

/** Four groups, each answering "why is this here?" rather than "whose is it?":
 * the text itself, works someone else wrote, work you wrote, and the practices
 * you keep daily. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Scripture",
    items: [
      { to: "/", label: "Bible", icon: BookOpen, end: true },
      { to: "/harmony", label: "Harmony", icon: Columns3 },
    ],
  },
  {
    label: "Library",
    items: [
      { to: "/westminster", label: "Confessions", icon: ScrollText },
      { to: "/lexicon", label: "Lexicon", icon: Languages },
      { to: "/dictionary", label: "Dictionary", icon: BookA },
      { to: "/encyclopedia", label: "Encyclopedia", icon: BookMarked },
      { to: "/factbook", label: "Factbook", icon: Users },
      { to: "/atlas", label: "Atlas", icon: MapPin },
      { to: "/resources", label: "Resources", icon: Library },
    ],
  },
  {
    label: "Notebook",
    items: [
      { to: "/notes", label: "Notes", icon: NotebookPen },
      { to: "/highlights", label: "Highlights", icon: Highlighter },
      { to: "/sermons", label: "Sermons", icon: Mic },
      { to: "/illustrations", label: "Illustrations", icon: Lightbulb },
    ],
  },
  {
    label: "Devotion",
    items: [
      { to: "/plans", label: "Reading plans", icon: CalendarCheck },
      { to: "/prayer", label: "Prayer", icon: HeartHandshake },
      { to: "/memory", label: "Memory", icon: Brain },
    ],
  },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = item.end
    ? pathname === item.to || ["/commentary", "/study", "/interlinear"].some((p) => pathname.startsWith(p))
    : pathname.startsWith(item.to);
  const Icon = item.icon;
  const badge = item.badge && item.badge.count > 0 ? item.badge : null;
  const hint = collapsed ? `${item.label} (Ctrl+click for a new pane)` : "Ctrl+click for a new pane";
  return (
    <Link
      to={item.to}
      title={badge ? `${badge.title}. ${hint}` : hint}
      aria-current={active ? "page" : undefined}
      aria-label={badge ? `${item.label}, ${badge.title}` : undefined}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) openInNewPane(e, item.to);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) openInNewPane(e, item.to);
      }}
      className={cx(
        "flex items-center gap-2.5 rounded-md text-sm transition-colors",
        collapsed ? "relative h-9 w-9 justify-center" : "h-8 px-2.5",
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
      {badge && !collapsed && (
        <span aria-hidden="true" className="ml-auto shrink-0 rounded-full bg-warn-soft px-1.5 text-xs font-semibold tabular-nums text-warn">
          {badge.count}
        </span>
      )}
      {badge && collapsed && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-warn ring-2 ring-surface-2" />}
    </Link>
  );
}

/** Verses plus catechism questions due for review today (F2.7). */
function useMemoryDueBadge(): NavItem["badge"] {
  const { data: dueVerses } = useDueMemoryVerses();
  const { data: dueCatechism } = useDueCatechismMemory();
  const count = (dueVerses?.length ?? 0) + (dueCatechism?.length ?? 0);
  return { count, title: `${count} due for review today` };
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const memoryBadge = useMemoryDueBadge();
  const badges: Record<string, NavItem["badge"]> = { "/memory": memoryBadge };

  return (
    <nav
      aria-label="Main"
      className={cx(
        "flex h-full shrink-0 flex-col border-r border-line bg-surface-2/60",
        collapsed ? "w-14 items-center px-2" : "w-52 px-2.5",
      )}
    >
      <Link
        to="/"
        title="Sojourner — Bible Study Companion"
        className={cx("flex items-center gap-2 py-3 text-ink", collapsed ? "justify-center" : "px-1.5")}
      >
        {/* The logo itself rather than a stand-in glyph (`.brand-mark` in
            styles.css picks the drawing this theme can show). Decorative: the
            name beside it says the same thing, and the link's `title` covers
            the collapsed rail. */}
        <span className="brand-mark h-7 w-7 shrink-0" aria-hidden="true" />
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">Sojourner</span>
            <span className="block truncate text-xs text-ink-3">Bible Study Companion</span>
          </span>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
        <div className={cx("flex flex-col", collapsed && "items-center")}>
          <NavLink item={TODAY} collapsed={collapsed} />
        </div>
        {GROUPS.map((g) => (
          <div key={g.label} className={cx("flex flex-col gap-0.5", collapsed && "items-center")} data-tour={`sidebar-${g.label.toLowerCase()}`}>
            {!collapsed ? (
              <div className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-4">{g.label}</div>
            ) : (
              <div className="mb-1 h-px w-6 bg-line" aria-hidden="true" />
            )}
            {g.items.map((item) => (
              <NavLink key={item.to} item={badges[item.to] ? { ...item, badge: badges[item.to] } : item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </div>

      <div className={cx("flex flex-col gap-0.5 border-t border-line py-2", collapsed && "items-center")}>
        <div data-tour="settings" className={cx("flex flex-col", collapsed && "items-center")}>
          <NavLink item={{ to: "/settings", label: "Settings", icon: Settings }} collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cx(
            "flex items-center gap-2.5 rounded-md text-sm text-ink-3 hover:bg-hover hover:text-ink",
            collapsed ? "h-9 w-9 justify-center" : "h-8 px-2.5",
          )}
        >
          <ToggleIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
