import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMetricalPsalm, useReadingPlanDays } from "../../api/queries";
import { STARTER_PLAN, STARTER_TITLES, TALK_QUESTIONS, upcomingDays, upcomingQuestions } from "./familyWorship";
import { useCatechismQuestions, useFamilyWorship } from "./useFamilyWorship";

const h2: React.CSSProperties = {
  fontSize: "11pt",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  margin: "14pt 0 6pt",
  borderBottom: "1px solid #999",
  paddingBottom: "2pt",
};

/**
 * The week on one sheet, for the fridge or the table: the next seven
 * readings, the psalm's words, the week's catechism questions with their
 * answers, and the names to pray for. Mounted only for the print pass, on
 * <body> (see PrayerListView), and prints itself once its data is in.
 */
export function FamilyWeekSheet({ onDone }: { onDone: () => void }) {
  const { state, tonight } = useFamilyWorship();
  const { data: days } = useReadingPlanDays(state?.plan?.code ?? null);
  const psalmNumber = state?.singing ? (state.psalm?.number ?? null) : null;
  const { data: psalmVersions } = useMetricalPsalm(psalmNumber);

  const questions = tonight?.questions;
  const upcoming = state?.catechism && questions?.length ? upcomingQuestions(state.catechism, questions.length, 7) : [];
  const ids = upcoming.map((i) => questions![i].id);
  const full = useCatechismQuestions(ids);

  const dayNumbers = state ? upcomingDays(state, tonight?.plan?.length_days, 7) : [];
  // A catechism or plan missing from an older content.db never loads; print
  // what there is rather than wait for it forever.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 4000);
    return () => window.clearTimeout(t);
  }, []);
  const ready =
    waited ||
    (!!state &&
    (!state.plan || days != null) &&
    (psalmNumber == null || psalmVersions != null) &&
    (!state.catechism || (questions != null && full.size === ids.length)));

  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => {
      window.print();
      onDone();
    });
    return () => cancelAnimationFrame(id);
  }, [ready, onDone]);

  if (!state || !tonight) return null;
  const version = psalmVersions?.[0];
  const from = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return createPortal(
    <div className="print-root print-only" aria-hidden="true">
      <div style={{ fontFamily: "Georgia, serif", padding: "0.5in", color: "#000", fontSize: "11pt", lineHeight: 1.35 }}>
        <h1 style={{ fontSize: "20pt", margin: "0 0 2pt" }}>Family worship</h1>
        <p style={{ fontSize: "10pt", margin: 0, color: "#444" }}>The week from {from}</p>

        {dayNumbers.length > 0 && (
          <section>
            <h2 style={h2}>Read · {tonight.plan?.title}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {dayNumbers.map((n) => {
                  const day = days?.find((d) => d.day_number === n);
                  const title = state.plan?.code === STARTER_PLAN ? STARTER_TITLES[n - 1] : null;
                  return (
                    <tr key={n} style={{ verticalAlign: "top" }}>
                      <td style={{ width: "18pt", padding: "3pt 6pt 3pt 0" }}>
                        <span style={{ display: "inline-block", width: "10pt", height: "10pt", border: "1px solid #000", borderRadius: "2pt" }} />
                      </td>
                      <td style={{ width: "44pt", padding: "3pt 6pt 3pt 0", color: "#555" }}>Day {n}</td>
                      <td style={{ padding: "3pt 0" }}>
                        <strong>{day?.readings.map((r) => r.label).join("; ")}</strong>
                        {title && <span style={{ color: "#444" }}> · {title}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ margin: "6pt 0 0", fontSize: "10pt" }}>
              <em>Talk about it:</em> {TALK_QUESTIONS.join(" ")}
            </p>
          </section>
        )}

        {psalmNumber != null && version && (
          <section style={{ breakInside: "avoid" }}>
            <h2 style={h2}>
              Sing · Psalm {psalmNumber} <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: "normal" }}>({version.metre}, 1650 Scottish Psalter)</span>
            </h2>
            <div style={{ columnCount: version.stanzas.length > 4 ? 2 : 1, columnGap: "24pt" }}>
              {version.stanzas.length > 0
                ? version.stanzas.map((s) => (
                    <p key={s.number} style={{ margin: "0 0 6pt", breakInside: "avoid" }}>
                      <span style={{ fontSize: "8pt", color: "#666", marginRight: "3pt" }}>{s.number}</span>
                      {s.lines.map((l, i) => (
                        <span key={i} style={{ display: "block" }}>
                          {l.text}
                        </span>
                      ))}
                    </p>
                  ))
                : version.verses.map((v) => (
                    <p key={v.verse} style={{ margin: "0 0 6pt", whiteSpace: "pre-line" }}>
                      {v.text}
                    </p>
                  ))}
            </div>
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 style={h2}>Catechism · {tonight.catechismTitle}</h2>
            {ids.map((id) => {
              const q = full.get(id);
              if (!q) return null;
              return (
                <div key={id} style={{ margin: "0 0 6pt", breakInside: "avoid" }}>
                  <div>
                    <span style={{ color: "#555" }}>{q.heading}. </span>
                    <strong>{q.prompt}</strong>
                  </div>
                  <div style={{ whiteSpace: "pre-line" }}>{q.body}</div>
                </div>
              );
            })}
          </section>
        )}

        {tonight.everyone.length > 0 && (
          <section style={{ breakInside: "avoid" }}>
            <h2 style={h2}>Pray for{state.prayerCategory ? ` · ${state.prayerCategory}` : ""}</h2>
            <div style={{ columnCount: 2, columnGap: "24pt" }}>
              {tonight.everyone.map((p) => (
                <div key={p.id} style={{ margin: "0 0 4pt", breakInside: "avoid" }}>
                  <strong>{p.name}</strong>
                  {p.notes && <span style={{ fontSize: "9.5pt", color: "#444" }}> · {p.notes}</span>}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>,
    document.body,
  );
}
