import { onDesktop } from "../../lib/platform";
import { Bookmark, BookmarkCheck, ChevronDown, CircleHelp, Columns2, Languages, Maximize2, MessageSquareQuote, MoreHorizontal, Palette, Printer, SlidersHorizontal, Square, StickyNote, TextSearch, Type, Volume2 } from "lucide-react";
import { THEME_OPTIONS, useUiStore } from "../../state/uiStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { ChapterNav } from "./ChapterNav";
import { BookmarksMenu } from "./BookmarksMenu";
import { ReadAloudButton } from "../tts/ReadAloudButton";
import { useTtsStore } from "../../state/ttsStore";
import { Button, IconButton } from "../../components/ui/Button";
import { Popover, PopoverItem, PopoverLabel } from "../../components/ui/Popover";
import { checkboxClass, cx, selectSmClass } from "../../components/ui/classes";
import { openContent, openPassage } from "../../workspace/openContent";
import { PANE_KINDS, STUDY_STRIP_KINDS } from "../../workspace/paneKinds";
import { groupTranslations, translationOptionLabel, translationSelectFloor } from "./translationGroups";
import type { Book, Translation } from "../../api/types";
import type { BibleParams } from "../../state/workspaceStore";
import type { TtsSegment } from "../../state/ttsStore";

interface ReadingViewOptionsProps {
  paragraphMode: boolean;
  redLetterMode: boolean;
  colorTextMode: boolean | undefined;
  voiceMode: boolean | undefined;
  setParams: (patch: Partial<BibleParams>) => void;
  setPrinting: (printing: boolean) => void;
}

interface ReadingToolbarProps {
  paneId: string;
  /** What the pane shows: the chapter, the translation, and how. */
  params: BibleParams;
  setParams: (patch: Partial<BibleParams>) => void;
  books: Book[];
  book: Book;
  translations: Translation[] | undefined;
  currentTranslation: Translation | undefined;
  /** The toolbar's three widths, worked out from the pane's (see below). */
  compact: boolean;
  narrow: boolean;
  named: boolean;
  /** A phone: the study panes are in the menu, there being no strip. */
  phone: boolean;
  findOpen: boolean;
  openFind: () => void;
  openInterlinear: () => void;
  enterFocusMode: () => void;
  chapterNoteCount: number;
  setChapterNoteOpen: (open: boolean) => void;
  setColorGuideOpen: (open: boolean) => void;
  setTextModalOpen: (open: boolean) => void;
  setViewModalOpen: (open: boolean) => void;
  setPrinting: (printing: boolean) => void;
  /** Read aloud: whether this pane is being read, and its verses to read. */
  ttsHere: boolean;
  readAloudSegments: TtsSegment[];
  chapterBookmark: { id: number } | undefined;
  verseBookmark: { id: number } | undefined;
  toggleBookmark: (verse: number | undefined, existing: { id: number } | undefined) => void;
}

/** Text size, line spacing, font and theme: behind the toolbar's Text
 * button, and in a dialog of their own from a narrow pane's menu. The
 * settings are the whole app's (uiStore), so this takes nothing. */
export function ReadingTextSettings() {
  const { fontSize, setFontSize, lineSpacing, setLineSpacing, readingFont, setReadingFont, theme, setTheme } = useUiStore();
  return (
    <div className="space-y-3 p-1">
      <label className="block">
        <span className="mb-1 flex items-center justify-between text-xs font-medium text-ink-3">
          <span>Text size</span>
          <span>{fontSize}px</span>
        </span>
        <input type="range" min={14} max={30} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-accent" />
      </label>
      <div>
        <div className="mb-1 text-xs font-medium text-ink-3">Line spacing</div>
        <div className="flex gap-1">
          {(["compact", "normal", "relaxed"] as const).map((s) => (
            <Button key={s} size="sm" active={lineSpacing === s} onClick={() => setLineSpacing(s)} className="flex-1 capitalize">
              {s}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs font-medium text-ink-3">Font</div>
        <div className="flex gap-1">
          <Button size="sm" active={readingFont === "serif"} onClick={() => setReadingFont("serif")} className="flex-1 font-serif">
            Serif
          </Button>
          <Button size="sm" active={readingFont === "sans"} onClick={() => setReadingFont("sans")} className="flex-1">
            Sans-serif
          </Button>
          <Button size="sm" active={readingFont === "dyslexic"} onClick={() => setReadingFont("dyslexic")} className="flex-1" title="OpenDyslexic, a font shaped to keep letters from flipping or swapping">
            Dyslexia-friendly
          </Button>
        </div>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-3">Theme</span>
        <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} className={cx(selectSmClass, "w-full")}>
          {THEME_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** What the text shows: behind the toolbar's View button, and in a dialog
 * of its own from a narrow pane's menu. Paragraph mode, red letters, color
 * text and who's speaking belong to the pane; the rest to the whole app. */
export function ReadingViewOptions(props: ReadingViewOptionsProps) {
  const { paragraphMode, redLetterMode, colorTextMode, voiceMode, setParams, setPrinting } = props;
  const { showVerseNumbers, toggleVerseNumbers, showHighlights, toggleShowHighlights, showNoteSymbols, toggleShowNoteSymbols } = useUiStore();
  return (
    <>
      {[
        { label: "Paragraph mode", checked: paragraphMode, onChange: () => setParams({ paragraphMode: !paragraphMode }), hint: "Flowing prose instead of one verse per line" },
        { label: "Verse numbers", checked: showVerseNumbers, onChange: toggleVerseNumbers },
        { label: "Words of Jesus in red", checked: redLetterMode, onChange: () => setParams({ redLetterMode: !redLetterMode }) },
        {
          label: "Color text",
          checked: !!colorTextMode,
          onChange: () => setParams({ colorTextMode: !colorTextMode }),
          hint: "Who, what, where, when and how many, each in its own color",
        },
        {
          label: "Who's speaking",
          checked: !!voiceMode,
          onChange: () => setParams({ voiceMode: !voiceMode }),
          hint: "God's words in small capitals, Scripture quoted in italics",
        },
        { label: "Show highlights", checked: showHighlights, onChange: toggleShowHighlights },
        { label: "Show note markers", checked: showNoteSymbols, onChange: toggleShowNoteSymbols },
      ].map((opt) => (
        <label key={opt.label} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
          <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={opt.checked} onChange={opt.onChange} />
          <span>
            <span className="text-ink-2">{opt.label}</span>
            {opt.hint && <span className="block text-xs text-ink-3">{opt.hint}</span>}
          </span>
        </label>
      ))}
      {onDesktop && (
        <>
          <div className="my-1 h-px bg-line" aria-hidden="true" />
          <PopoverItem onClick={() => setPrinting(true)}>
            <Printer className="h-4 w-4 text-ink-3" aria-hidden="true" /> Print this chapter
          </PopoverItem>
        </>
      )}
    </>
  );
}

/** The Bible pane's toolbar: where in the Bible, which translation, and the
 * tools for the chapter. It holds no state of its own: everything it shows
 * and does is the pane's (ReadingPane), handed down.
 *
 * Its three widths (`compact`, `narrow`, `named`) are worked out by the pane
 * from its own width: TOOLBAR_COMPACT_BELOW_PX and its neighbours there. */
export function ReadingToolbar(props: ReadingToolbarProps) {
  const { paneId, params, setParams, books, book, translations, currentTranslation, compact, narrow, named, phone, findOpen, openFind, openInterlinear, enterFocusMode } = props;
  const { chapterNoteCount, setChapterNoteOpen, setColorGuideOpen, setTextModalOpen, setViewModalOpen, setPrinting, ttsHere, readAloudSegments, chapterBookmark, verseBookmark, toggleBookmark } = props;
  const { translationId, bookId, chapter, activeVerse, paragraphMode, redLetterMode, colorTextMode, colorHidden, voiceMode } = params;
  const colorTextMarks = useUiStore((s) => s.colorTextMarks);
  const setColorTextMarks = useUiStore((s) => s.setColorTextMarks);
  const textSettings = <ReadingTextSettings />;
  const viewOptions = <ReadingViewOptions paragraphMode={paragraphMode} redLetterMode={redLetterMode} colorTextMode={colorTextMode} voiceMode={voiceMode} setParams={setParams} setPrinting={setPrinting} />;

  // Color text, as prominent as the interlinear: one click turns it on, and
  // the menu beside it holds its companions and the guide to the colors.
  const colorTextOptions = (close: () => void) => (
    <>
      {[
        { label: "Color text", checked: !!colorTextMode, onChange: () => setParams({ colorTextMode: !colorTextMode }), hint: "Who, what, where, when and how many" },
        { label: "Who's speaking", checked: !!voiceMode, onChange: () => setParams({ voiceMode: !voiceMode }), hint: "God's words in small capitals, Scripture quoted in italics" },
        { label: "Underline each family", checked: colorTextMarks, onChange: () => setColorTextMarks(!colorTextMarks), hint: "To tell the colors apart without seeing them" },
      ].map((opt) => (
        <label key={opt.label} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
          <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={opt.checked} onChange={opt.onChange} />
          <span>
            <span className="text-ink-2">{opt.label}</span>
            <span className="block text-xs text-ink-3">{opt.hint}</span>
          </span>
        </label>
      ))}
      <div className="my-1 h-px bg-line" aria-hidden="true" />
      <PopoverItem
        onClick={() => {
          setColorGuideOpen(true);
          close();
        }}
      >
        <CircleHelp className="h-4 w-4 text-ink-3" aria-hidden="true" /> What the colors mean
      </PopoverItem>
    </>
  );
  const colorTextControl = (
    <div className="inline-flex items-center" data-tour="color-text">
      {narrow ? (
        <IconButton
          icon={Palette}
          label={colorTextMode ? "Color text: on. Click to turn it off" : "Color text: who, what, where, when and how many, each in its own color"}
          active={!!colorTextMode}
          onClick={() => setParams({ colorTextMode: !colorTextMode })}
        />
      ) : (
        <Button
          size="sm"
          variant="ghost"
          icon={Palette}
          active={!!colorTextMode}
          aria-pressed={!!colorTextMode}
          onClick={() => setParams({ colorTextMode: !colorTextMode })}
          title="Color text: who, what, where, when and how many, each in its own color"
        >
          Color text
        </Button>
      )}
      <Popover
        width="w-72"
        align="left"
        trigger={({ toggle, open }) => <IconButton icon={ChevronDown} size="sm" label="Color text options" active={open} onClick={toggle} />}
      >
        {(close) => colorTextOptions(close)}
      </Popover>
    </div>
  );

  const compareItems = (close: () => void) =>
    translations
      ?.filter((t) => t.id !== translationId)
      .map((t) => (
        <PopoverItem
          key={t.id}
          onClick={() => {
            openContent(
              "bible",
              { translationId: t.id, bookId, chapter, activeVerse, colorTextMode, colorHidden, voiceMode, redLetterMode },
              { target: "new", from: paneId, link: true },
            );
            close();
          }}
        >
          <span className="w-12 shrink-0 font-mono text-xs text-ink-3">{t.code}</span>
          <span className="truncate">{t.name}</span>
        </PopoverItem>
      ));

  // Everything right of the translation picker folds into one overflow menu
  // below TOOLBAR_COMPACT_BELOW_PX of pane width; between that and
  // TOOLBAR_NARROW_BELOW_PX the two labelled buttons drop their labels.
  //
  // Within a row, what gives way is the book dropdown: it starts from a
  // floor wide enough for a short name (the chapter controls' `basis`),
  // grows into the room the row has, up to a cap, and never pushes the
  // translation dropdown or the tools after it out of the pane. A native
  // dropdown is as wide as its longest option, and in a translation that
  // lacks some books every one of those reads "1 Thessalonians (not in this
  // translation)": a New Testament chapter switched to WLC made the book
  // dropdown 275px wide, and in a 490px pane the translation dropdown -- the
  // one the page's "Pick another translation in the toolbar" points to --
  // and the overflow menu were pushed out of the pane, with no way back.
  // Only in a pane too narrow for even the floor does the row wrap, the
  // translation and the menu going to a line of their own, rather than off
  // the edge.
  //
  // The translation dropdown gives way before the book does. It too is as
  // wide as its longest option ("WLC (OT)", "OEB (partial)"), and kept whole
  // it held 129px for "KJV" at 360px while the book beside it read "Psalm".
  // It now starts from a floor just wide enough for the translation chosen
  // (translationSelectFloor), and takes back its full width only from what
  // the book, which grows a hundred times as fast, leaves over.
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1">
      <div className="flex min-w-0 max-w-fit grow-[100] basis-[11.5rem] items-center [&>div]:min-w-0 [&_select[aria-label=Book]]:min-w-0 [&_select[aria-label=Book]]:max-w-[12rem]">
        <ChapterNav books={books} position={{ bookId, chapter }} translationId={translationId} onNavigate={(p) => openPassage(p, { target: paneId })} />
      </div>
      <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      {translations && (
        <select
          aria-label="Translation"
          className={cx(selectSmClass, "min-w-0 max-w-fit grow shrink")}
          style={translationSelectFloor(currentTranslation)}
          value={translationId ?? ""} onChange={(e) => setParams({ translationId: Number(e.target.value) })}>
          {groupTranslations(translations).map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.translations.map((t) => (
                <option key={t.id} value={t.id} title={t.scope ? `${t.name} (${t.scope})` : t.name}>
                  {translationOptionLabel(t)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {compact ? (
        <>
          <div className="min-w-0 flex-1" />
          <Popover
            width="w-64"
            trigger={({ toggle, open }) => <IconButton icon={MoreHorizontal} label="More reading tools" active={open} onClick={toggle} />}
          >
            {(close) => (
              <>
                <PopoverItem
                  onClick={() => {
                    openFind();
                    close();
                  }}
                >
                  <TextSearch className="h-4 w-4 text-ink-3" aria-hidden="true" /> Find in this chapter
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    openInterlinear();
                    close();
                  }}
                >
                  <Languages className="h-4 w-4 text-ink-3" aria-hidden="true" /> Interlinear in a new pane
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setParams({ colorTextMode: !colorTextMode });
                    close();
                  }}
                >
                  <Palette className="h-4 w-4 text-ink-3" aria-hidden="true" /> {colorTextMode ? "Turn off color text" : "Color text"}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setParams({ voiceMode: !voiceMode });
                    close();
                  }}
                >
                  <MessageSquareQuote className="h-4 w-4 text-ink-3" aria-hidden="true" /> {voiceMode ? "Turn off who's speaking" : "Who's speaking"}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setChapterNoteOpen(true);
                    close();
                  }}
                >
                  <StickyNote className="h-4 w-4 text-ink-3" aria-hidden="true" /> Chapter notes{chapterNoteCount > 0 ? ` (${chapterNoteCount})` : ""}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    if (ttsHere) useTtsStore.getState().stop();
                    else useTtsStore.getState().start(`${book.name} ${chapter}`, "scripture", readAloudSegments, { paneId });
                    close();
                  }}
                >
                  {ttsHere ? <Square className="h-4 w-4 text-ink-3" aria-hidden="true" /> : <Volume2 className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                  {ttsHere ? "Stop reading aloud" : "Read aloud"}
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    toggleBookmark(undefined, chapterBookmark);
                    close();
                  }}
                >
                  {chapterBookmark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <Bookmark className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                  {chapterBookmark ? "Remove bookmark for this chapter" : "Bookmark this chapter"}
                </PopoverItem>
                {activeVerse != null && (
                  <PopoverItem
                    onClick={() => {
                      toggleBookmark(activeVerse, verseBookmark);
                      close();
                    }}
                  >
                    {verseBookmark ? <BookmarkCheck className="h-4 w-4 text-accent" aria-hidden="true" /> : <Bookmark className="h-4 w-4 text-ink-3" aria-hidden="true" />}
                    {verseBookmark ? `Remove bookmark for verse ${activeVerse}` : `Bookmark verse ${activeVerse}`}
                  </PopoverItem>
                )}
                <PopoverItem
                  onClick={() => {
                    setTextModalOpen(true);
                    close();
                  }}
                >
                  <Type className="h-4 w-4 text-ink-3" aria-hidden="true" /> Text, font, and theme…
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    setViewModalOpen(true);
                    close();
                  }}
                >
                  <SlidersHorizontal className="h-4 w-4 text-ink-3" aria-hidden="true" /> View options…
                </PopoverItem>
                <PopoverItem
                  onClick={() => {
                    enterFocusMode();
                    close();
                  }}
                >
                  <Maximize2 className="h-4 w-4 text-ink-3" aria-hidden="true" /> Focus mode
                </PopoverItem>
                {phone && (
                  // A phone has no room for the strip of study panes beside
                  // the Bible: they are here instead, each opened as a page
                  // of its own that follows the chapter.
                  <>
                    <div className="my-1 h-px bg-line" aria-hidden="true" />
                    <PopoverLabel>Study this chapter</PopoverLabel>
                    {STUDY_STRIP_KINDS.filter((k) => k !== "metrical" || book.id === 19).map((kind) => {
                      const meta = PANE_KINDS[kind];
                      const KindIcon = meta.icon;
                      return (
                        <PopoverItem
                          key={kind}
                          onClick={() => {
                            close();
                            const s = useWorkspaceStore.getState();
                            const open = s.panes.find((p) => p.kind === kind);
                            if (open) s.focusPane(open.id);
                            else openContent(kind, {}, { target: "new", from: paneId });
                          }}
                        >
                          <KindIcon className="h-4 w-4 text-ink-3" aria-hidden="true" /> {meta.label}
                        </PopoverItem>
                      );
                    })}
                  </>
                )}
                {translations && translations.length > 1 && (
                  <>
                    <div className="my-1 h-px bg-line" aria-hidden="true" />
                    <PopoverLabel>Compare in a new pane</PopoverLabel>
                    <div className="max-h-40 overflow-y-auto">{compareItems(close)}</div>
                  </>
                )}
              </>
            )}
          </Popover>
        </>
      ) : (
        <>
          {translations && (
            <Popover
              width="w-64"
              align="left"
              trigger={({ toggle, open }) =>
                narrow ? (
                  <IconButton icon={Columns2} label="Compare: open this chapter in another translation beside this one" active={open} onClick={toggle} />
                ) : (
                  <Button size="sm" variant="ghost" icon={Columns2} active={open} onClick={toggle} title="Open this chapter in another translation beside this one">
                    Compare
                  </Button>
                )
              }
            >
              {(close) => (
                <>
                  <PopoverLabel>Compare in a new pane</PopoverLabel>
                  <div className="max-h-64 overflow-y-auto">{compareItems(close)}</div>
                </>
              )}
            </Popover>
          )}
          {narrow ? (
            <IconButton icon={Languages} label="Interlinear: Hebrew/Greek with Strong's numbers, in a pane beside this one" onClick={openInterlinear} />
          ) : (
            <Button size="sm" variant="ghost" icon={Languages} onClick={openInterlinear} title="Interlinear: Hebrew/Greek with Strong's numbers, in a pane beside this one">
              Interlinear
            </Button>
          )}
          {colorTextControl}
          <div className="min-w-0 flex-1" />
          {named ? (
            <>
              <Button size="sm" variant="ghost" icon={TextSearch} active={findOpen} onClick={openFind} title="Find in this chapter (Ctrl+G)">
                Find
              </Button>
              <Button size="sm" variant="ghost" icon={StickyNote} onClick={() => setChapterNoteOpen(true)} title="Chapter notes">
                Notes{chapterNoteCount > 0 ? ` (${chapterNoteCount})` : ""}
              </Button>
              <ReadAloudButton title={`${book.name} ${chapter}`} sourceKind="scripture" size="sm" segments={readAloudSegments} />
              <BookmarksMenu bookId={book.id} chapter={chapter} activeVerse={activeVerse} named />
              <Popover
                width="w-72"
                trigger={({ toggle, open }) => (
                  <Button size="sm" variant="ghost" icon={Type} active={open} onClick={toggle} title="Text size, spacing, font, and theme">
                    Text
                  </Button>
                )}
              >
                {textSettings}
              </Popover>
              <Popover
                width="w-64"
                trigger={({ toggle, open }) => (
                  <Button size="sm" variant="ghost" icon={SlidersHorizontal} active={open} onClick={toggle} title="View options">
                    View
                  </Button>
                )}
              >
                {viewOptions}
              </Popover>
              <Button size="sm" variant="ghost" icon={Maximize2} onClick={enterFocusMode} title="Focus mode: just the text (F11)">
                Focus
              </Button>
            </>
          ) : (
            <>
              <IconButton icon={TextSearch} label="Find in this chapter (Ctrl+G)" active={findOpen} onClick={openFind} />
              <div className="relative">
                <IconButton icon={StickyNote} label={chapterNoteCount > 0 ? `Chapter notes (${chapterNoteCount})` : "Chapter notes"} onClick={() => setChapterNoteOpen(true)} />
                {chapterNoteCount > 0 && (
                  <span className="pointer-events-none absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">
                    {chapterNoteCount}
                  </span>
                )}
              </div>
              <ReadAloudButton title={`${book.name} ${chapter}`} sourceKind="scripture" iconOnly size="md" segments={readAloudSegments} />
              <BookmarksMenu bookId={book.id} chapter={chapter} activeVerse={activeVerse} />
              <Popover width="w-72" trigger={({ toggle, open }) => <IconButton icon={Type} label="Text size, spacing, font, and theme" active={open} onClick={toggle} />}>
                {textSettings}
              </Popover>
              <Popover width="w-64" trigger={({ toggle, open }) => <IconButton icon={SlidersHorizontal} label="View options" active={open} onClick={toggle} />}>
                {viewOptions}
              </Popover>
              <IconButton icon={Maximize2} label="Focus mode: just the text (F11)" onClick={enterFocusMode} />
            </>
          )}
        </>
      )}
    </div>
  );
}
