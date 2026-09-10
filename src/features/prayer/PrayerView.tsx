import { useState } from "react";
import { PrayerJournalView } from "./PrayerJournalView";
import { PrayerListView } from "./PrayerListView";

type Tab = "journal" | "list";

export function PrayerView() {
  const [tab, setTab] = useState<Tab>("journal");

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center gap-4">
        <h1 className="text-xl font-semibold">Prayer</h1>
        <div className="flex rounded border border-gray-300 text-sm dark:border-gray-700">
          <button
            onClick={() => setTab("journal")}
            className={`rounded-l px-3 py-1 ${tab === "journal" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}
          >
            Journal
          </button>
          <button
            onClick={() => setTab("list")}
            className={`rounded-r px-3 py-1 ${tab === "list" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"}`}
          >
            Prayer List
          </button>
        </div>
      </div>
      {tab === "journal" ? <PrayerJournalView /> : <PrayerListView />}
    </div>
  );
}
