import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, ChevronRight, CircleHelp, Ellipsis, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import { useDueCatechismMemory, useDueMemoryVerses } from "../api/queries";
import { useUiStore } from "../state/uiStore";
import { cx } from "../components/ui/classes";
import { parseRoute } from "../workspace/paneKinds";
import { openContent } from "../workspace/openContent";
import { useShownPages } from "../features/onboarding/usePurpose";
import { NAV_GROUPS, TODAY, type NavItem } from "./nav";

/** Ctrl+click or middle-click on a sidebar item opens it in a new pane;
 * a plain click goes through the router and lands in the focused pane. */
function openInNewPane(e: React.MouseEvent, to: string) {
  const [pathname, search] = to.split("?");
  const parsed = parseRoute(pathname, search ? `?${search}` : "");
  if (!parsed) return;
  e.preventDefault();
  openContent(parsed.kind, parsed.params as never, { target: "new" });
}

/** `on`: whether this is the page showing, where the route alone cannot say
 * (Help and Settings share one). */
function NavLink({ item, collapsed, onNavigate, on }: { item: NavItem; collapsed: boolean; onNavigate?: () => void; on?: boolean }) {
  const { pathname } = useLocation();
  const active = on !== undefined ? on : item.end
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
        onNavigate?.();
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

/** Whether `pathname` is one of this item's pages. */
function isOn(item: NavItem, pathname: string): boolean {
  return item.end ? pathname === item.to : pathname.startsWith(item.to);
}

/** `drawer`: on a phone, the sidebar slides over the page from a menu button
 * (see AppShell); it is always shown whole, and choosing a page closes it.
 *
 * The pages shown are the reader's (features/onboarding/purpose.ts): the
 * ones their purpose chose, or their own pick. The rest are under More, in
 * the same order, so nothing is ever out of reach. */
export function Sidebar({ drawer, onNavigate }: { drawer?: boolean; onNavigate?: () => void } = {}) {
  const storedCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const collapsed = !drawer && storedCollapsed;
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const memoryBadge = useMemoryDueBadge();
  const badges: Record<string, NavItem["badge"]> = { "/memory": memoryBadge };
  const shown = useShownPages();
  const { pathname, search } = useLocation();
  const onHelp = pathname.startsWith("/settings") && new URLSearchParams(search).get("section") === "tutorial";
  const [moreOpen, setMoreOpen] = useState(false);

  const withBadge = (item: NavItem) => (badges[item.to] ? { ...item, badge: badges[item.to] } : item);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => shown.has(i.to)) })).filter((g) => g.items.length > 0);
  const more = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !shown.has(i.to));
  // The page being read is never hidden: More opens itself around it.
  const moreShown = moreOpen || more.some((i) => isOn(i, pathname));
  const MoreIcon = collapsed ? Ellipsis : moreShown ? ChevronDown : ChevronRight;

  return (
    <nav
      aria-label="Main"
      className={cx(
        "flex h-full shrink-0 flex-col border-r border-line",
        drawer ? "bg-surface" : "bg-surface-2/60",
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
          <NavLink item={TODAY} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
        {groups.map((g) => (
          <div key={g.id} className={cx("flex flex-col gap-0.5", collapsed && "items-center")} data-tour={`sidebar-${g.id}`}>
            {!collapsed ? (
              <div className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-ink-4">{g.label}</div>
            ) : (
              <div className="mb-1 h-px w-6 bg-line" aria-hidden="true" />
            )}
            {g.items.map((item) => (
              <NavLink key={item.to} item={withBadge(item)} collapsed={collapsed} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
        {more.length > 0 && (
          <div className={cx("flex flex-col gap-0.5", collapsed && "items-center")}>
            {collapsed && <div className="mb-1 h-px w-6 bg-line" aria-hidden="true" />}
            <button
              type="button"
              onClick={() => setMoreOpen(!moreShown)}
              aria-expanded={moreShown}
              title={moreShown ? "Hide the other pages" : `${more.length} more pages: ${more.map((i) => i.label).join(", ")}`}
              aria-label={collapsed ? (moreShown ? "Hide the other pages" : "Show the other pages") : undefined}
              className={cx(
                "flex items-center gap-2.5 rounded-md text-sm text-ink-3 transition-colors hover:bg-hover hover:text-ink",
                collapsed ? "h-9 w-9 justify-center" : "h-8 px-2.5",
              )}
            >
              <MoreIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              {!collapsed && <span className="min-w-0 flex-1 truncate text-left">More</span>}
            </button>
            {moreShown && (
              <>
                {more.map((item) => (
                  <NavLink key={item.to} item={withBadge(item)} collapsed={collapsed} onNavigate={onNavigate} />
                ))}
                {!collapsed && (
                  <Link
                    to="/settings?section=preferences"
                    onClick={onNavigate}
                    className="mt-0.5 rounded-md px-2.5 py-1.5 text-xs text-ink-3 hover:bg-hover hover:text-ink"
                  >
                    Choose what shows here…
                  </Link>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className={cx("flex flex-col gap-0.5 border-t border-line py-2", collapsed && "items-center")}>
        {/* The one door to learning the app: the tour, the shortcuts and the
            tutorial are all on the page behind it (Settings → Help). */}
        <div data-tour="help" className={cx("flex flex-col", collapsed && "items-center")}>
          <NavLink item={{ to: "/settings?section=tutorial", label: "Help", icon: CircleHelp }} collapsed={collapsed} onNavigate={onNavigate} on={onHelp} />
        </div>
        <div data-tour="settings" className={cx("flex flex-col", collapsed && "items-center")}>
          <NavLink item={{ to: "/settings", label: "Settings", icon: Settings }} collapsed={collapsed} onNavigate={onNavigate} on={pathname.startsWith("/settings") && !onHelp} />
        </div>
        {!drawer && (
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
        )}
      </div>
    </nav>
  );
}
