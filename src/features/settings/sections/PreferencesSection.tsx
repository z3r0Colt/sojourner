import { useUiStore } from "../../../state/uiStore";

export function PreferencesSection() {
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    showVerseNumbers,
    toggleVerseNumbers,
    showHighlights,
    toggleShowHighlights,
    showNoteSymbols,
    toggleShowNoteSymbols,
    showMorphology,
    toggleShowMorphology,
    redLetterMode,
    toggleRedLetterMode,
    paragraphMode,
    toggleParagraphMode,
  } = useUiStore();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Reading Preferences</h1>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="w-28">Theme</span>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as typeof theme)}
            className="rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="oled">True Black (OLED)</option>
            <option value="sepia">Sepia</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-28">Font size</span>
          <input type="range" min={14} max={28} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
          <span className="text-gray-400">{fontSize}px</span>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showVerseNumbers} onChange={toggleVerseNumbers} />
          Show verse numbers
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showHighlights} onChange={toggleShowHighlights} />
          Show highlights
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showNoteSymbols} onChange={toggleShowNoteSymbols} />
          Show note symbols
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showMorphology} onChange={toggleShowMorphology} />
          Show morphological codes (interlinear)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={redLetterMode} onChange={toggleRedLetterMode} />
          Red-letter (words of Jesus)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={paragraphMode} onChange={toggleParagraphMode} />
          Paragraph mode (flowing text instead of one verse per line)
        </label>
      </div>
    </div>
  );
}
