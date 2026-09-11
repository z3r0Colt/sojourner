import { useState } from "react";
import { BookHeart, Users } from "lucide-react";
import { PrayerJournalView } from "./PrayerJournalView";
import { PrayerListView } from "./PrayerListView";
import { Page } from "../../components/ui/Page";
import { Tabs } from "../../components/ui/Tabs";

type Tab = "journal" | "list";

export function PrayerView() {
  const [tab, setTab] = useState<Tab>("journal");

  return (
    <Page title="Prayer">
      <Tabs
        className="mb-5"
        items={[
          { key: "journal", label: "Journal", icon: BookHeart },
          { key: "list", label: "Prayer list", icon: Users },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "journal" ? <PrayerJournalView /> : <PrayerListView />}
    </Page>
  );
}
