import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, Footprints } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Kbd } from "../../../components/ui/Page";
import { cx, inputClass } from "../../../components/ui/classes";
import { openContent, openPassage } from "../../../workspace/openContent";
import { usePane } from "../../../workspace/PaneContext";
import { parseRoute } from "../../../workspace/paneKinds";
import { startTour } from "../../onboarding/tourStore";
import { TUTORIAL, entryText, type TutorialEntry, type TutorialLink } from "./tutorialContent";

/** `[Ctrl]+[K]` in the content renders as key caps. */
function withKeys(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<Kbd key={i++}>{m[1]}</Kbd>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A link in an entry. Pages open in a new pane beside the tutorial so the
 * steps stay in view; [Ctrl]+click or middle-click opens in this pane.
 * A "press" link presses a top-bar button; "tour" starts the tour. */
function LinkChip({ link }: { link: TutorialLink }) {
  const { id: paneId } = usePane();
  function go(e: React.MouseEvent) {
    e.preventDefault();
    if ("tour" in link) {
      openContent("bible", {}, { target: "focused" });
      window.setTimeout(startTour, 350);
      return;
    }
    if ("press" in link) {
      document.querySelector<HTMLElement>(`[data-tour="${link.press}"]`)?.click();
      return;
    }
    // The chord swaps the default: a plain click opens beside, a modified
    // click opens here.
    const target = e.ctrlKey || e.metaKey || e.button === 1 ? paneId : "new";
    if ("passage" in link) {
      openPassage(link.passage, { target, from: paneId });
      return;
    }
    const [pathname, search] = link.to.split("?");
    const parsed = parseRoute(pathname, search ? `?${search}` : "");
    if (parsed) openContent(parsed.kind, parsed.params as never, { target, from: paneId });
  }
  const opensPage = "to" in link || "passage" in link;
  return (
    <a
      href={"to" in link ? `#${link.to}` : "#"}
      onClick={go}
      onAuxClick={(e) => e.button === 1 && go(e)}
      title={opensPage ? "Opens in a new pane beside this one; Ctrl+click opens it here" : undefined}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-accent hover:border-accent/50 hover:bg-accent-soft"
    >
      {opensPage && <ExternalLink className="h-3 w-3" aria-hidden="true" />}
      {link.label}
    </a>
  );
}

function Entry({ entry }: { entry: TutorialEntry }) {
  return (
    <div id={`tutorial-${entry.id}`}>
      <dt className="text-sm font-medium text-ink">{entry.title}</dt>
      <dd className="mt-0.5 text-sm text-ink-2">
        <p>{withKeys(entry.what)}</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 marker:text-ink-4">
          {entry.steps.map((s, i) => (
            <li key={i}>{withKeys(s)}</li>
          ))}
        </ol>
        {entry.links && entry.links.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-4">Go there:</span>
            {entry.links.map((l) => (
              <LinkChip key={l.label} link={l} />
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}

export function TutorialSection() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!q) return TUTORIAL;
    return TUTORIAL.map((c) => ({ ...c, entries: c.entries.filter((e) => entryText(e).toLowerCase().includes(q)) })).filter((c) => c.entries.length > 0);
  }, [q]);
  const total = TUTORIAL.reduce((n, c) => n + c.entries.length, 0);
  const found = shown.reduce((n, c) => n + c.entries.length, 0);

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">Tutorial</h2>
      <p className="mb-4 text-sm text-ink-3">
        Everything this app can do, by area: what each thing is, the steps to do it, and where it lives. Links open beside this page so you can follow the steps while you read; <Kbd>Ctrl</Kbd>+click a link to open it here instead.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5">
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-ink">The nine-step tour</div>
          <div className="text-xs text-ink-3">Opens the Bible and points out the Go to button, a verse, the Add pane strip, a pane header, the layout button, the sidebar groups, and Settings.</div>
        </div>
        <Button
          icon={Footprints}
          onClick={() => {
            // The tour spotlights the Bible page, so this pane shows it
            // first (Back returns to Settings).
            openContent("bible", {}, { target: "focused" });
            window.setTimeout(startTour, 350);
          }}
        >
          Show the tour again
        </Button>
      </div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the tutorial…" aria-label="Search the tutorial" className={cx(inputClass, "mb-4 w-full")} />
      {q && (
        <p className="mb-3 text-xs text-ink-3">
          {found} of {total} entries mention “{query.trim()}”.
        </p>
      )}
      <div className="space-y-2">
        {shown.map((cat) => (
          <details key={cat.title} className="group rounded-lg border border-line bg-surface" open={q ? true : undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink hover:bg-hover">
              <ChevronDown className="h-4 w-4 -rotate-90 text-ink-3 transition-transform group-open:rotate-0" aria-hidden="true" />
              {cat.title}
              <span className="font-normal text-ink-4">· {cat.entries.length}</span>
            </summary>
            <dl className="space-y-4 border-t border-line px-4 py-3">
              {cat.entries.map((entry) => (
                <Entry key={entry.id} entry={entry} />
              ))}
            </dl>
          </details>
        ))}
        {shown.length === 0 && <p className="text-sm text-ink-3">Nothing in the tutorial mentions that. Try another word, or press Ctrl+/ for the shortcut list.</p>}
      </div>
    </div>
  );
}
