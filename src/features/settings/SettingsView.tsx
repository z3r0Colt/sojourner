import { BookOpen, Database, GraduationCap, Info, Library, type LucideIcon } from "lucide-react";
import { LibrarySection } from "./sections/LibrarySection";
import { PreferencesSection } from "./sections/PreferencesSection";
import { BackupsSection } from "./sections/BackupsSection";
import { AboutSection } from "./sections/AboutSection";
import { TutorialSection } from "./sections/TutorialSection";
import { cx } from "../../components/ui/classes";
import { usePaneParams } from "../../workspace/PaneContext";

type Section = "preferences" | "library" | "backups" | "tutorial" | "about";

const SECTIONS: { key: Section; label: string; icon: LucideIcon }[] = [
  { key: "preferences", label: "Reading", icon: BookOpen },
  { key: "library", label: "Library", icon: Library },
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl gap-8 px-6 py-6">
        <nav aria-label="Settings sections" className="w-44 shrink-0 space-y-0.5">
          <h1 className="mb-3 px-2.5 text-xl font-semibold text-ink">Settings</h1>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setParams({ section: s.key })}
              aria-current={section === s.key ? "page" : undefined}
              className={cx(
                "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm",
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
          {section === "preferences" && <PreferencesSection />}
          {section === "backups" && <BackupsSection />}
          {section === "tutorial" && <TutorialSection />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}
