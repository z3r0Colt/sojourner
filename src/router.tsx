import { createHashRouter } from "react-router-dom";
import { AppShell } from "./layout/AppShell";
import { ReadingView } from "./features/reading/ReadingView";
import { CommentaryStandaloneView } from "./features/commentary/CommentaryStandaloneView";
import { NotesListView } from "./features/notes/NotesListView";
import { LibrarySettingsView } from "./features/library/LibrarySettingsView";
import { LexiconView } from "./features/lexicon/LexiconView";
import { DictionaryView } from "./features/dictionary/DictionaryView";
import { WestminsterView } from "./features/westminster/WestminsterView";
import { ResourceLibraryView } from "./features/resources/ResourceLibraryView";
import { ResourceReaderView } from "./features/resources/ResourceReaderView";
import { SermonNotesView } from "./features/sermons/SermonNotesView";

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
      { path: "library", element: <LibrarySettingsView /> },
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
