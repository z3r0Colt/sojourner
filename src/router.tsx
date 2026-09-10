import { createHashRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ReadingView } from "./features/reading/ReadingView";
import { CommentaryStandaloneView } from "./features/commentary/CommentaryStandaloneView";
import { NotesListView } from "./features/notes/NotesListView";
import { SettingsView } from "./features/settings/SettingsView";
import { LexiconView } from "./features/lexicon/LexiconView";
import { DictionaryView } from "./features/dictionary/DictionaryView";
import { WestminsterView } from "./features/westminster/WestminsterView";
import { ResourceLibraryView } from "./features/resources/ResourceLibraryView";
import { ResourceReaderView } from "./features/resources/ResourceReaderView";
import { SermonNotesView } from "./features/sermons/SermonNotesView";
import { PrayerView } from "./features/prayer/PrayerView";
import { MemoryView } from "./features/memory/MemoryView";
import { ReadingPlansView } from "./features/plans/ReadingPlansView";
import { HarmonyView } from "./features/harmony/HarmonyView";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <ReadingView /> },
      { path: "commentary/:sourceId", element: <CommentaryStandaloneView /> },
      { path: "commentary/:sourceId/:bookId", element: <CommentaryStandaloneView /> },
      { path: "commentary/:sourceId/:bookId/:sectionId", element: <CommentaryStandaloneView /> },
      { path: "notes", element: <NotesListView /> },
      { path: "sermons", element: <SermonNotesView /> },
      { path: "prayer", element: <PrayerView /> },
      { path: "memory", element: <MemoryView /> },
      { path: "plans", element: <ReadingPlansView /> },
      { path: "harmony", element: <HarmonyView /> },
      { path: "settings", element: <SettingsView /> },
      { path: "lexicon", element: <LexiconView /> },
      { path: "lexicon/:id", element: <LexiconView /> },
      { path: "dictionary", element: <DictionaryView /> },
      { path: "dictionary/:slug", element: <DictionaryView /> },
      { path: "westminster", element: <WestminsterView /> },
      { path: "westminster/:docCode", element: <WestminsterView /> },
      { path: "westminster/:docCode/:sectionId", element: <WestminsterView /> },
      { path: "resources", element: <ResourceLibraryView /> },
      { path: "resources/:id", element: <ResourceReaderView /> },
    ],
  },
]);
