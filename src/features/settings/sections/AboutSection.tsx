export function AboutSection() {
  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-ink">About</h2>
      <p className="mb-6 text-sm text-ink-3">Sojourner's Study Companion</p>

      <div className="space-y-4 text-sm leading-relaxed text-ink-2">
        <p>
          A private, offline study companion for reading Scripture alongside the historic commentaries, confessions, and reference works of the church,
          built for the sojourner making their way through this world toward the next (1 Peter 2:11; Hebrews 11:13).
        </p>
        <p>
          Everything lives in one file on this device. There is no account, no sync service, and no network request this app makes of its own accord.
          Your notes, highlights, and prayers stay yours. Back up or export any time from Settings → Data &amp; backups.
        </p>
        <p>
          Included are multiple Bible translations, classic commentaries (Matthew Henry, Jamieson-Fausset-Brown, Spurgeon's Treasury of David, and others),
          the Westminster Standards, Strong's lexicon with interlinear Hebrew and Greek, a harmony of the Gospels, reading plans, and tools for prayer and
          Scripture memory.
        </p>
      </div>

      <blockquote className="mt-8 rounded-lg border border-line bg-surface-2 p-4">
        <p className="reading-font text-base italic leading-relaxed text-ink">
          “The LORD bless thee, and keep thee: the LORD make his face shine upon thee, and be gracious unto thee: the LORD lift up his countenance upon thee, and
          give thee peace.”
        </p>
        <footer className="mt-2 text-xs text-ink-3">Numbers 6:24-26</footer>
      </blockquote>
    </div>
  );
}
