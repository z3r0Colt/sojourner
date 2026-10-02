import type { ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { BookOpen, ExternalLink as ExternalLinkIcon, ScrollText } from "lucide-react";
import { useLibraryCatalog, usePackStatuses, useResources, useWestminsterDocuments } from "../../api/queries";
import type { Timeline, TimelineCitation, TimelineEvent } from "../../api/types";
import { linkClass, sectionLabelClass } from "../../components/ui/classes";
import { usePane } from "../../workspace/PaneContext";
import { openContent, targetFor } from "../../workspace/openContent";
import {
  churchDateLabel,
  churchEraOf,
  citationHost,
  citationLine,
  confessionLinkLabel,
  findLibraryResource,
  kindLabel,
  libraryBookName,
} from "./churchHistory";
import { openFromTimeline } from "./timelineLinks";

/** A link out of the app. `target="_blank"` inside a webview can navigate the
 * app window itself away, so the address goes to the system browser (the
 * route NoteBody and About take for theirs). */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch(() => {});
      }}
      className={linkClass}
    >
      {children}
    </a>
  );
}

/**
 * One source for the date, as the reader can check it: the source's own words,
 * quoted, and under them where to find them. A citation with an address (a
 * page image at CCEL, a museum's or an archive's page for the twentieth
 * century) links there, with the site named so the reader knows where they
 * are going before they go.
 */
function Citation({ citation }: { citation: TimelineCitation }) {
  const line = citationLine(citation);
  const host = citationHost(citation.url);
  return (
    <figure className="border-l-2 border-line-2 pl-3">
      <blockquote className="reading-font text-sm leading-relaxed text-ink-2">“{citation.quote}”</blockquote>
      <figcaption className="mt-1 text-xs text-ink-3">
        <span aria-hidden="true">—&nbsp;</span>
        {citation.url && host ? (
          <>
            <ExternalLink href={citation.url}>{line}</ExternalLink>
            <span className="text-ink-4">
              {" "}
              <ExternalLinkIcon className="inline h-3 w-3 align-[-2px]" aria-hidden="true" /> {host}
            </span>
          </>
        ) : (
          line
        )}
      </figcaption>
    </figure>
  );
}

/** "Read the Heidelberg Catechism": the creed or confession an event made,
 * opened in Confessions. Shown once the documents are known, so the name is
 * the document's own. */
function ConfessionLink({ code, paneId }: { code: string; paneId: string }) {
  const { data: docs } = useWestminsterDocuments();
  const doc = docs?.find((d) => d.code === code);
  if (!doc) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <ScrollText className="h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
      <button
        type="button"
        className={linkClass}
        onClick={(e) => openFromTimeline(() => openContent("westminster", { docCode: doc.code, sectionId: null }, { target: targetFor(e, "new"), from: paneId }))}
      >
        {confessionLinkLabel(doc.title)}
      </button>
    </span>
  );
}

/**
 * The library book an event concerns -- Augustine's Confessions beside his
 * life, the Institutes beside Calvin's -- opened where it lives. The book
 * library is a separate download, so a reader without it gets a quiet word
 * about where the book is rather than a link that goes nowhere; that includes
 * a reader whose rows for it survive from a build that bundled the library,
 * with no pack installed to open them.
 */
function LibraryLink({ fileName, paneId }: { fileName: string; paneId: string }) {
  const { data: resources, isLoading } = useResources();
  const { data: packs, isLoading: packsLoading } = usePackStatuses();
  const { data: catalog } = useLibraryCatalog();
  if (isLoading || packsLoading) return null;
  const resource = findLibraryResource(resources, fileName, packs);
  if (resource) {
    // The link on one line, and the book's title running on after it and
    // wrapping under it: a volume of the Fathers can be titled with every
    // work in it, four hundred characters of them, so past two lines it is
    // cut short (and whole on hover).
    return (
      <span className="flex items-start gap-1.5">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
        <span className="line-clamp-2 min-w-0" title={resource.title}>
          <button
            type="button"
            className={`${linkClass} whitespace-nowrap`}
            onClick={(e) => openFromTimeline(() => openContent("resource", { id: resource.id }, { target: targetFor(e, "new"), from: paneId }))}
          >
            Open in the library
          </button>
          <span className="text-ink-3"> · {resource.title}</span>
        </span>
      </span>
    );
  }
  const shelf = catalog?.get(fileName)?.shelf_name;
  return (
    <span className="inline-flex items-start gap-1.5 text-ink-3">
      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-4" aria-hidden="true" />
      <span>
        <i>{libraryBookName(fileName)}</i> ships in the book library{shelf ? `, on the ${shelf} shelf` : ""}; install it from{" "}
        <button
          type="button"
          className={linkClass}
          onClick={(e) => openFromTimeline(() => openContent("settings", { section: "books" }, { target: targetFor(e, "new"), from: paneId }))}
        >
          Settings → Library packs
        </button>
        .
      </span>
    </span>
  );
}

/**
 * A church event, selected: what happened and when, as its history dates it,
 * what the app has of it to read, and -- the point of the whole -- the source
 * for the date in its own words. A life's birth and death are often two
 * passages, so there can be a second quotation after the first. The era is
 * named only as the data files it (`churchEraOf`): one worked out from the
 * years would put Luther in the late Middle Ages.
 */
export function ChurchEventDetail({ timeline, event, compact }: { timeline: Timeline; event: TimelineEvent; compact?: boolean }) {
  const { id: paneId } = usePane();
  const era = churchEraOf(event, timeline.eras);
  const kind = kindLabel(event.kind);
  const citations = event.citations ?? [];
  return (
    <div className={compact ? "space-y-2 p-3" : "space-y-3 p-4"}>
      <div>
        <h3 className="text-base font-semibold text-ink">{event.title}</h3>
        <p className="text-sm text-ink-3">
          {churchDateLabel(event)}
          {kind && ` · ${kind}`}
          {era && ` · ${era.name}`}
        </p>
      </div>
      {event.note && <p className="text-sm text-ink-2">{event.note}</p>}
      {(event.confession || event.resource) && (
        <div className="flex flex-col gap-1 text-sm">
          {event.confession && <ConfessionLink code={event.confession} paneId={paneId} />}
          {event.resource && <LibraryLink fileName={event.resource} paneId={paneId} />}
        </div>
      )}
      {citations.length > 0 && (
        <section className="space-y-2">
          <h4 className={sectionLabelClass}>{citations.length > 1 ? "Sources" : "Source"}</h4>
          {citations.map((c, i) => (
            <Citation key={i} citation={c} />
          ))}
        </section>
      )}
      <p className="text-xs text-ink-4">
        Church history, dated as the source quoted dates it: Schaff's History and Creeds, the Nicene and Post-Nicene Fathers and the Schaff-Herzog
        encyclopedia, and where those do not reach, in the twentieth century, two independent references that agree. The dates are the source's own, Julian where it reckons so; “c.” marks one it gives as
        approximate or disputed, and on the line such an event's mark is drawn hollow, or its span fades at the ends.
      </p>
    </div>
  );
}
