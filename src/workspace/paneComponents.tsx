import type { ComponentType } from "react";
import type { PaneKind } from "../state/workspaceStore";
import { ReadingPane } from "../features/reading/ReadingPane";
import { WestminsterView } from "../features/westminster/WestminsterView";
import { LexiconView } from "../features/lexicon/LexiconView";
import { DictionaryView } from "../features/dictionary/DictionaryView";
import { ResourceReaderView } from "../features/resources/ResourceReaderView";
import { CommentaryStandaloneView } from "../features/commentary/CommentaryStandaloneView";
import { SettingsView } from "../features/settings/SettingsView";
import { SermonsView } from "../features/sermons/SermonsView";
import { SermonPane } from "../features/sermons/SermonPane";
import { CommentaryPane, ConfessionPane, CrossRefsPane, InterlinearPane, MetricalPane, MinePane } from "./panes/StudyPanes";
import { HarmonyPane, HighlightsPane, MemoryPane, NotesPane, PlansPane, PrayerPane, ResourcesPane, TodayPane } from "./panes/PagePanes";

/** Kind → the component that renders it. Each reads its params from the
 * pane (see `usePaneParams`), never from the URL. Kept apart from the
 * metadata registry so views can import `paneKinds` and `openContent`
 * without a circular import back through themselves. */
export const PANE_COMPONENTS: Record<PaneKind, ComponentType> = {
  bible: ReadingPane,
  interlinear: InterlinearPane,
  commentary: CommentaryPane,
  crossrefs: CrossRefsPane,
  "confession-for-passage": ConfessionPane,
  metrical: MetricalPane,
  mine: MinePane,
  westminster: WestminsterView,
  lexicon: LexiconView,
  dictionary: DictionaryView,
  resource: ResourceReaderView,
  resources: ResourcesPane,
  "commentary-book": CommentaryStandaloneView,
  today: TodayPane,
  notes: NotesPane,
  highlights: HighlightsPane,
  prayer: PrayerPane,
  memory: MemoryPane,
  plans: PlansPane,
  harmony: HarmonyPane,
  sermons: SermonsView,
  sermon: SermonPane,
  settings: SettingsView,
};
