import { BookMarked, BookOpen, Database, GraduationCap, Info, Library, type LucideIcon } from "lucide-react";
import { LibrarySection } from "./sections/LibrarySection";
import { PacksSection } from "./sections/PacksSection";
import { PreferencesSection } from "./sections/PreferencesSection";
import { BackupsSection } from "./sections/BackupsSection";
import { AboutSection } from "./sections/AboutSection";
import { TutorialSection } from "./sections/TutorialSection";
import { cx } from "../../components/ui/classes";
import { usePaneParams } from "../../workspace/PaneContext";

type Section = "preferences" | "library" | "books" | "backups" | "tutorial" | "about";

const SECTIONS: { key: Section; label: string; icon: LucideIcon }[] = [
  { key: "preferences", label: "Reading", icon: BookOpen },
  { key: "library", label: "Library", icon: Library },
  { key: "books", label: "Book library", icon: BookMarked },
  { key: "backups", label: "Data & backups", icon: Database },
  { key: "tutorial", label: "Tutorial", icon: GraduationCap },
  { key: "about", label: "About", icon: Info },
];

function isSection(v: string | null): v is Section {
  return SECTIONS.some((s) => s.key === v);
}

export function SettingsView() {
  // Deep-linkable via /settings?section=tutorial (e.g. the first-run
  // tutorial banner); the section is the pane's param.
  const [params, setParams] = usePaneParams("settings");
  const section: Section = isSection(params.section) ? params.section : "preferences";

  // Beside the section where the pane is wide enough for both, and above it
  // where it is not: a pane a third of the window wide -- About opened from
  // a Webster entry -- would otherwise give the section less room than the
  // list of sections.
  return (
    <div className="@container h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-4 px-4 py-6 @xl:flex-row @xl:gap-8 @xl:px-6">
        <nav aria-label="Settings sections" className="-mx-2.5 flex flex-wrap gap-0.5 @xl:mx-0 @xl:block @xl:w-44 @xl:shrink-0 @xl:space-y-0.5">
          <h1 className="mb-3 w-full px-2.5 text-xl font-semibold text-ink">Settings</h1>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setParams({ section: s.key })}
              aria-current={section === s.key ? "page" : undefined}
              className={cx(
                "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-sm @xl:w-full",
                section === s.key ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-hover hover:text-ink",
              )}
            >
              <s.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 pb-10">
          {section === "library" && <LibrarySection />}
          {section === "books" && <PacksSection />}
          {section === "preferences" && <PreferencesSection />}
          {section === "backups" && <BackupsSection />}
          {section === "tutorial" && <TutorialSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
