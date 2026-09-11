import type { ReactNode } from "react";
import { NotesListView } from "../../features/notes/NotesListView";
import { HighlightsView } from "../../features/highlights/HighlightsView";
import { PrayerView } from "../../features/prayer/PrayerView";
import { MemoryHubView } from "../../features/memory/MemoryHubView";
import { ReadingPlansView } from "../../features/plans/ReadingPlansView";
import { HarmonyView } from "../../features/harmony/HarmonyView";
import { ResourceLibraryView } from "../../features/resources/ResourceLibraryView";

/** List-style pages scroll inside their pane; the shell's main area no
 * longer scrolls for them. */
function PageScroll({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}

export function NotesPane() {
  return (
    <PageScroll>
      <NotesListView />
    </PageScroll>
  );
}

export function HighlightsPane() {
  return (
    <PageScroll>
      <HighlightsView />
    </PageScroll>
  );
}

export function PrayerPane() {
  return (
    <PageScroll>
      <PrayerView />
    </PageScroll>
  );
}

export function MemoryPane() {
  return (
    <PageScroll>
      <MemoryHubView />
    </PageScroll>
  );
}

export function PlansPane() {
  return (
    <PageScroll>
      <ReadingPlansView />
    </PageScroll>
  );
}

export function HarmonyPane() {
  return (
    <PageScroll>
      <HarmonyView />
    </PageScroll>
  );
}

export function ResourcesPane() {
  return (
    <PageScroll>
      <ResourceLibraryView />
    </PageScroll>
  );
}
