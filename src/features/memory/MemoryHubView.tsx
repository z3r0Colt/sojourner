import { useState } from "react";
import { BookOpen, ScrollText } from "lucide-react";
import { MemoryView } from "./MemoryView";
import { CatechismMemoryView } from "./CatechismMemoryView";
import { Page } from "../../components/ui/Page";
import { Tabs } from "../../components/ui/Tabs";

type Tab = "scripture" | "catechism";

/** Top-level Memory tab: Scripture Memory (verse-keyed SM-2 cards) and
 * Catechism Study (Westminster question-keyed SM-2 cards) share the same
 * spaced-repetition engine and practice-mode UI but keep separate decks,
 * since a memorized verse and a memorized catechism answer have little in
 * common beyond that engine -- see the catechism_memory schema comment. */
export function MemoryHubView() {
  const [tab, setTab] = useState<Tab>("scripture");

  return (
    <Page title="Memory">
      <Tabs
        className="mb-5"
        items={[
          { key: "scripture", label: "Scripture", icon: BookOpen },
          { key: "catechism", label: "Catechism", icon: ScrollText },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "scripture" ? <MemoryView /> : <CatechismMemoryView />}
    </Page>
  );
}
