import { useState } from "react";
import { LibrarySection } from "./sections/LibrarySection";
import { PreferencesSection } from "./sections/PreferencesSection";
import { BackupsSection } from "./sections/BackupsSection";
import { AboutSection } from "./sections/AboutSection";
import { TutorialSection } from "./sections/TutorialSection";

type Section = "library" | "preferences" | "backups" | "tutorial" | "about";

const SECTIONS: { key: Section; label: string }[] = [
  { key: "library", label: "Library" },
  { key: "preferences", label: "Preferences" },
  { key: "backups", label: "Data & Backups" },
  { key: "tutorial", label: "Tutorial" },
  { key: "about", label: "About" },
];

export function SettingsView() {
  const [section, setSection] = useState<Section>("library");

  return (
    <div className="mx-auto flex h-full max-w-4xl gap-8 px-6 py-6">
      <nav className="w-40 shrink-0 space-y-0.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`block w-full rounded px-2.5 py-1.5 text-left text-sm ${
              section === s.key
                ? "bg-blue-50 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto pb-10">
        {section === "library" && <LibrarySection />}
        {section === "preferences" && <PreferencesSection />}
        {section === "backups" && <BackupsSection />}
        {section === "tutorial" && <TutorialSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
