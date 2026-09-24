import type { ComponentType } from "react";
import type { PaneKind } from "../state/workspaceStore";
import { TuneIndexPanel } from "../features/psalter/TuneIndexPanel";
import { ReadingPane } from "../features/reading/ReadingPane";
import { WestminsterView } from "../features/westminster/WestminsterView";
import { LexiconView } from "../features/lexicon/LexiconView";
import { DictionaryView } from "../features/dictionary/DictionaryView";
import { EncyclopediaView } from "../features/encyclopedia/EncyclopediaView";
import { AtlasView } from "../features/atlas/AtlasView";
import { ResourceReaderView } from "../features/resources/ResourceReaderView";
import { CommentaryStandaloneView } from "../features/commentary/CommentaryStandaloneView";
import { SettingsView } from "../features/settings/SettingsView";
import { SermonsView } from "../features/sermons/SermonsView";
import { SermonPane } from "../features/sermons/SermonPane";
import { IllustrationsView } from "../features/sermons/IllustrationsView";
import { SearchPane } from "../features/search/SearchPane";
import { WordStudyView } from "../features/lexicon/WordStudyView";
import { FactbookView } from "../features/factbook/FactbookView";
import { CommentaryPane, ConfessionPane, CrossRefsPane, EncyclopediaForPassagePane, FactbookForPassagePane, CitationsPane, InterlinearPane, MetricalPane, MinePane } from "./panes/StudyPanes";
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
  "encyclopedia-for-passage": EncyclopediaForPassagePane,
  metrical: MetricalPane,
  tunes: TuneIndexPanel,
  mine: MinePane,
  westminster: WestminsterView,
  lexicon: LexiconView,
  dictionary: DictionaryView,
  encyclopedia: EncyclopediaView,
  atlas: AtlasView,
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
  illustrations: IllustrationsView,
  search: SearchPane,
  wordstudy: WordStudyView,
  factbook: FactbookView,
  "factbook-for-passage": FactbookForPassagePane,
  citations: CitationsPane,
  settings: SettingsView,
};
