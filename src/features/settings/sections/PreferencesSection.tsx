import { useReadingTypography, useUiStore } from "../../../state/uiStore";
import { resolveBiblePane, useWorkspaceStore } from "../../../state/workspaceStore";
import { Button } from "../../../components/ui/Button";
import { checkboxClass, cx, selectClass } from "../../../components/ui/classes";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-40 shrink-0 pt-1">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint && <div className="text-xs text-ink-3">{hint}</div>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <label className={cx("flex items-start gap-3 py-2", disabled ? "opacity-50" : "cursor-pointer")}>
      <input type="checkbox" className={cx(checkboxClass, "mt-0.5")} checked={checked} onChange={onChange} disabled={disabled} />
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </label>
  );
}

export function PreferencesSection() {
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    lineSpacing,
    setLineSpacing,
    readingFont,
    setReadingFont,
    showVerseNumbers,
    toggleVerseNumbers,
    showHighlights,
    toggleShowHighlights,
    showNoteSymbols,
    toggleShowNoteSymbols,
    showMorphology,
    toggleShowMorphology,
  } = useUiStore();
  const typography = useReadingTypography();

  // Paragraph mode and red letters belong to each Bible pane; these
  // switches change the pane the reader is working in.
  const bible = useWorkspaceStore((s) => resolveBiblePane(s));
  const setPaneParams = useWorkspaceStore((s) => s.setPaneParams);
  const paragraphMode = bible?.params.paragraphMode ?? false;
  const redLetterMode = bible?.params.redLetterMode ?? false;
  const noBible = !bible;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Reading</h2>
      <p className="mb-4 text-sm text-ink-3">These apply to the Bible, commentary, confessions, and dictionary text alike. The same controls sit behind the Aa button while reading.</p>

      <div className="divide-y divide-line">
        <Row label="Theme">
          <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} className={selectClass}>
            <option value="system">Match Windows</option>
            <option value="light">Light</option>
            <option value="sepia">Sepia</option>
            <option value="dark">Dark</option>
            <option value="oled">True black (OLED)</option>
          </select>
        </Row>
        <Row label="Text size" hint={`${fontSize}px`}>
          <input type="range" min={14} max={30} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-64 accent-accent" />
        </Row>
        <Row label="Line spacing">
          <div className="flex w-64 gap-1">
            {(["compact", "normal", "relaxed"] as const).map((s) => (
              <Button key={s} size="sm" active={lineSpacing === s} onClick={() => setLineSpacing(s)} className="flex-1 capitalize">
                {s}
              </Button>
            ))}
          </div>
        </Row>
        <Row label="Font">
          <div className="flex w-64 gap-1">
            <Button size="sm" active={readingFont === "serif"} onClick={() => setReadingFont("serif")} className="flex-1 font-serif">
              Serif
            </Button>
            <Button size="sm" active={readingFont === "sans"} onClick={() => setReadingFont("sans")} className="flex-1">
              Sans-serif
            </Button>
          </div>
        </Row>
        <Row label="Preview">
          <p className="reading-font max-w-[60ch] rounded-lg border border-line bg-surface p-4 text-ink" style={typography}>
            <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">16</sup>
            For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.
          </p>
        </Row>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Bible text</h2>
      <p className="mb-2 text-sm text-ink-3">
        Paragraph mode and red letters belong to each Bible pane, so a second pane can show the same chapter differently. These two switches change the pane you are reading in
        {noBible ? " (open a Bible pane to use them)" : ""}.
      </p>
      <div className="divide-y divide-line">
        <Toggle
          label="Paragraph mode"
          hint="Flowing prose instead of one verse per line"
          checked={paragraphMode}
          disabled={noBible}
          onChange={() => bible && setPaneParams(bible.id, "bible", { paragraphMode: !paragraphMode })}
        />
        <Toggle label="Show verse numbers" checked={showVerseNumbers} onChange={toggleVerseNumbers} />
        <Toggle
          label="Words of Jesus in red"
          hint="Only his quoted words, not the whole verse"
          checked={redLetterMode}
          disabled={noBible}
          onChange={() => bible && setPaneParams(bible.id, "bible", { redLetterMode: !redLetterMode })}
        />
        <Toggle label="Show highlights" checked={showHighlights} onChange={toggleShowHighlights} />
        <Toggle label="Show note markers" checked={showNoteSymbols} onChange={toggleShowNoteSymbols} />
        <Toggle label="Show grammar codes in interlinear view" checked={showMorphology} onChange={toggleShowMorphology} />
      </div>
    </div>
  );
}
