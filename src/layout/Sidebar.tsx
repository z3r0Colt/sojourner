import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  ScrollText,
  Languages,
  BookA,
  Columns3,
  NotebookPen,
  HeartHandshake,
  Highlighter,
  Brain,
  CalendarCheck,
  Library,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
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
}

/** Three groups, ordered by how a study session usually flows: read the
 * text, consult the study tools, then work in your own material. */
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Read", items: [{ to: "/", label: "Bible", icon: BookOpen, end: true }] },
  {
    label: "Study",
    items: [
      { to: "/westminster", label: "Confessions", icon: ScrollText },
      { to: "/lexicon", label: "Lexicon", icon: Languages },
      { to: "/dictionary", label: "Dictionary", icon: BookA },
      { to: "/harmony", label: "Harmony", icon: Columns3 },
    ],
  },
  {
    label: "My study",
    items: [
      { to: "/notes", label: "Notes", icon: NotebookPen },
      { to: "/highlights", label: "Highlights", icon: Highlighter },
      { to: "/prayer", label: "Prayer", icon: HeartHandshake },
      { to: "/memory", label: "Memory", icon: Brain },
      { to: "/plans", label: "Reading plans", icon: CalendarCheck },
      { to: "/resources", label: "Resources", icon: Library },
    ],
  },
];

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { pathname } = useLocation();
  const active = item.end
    ? pathname === item.to || ["/commentary", "/study", "/interlinear"].some((p) => pathname.startsWith(p))
    : pathname.startsWith(item.to);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      title={collapsed ? `${item.label} (Ctrl+click for a new pane)` : "Ctrl+click for a new pane"}
      aria-current={active ? "page" : undefined}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) openInNewPane(e, item.to);
      }}
      onAuxClick={(e) => {
        if (e.button === 1) openInNewPane(e, item.to);
      }}
      className={cx(
        "flex items-center gap-2.5 rounded-md text-sm transition-colors",
        collapsed ? "h-9 w-9 justify-center" : "h-8 px-2.5",
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

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
        title="Sojourner's Study Companion"
        className={cx("flex items-center gap-2 py-3 text-ink", collapsed ? "justify-center" : "px-1.5")}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-white">
          <BookOpen className="h-4 w-4" aria-hidden="true" />
        </span>
        {!collapsed && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">Sojourner's</span>
            <span className="block truncate text-xs text-ink-3">Study Companion</span>
          </span>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
        {GROUPS.map((g) => (
          <div key={g.label} className={cx("flex flex-col gap-0.5", collapsed && "items-center")}>
            {!collapsed ? (
              <div className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-4">{g.label}</div>
            ) : (
              <div className="mb-1 h-px w-6 bg-line" aria-hidden="true" />
            )}
            {g.items.map((item) => (
              <NavLink key={item.to} item={item} collapsed={collapsed} />
            ))}
          </div>
        ))}
      </div>

      <div className={cx("flex flex-col gap-0.5 border-t border-line py-2", collapsed && "items-center")}>
        <NavLink item={{ to: "/settings", label: "Settings", icon: Settings }} collapsed={collapsed} />
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
