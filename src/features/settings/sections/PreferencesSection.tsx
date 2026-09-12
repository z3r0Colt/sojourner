import { useEffect, useState } from "react";
import { READING_FONT_OPTIONS, THEME_OPTIONS, useReadingTypography, useUiStore, type AccentSource } from "../../../state/uiStore";
import { resolveBiblePane, useWorkspaceStore } from "../../../state/workspaceStore";
import { Button } from "../../../components/ui/Button";
import { toast } from "../../../components/ui/toast";
import { checkboxClass, cx, inputSmClass, selectClass } from "../../../components/ui/classes";
import { DEFAULT_HIGHLIGHT_LABELS, HIGHLIGHT_COLORS, useHighlightLabels, type HighlightColorKey } from "../../reading/highlightColors";
import { COPY_FORMATS, copyReference, formatPassage } from "../../../lib/clipboard";
import { NoteTemplatesEditor } from "../../notes/NoteTemplatesEditor";
import { useLandingPage, type LandingPage } from "../../today/landing";

const COPY_EXAMPLE_TEXT = "For God so loved the world, that he gave his only begotten Son…";

/** The four copy layouts as a radio group, each shown as the example it
 * would produce for John 3:16. */
function CopyFormatRow() {
  const copyFormat = useUiStore((s) => s.copyFormat);
  const setCopyFormat = useUiStore((s) => s.setCopyFormat);
  const includeTranslation = useUiStore((s) => s.copyIncludeTranslation);
  const setIncludeTranslation = useUiStore((s) => s.setCopyIncludeTranslation);
  const ref = copyReference("John 3:16", includeTranslation ? "KJV" : null);
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Copy format" className="space-y-1">
        {COPY_FORMATS.map((f) => (
          <label
            key={f.value}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
              copyFormat === f.value ? "border-accent/40 bg-accent-soft" : "border-line hover:bg-hover",
            )}
          >
            <input type="radio" name="copy-format" value={f.value} checked={copyFormat === f.value} onChange={() => setCopyFormat(f.value)} className="mt-1 accent-accent" />
            <span className="min-w-0">
              <span className="block text-sm text-ink">{f.label}</span>
              <span className="mt-0.5 block whitespace-pre-wrap font-mono text-xs text-ink-3">{formatPassage(COPY_EXAMPLE_TEXT, ref, f.value)}</span>
            </span>
          </label>
        ))}
      </div>
      <Toggle label="Include translation" hint="Adds the translation code after the reference, e.g. John 3:16 KJV" checked={includeTranslation} onChange={() => setIncludeTranslation(!includeTranslation)} />
    </div>
  );
}

/** One label box per highlight color. Edits commit on blur or Enter (not
 * per keystroke, so the toast fires once per change); Escape restores. */
function HighlightLabelsRow() {
  const [labels, patchLabels] = useHighlightLabels();
  const [draft, setDraft] = useState(labels);
  useEffect(() => setDraft(labels), [labels]);
  const customized = HIGHLIGHT_COLORS.some((c) => labels[c.key] !== DEFAULT_HIGHLIGHT_LABELS[c.key]);

  function commit(key: HighlightColorKey) {
    const next = draft[key].trim();
    if (next === labels[key]) return;
    patchLabels({ [key]: next });
    toast.success("Highlight labels saved");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {HIGHLIGHT_COLORS.map((c) => (
          <label key={c.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: c.color }} />
            <input
              type="text"
              value={draft[c.key]}
              placeholder={DEFAULT_HIGHLIGHT_LABELS[c.key]}
              aria-label={`Label for ${c.name.toLowerCase()} highlights`}
              maxLength={24}
              onChange={(e) => setDraft((d) => ({ ...d, [c.key]: e.target.value }))}
              onBlur={() => commit(c.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit(c.key);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraft((d) => ({ ...d, [c.key]: labels[c.key] }));
                }
              }}
              className={cx(inputSmClass, "w-28")}
            />
          </label>
        ))}
      </div>
      {customized && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            patchLabels(DEFAULT_HIGHLIGHT_LABELS);
            toast.success("Highlight labels reset");
          }}
        >
          Reset to defaults
        </Button>
      )}
    </div>
  );
}

/** "Open on": the Bible (default) or the Today page at launch (F3.1). */
function LandingRow() {
  const [landing, setLanding] = useLandingPage();
  return (
    <select
      value={landing}
      onChange={(e) => {
        const next = e.target.value as LandingPage;
        setLanding(next);
        toast.success(next === "today" ? "The app will open on Today" : "The app will open on the Bible");
      }}
      className={selectClass}
      aria-label="Open on"
    >
      <option value="bible">Bible</option>
      <option value="today">Today</option>
    </select>
  );
}

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
    reduceMotion,
    setReduceMotion,
    accentSource,
    setAccentSource,
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
        <Row label="Open on" hint="What the app shows when it starts. Today gathers where you left off, today's plan, and what is due.">
          <LandingRow />
        </Row>
        <Row label="Theme" hint="The two high-contrast themes use pure black and white with strong borders.">
          <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)} className={selectClass} aria-label="Theme">
            {THEME_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Accent color" hint="Links, active tabs, and primary buttons. The Windows accent is darkened or lightened per theme until it reads clearly.">
          <select
            value={accentSource}
            onChange={(e) => {
              const next = e.target.value as AccentSource;
              setAccentSource(next);
              toast.success(next === "windows" ? "Following the Windows accent color" : "Using the app's accent color");
            }}
            className={selectClass}
            aria-label="Accent color"
          >
            <option value="app">App default</option>
            <option value="windows">Windows accent</option>
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
        <Row label="Font" hint="Dyslexia-friendly is OpenDyslexic, weighted at the bottom so letters are harder to flip or swap.">
          <div className="flex w-80 gap-1" role="group" aria-label="Reading font">
            {READING_FONT_OPTIONS.map((f) => (
              <Button key={f.value} size="sm" active={readingFont === f.value} onClick={() => setReadingFont(f.value)} className={cx("flex-1", f.value === "serif" && "font-serif")}>
                {f.label}
              </Button>
            ))}
          </div>
        </Row>
        <Row label="Preview">
          <p className="reading-font max-w-[60ch] rounded-lg border border-line bg-surface p-4 text-ink" style={typography}>
            <sup className="mr-1 select-none font-sans text-xs font-semibold text-ink-4">16</sup>
            For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.
          </p>
        </Row>
      </div>

      <h2 className="mb-1 mt-8 text-lg font-semibold text-ink">Accessibility</h2>
      <p className="mb-2 text-sm text-ink-3">The high-contrast themes and the dyslexia-friendly font are in the lists above. Windows' own "Reduce motion" setting is honored automatically; this switch forces it.</p>
      <div className="divide-y divide-line">
        <Toggle
          label="Reduce motion"
          hint="No transitions or sliding toasts; scrolling jumps instead of gliding"
          checked={reduceMotion}
          onChange={() => {
            setReduceMotion(!reduceMotion);
            toast.success(reduceMotion ? "Motion restored" : "Reduced motion");
          }}
        />
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
        <Row label="Highlight colors" hint="Names show as tooltips on the color buttons and as headings on the Highlights page.">
          <HighlightLabelsRow />
        </Row>
        <Row label="When copying verses" hint="Used by every copy action: the selection toolbar and the verse menu.">
          <CopyFormatRow />
        </Row>
        <Row label="Note templates" hint="An empty note editor offers these under “Start from…”. Rename, reorder, edit, or add your own.">
          <NoteTemplatesEditor />
        </Row>
      </div>
    </div>
  );
}
