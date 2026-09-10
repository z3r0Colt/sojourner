export function AboutSection() {
  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">About</h1>
      <p className="mb-6 text-sm text-gray-500">Sojourner's Study Companion</p>

      <div className="space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <p>
          This app is a private, offline study companion for reading Scripture alongside the historic commentaries,
          confessions, and reference works of the church -- built for the sojourner making their way through this
          world toward the next (1 Peter 2:11; Hebrews 11:13).
        </p>
        <p>
          Everything lives in one file on this device. There is no account, no sync service, and no network request
          this app makes of its own accord -- your notes, highlights, prayers, and sermon notes stay yours. Back up
          or export any time from Settings → Data &amp; Backups.
        </p>
        <p>
          Included are multiple Bible translations, classic commentaries (Matthew Henry, Jamieson-Fausset-Brown,
          Spurgeon's Treasury of David, and others), the Westminster Standards and other Reformed confessions,
          Strong's lexicon with interlinear Hebrew/Greek, a harmony of the Gospels, reading plans, and tools for
          sermon notes, prayer, and Scripture memory.
        </p>
      </div>

      <div className="mt-8 rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
        <p className="reading-font text-sm italic leading-relaxed text-gray-700 dark:text-gray-300">
          "The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee: the
          LORD lift up his countenance upon thee, and give thee peace."
        </p>
        <p className="mt-2 text-xs text-gray-400">Numbers 6:24-26</p>
      </div>
    </div>
  );
}
