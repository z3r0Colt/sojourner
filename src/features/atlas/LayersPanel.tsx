import { X } from "lucide-react";
import { cx, selectSmClass } from "../../components/ui/classes";
import type { Units } from "./geo";
import { PLACE_GROUPS, type Testament } from "./places";
import type { BaseMap, Confidence, LayerSettings } from "./style";

const LABEL_SIZES = [
  { value: 10, label: "Small" },
  { value: 12, label: "Medium" },
  { value: 14, label: "Large" },
  { value: 17, label: "Larger" },
];

const CONFIDENCE: { value: Confidence; label: string }[] = [
  { value: "certain", label: "Certain sites only" },
  { value: "probable", label: "Certain and probable" },
  { value: "possible", label: "Possible and better" },
  { value: "proposed", label: "Every proposed site" },
];

/** What the map shows, like the Layers menu of a web map. */
export function LayersPanel({
  settings: s,
  onChange,
  units,
  onUnits,
  terrainInstalled,
  onClose,
}: {
  settings: LayerSettings;
  onChange: (next: LayerSettings) => void;
  units: Units;
  onUnits: (u: Units) => void;
  terrainInstalled: boolean;
  onClose: () => void;
}) {
  const set = (patch: Partial<LayerSettings>) => onChange({ ...s, ...patch });
  // Terrain is the default, but without its pack the map is plain.
  const shownBase: BaseMap = s.base === "terrain" && !terrainInstalled ? "plain" : s.base === "satellite" ? "plain" : s.base;
  const bases: { value: BaseMap; label: string; available: boolean; note?: string }[] = [
    { value: "plain", label: "Plain", available: true },
    { value: "terrain", label: "Terrain", available: terrainInstalled, note: "Needs the terrain pack" },
    { value: "satellite", label: "Satellite", available: false, note: "Needs the imagery pack" },
  ];

  return (
    <div className="p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold text-ink">Layers</h2>
        <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink" aria-label="Close layers">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Section title="Map">
        <div className="grid grid-cols-3 gap-1.5">
          {bases.map((b) => (
            <button
              key={b.value}
              type="button"
              disabled={!b.available}
              title={b.available ? undefined : b.note}
              onClick={() => set({ base: b.value })}
              className={cx(
                "rounded-md border px-2 py-1.5 text-xs",
                shownBase === b.value ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-ink-2",
                !b.available && "cursor-not-allowed opacity-50",
              )}
            >
              {b.label}
            </button>
          ))}
        </div>
        {!terrainInstalled && <p className="mt-1 text-xs text-ink-4">Terrain and satellite views come with optional map packs.</p>}
      </Section>

      <Section title="Places in Scripture">
        {PLACE_GROUPS.map((g) => (
          <Check key={g.key} label={g.label} checked={s.groups[g.key]} onChange={(v) => set({ groups: { ...s.groups, [g.key]: v } })} />
        ))}
        <Check label="Outlines of ancient lands" checked={s.regions} onChange={(v) => set({ regions: v })} />
        <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
          Testament
          <select value={s.testament} onChange={(e) => set({ testament: e.target.value as Testament })} className={cx(selectSmClass, "flex-1")}>
            <option value="both">Both</option>
            <option value="ot">Old Testament places</option>
            <option value="nt">New Testament places</option>
          </select>
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
          Show
          <select value={s.confidence} onChange={(e) => set({ confidence: e.target.value as Confidence })} className={cx(selectSmClass, "flex-1")}>
            {CONFIDENCE.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1 text-xs text-ink-4">A hollow marker is a site that is only possible or proposed.</p>
      </Section>

      <Section title="Today">
        <Check label="Modern towns and cities" checked={s.modernTowns} onChange={(v) => set({ modernTowns: v })} />
        <Check label="Modern borders" checked={s.modernBorders} onChange={(v) => set({ modernBorders: v })} />
        <Check label="Modern country names" checked={s.modernCountries} onChange={(v) => set({ modernCountries: v })} />
      </Section>

      <Section title="Names">
        <Check label="Names on the map" checked={s.labels} onChange={(v) => set({ labels: v })} />
        <Check label="Seas, deserts and ranges" checked={s.physicalNames} onChange={(v) => set({ physicalNames: v })} />
        <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-3">
          Size
          <select value={s.labelSize} onChange={(e) => set({ labelSize: Number(e.target.value) })} className={cx(selectSmClass, "flex-1")}>
            {LABEL_SIZES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Distances">
        <div className="grid grid-cols-2 gap-1.5">
          {(["mi", "km"] as Units[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => onUnits(u)}
              className={cx("rounded-md border px-2 py-1 text-xs", units === u ? "border-accent bg-accent-soft font-medium text-accent" : "border-line text-ink-2")}
            >
              {u === "mi" ? "Miles" : "Kilometres"}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-2.5 first-of-type:border-t-0">
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-0.5 text-sm text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
      {label}
    </label>
  );
}
