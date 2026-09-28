import type { ReactNode } from "react";

/** Church history's violet, as the canvas draws it (timelineColors). */
const CHURCH_COLOR = "var(--color-timeline-church, var(--color-callout-custom))";

function Mark({ children, width = 12, label }: { children: ReactNode; width?: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <svg width={width} height={12} viewBox={`0 0 ${width} 12`} aria-hidden="true" className="shrink-0" style={{ color: CHURCH_COLOR }}>
        {children}
      </svg>
      {label}
    </span>
  );
}

/** A life's rule, as the canvas draws it: a fine line from birth to death with
 * a tick at either end -- fading at both ends when the dates are "about". */
function LifeRule({ circa }: { circa?: boolean }) {
  const ends = circa ? 0.35 : 1;
  return (
    <g fill="currentColor">
      <rect x={1} y={4.5} width={3} height={3} opacity={circa ? 0.25 : 0.75} />
      <rect x={4} y={4.5} width={3} height={3} opacity={circa ? 0.5 : 0.75} />
      <rect x={7} y={4.5} width={8} height={3} opacity={0.75} />
      <rect x={15} y={4.5} width={3} height={3} opacity={circa ? 0.5 : 0.75} />
      <rect x={18} y={4.5} width={3} height={3} opacity={circa ? 0.25 : 0.75} />
      <rect x={1} y={2} width={1.5} height={8} opacity={ends * 0.75} />
      <rect x={19.5} y={2} width={1.5} height={8} opacity={ends * 0.75} />
    </g>
  );
}

/**
 * What the church band's marks mean: the canvas draws a council, a writing, a
 * mission and a life each its own way, and an approximate date open or
 * fading, and without a key a reader could only guess. Shown under the
 * timeline while nothing is selected, beside the hint on how to use it.
 */
export function ChurchMarksKey({ className }: { className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3 ${className ?? ""}`}>
      <span className="font-semibold" style={{ color: CHURCH_COLOR }}>
        Church history
      </span>
      <Mark label="council">
        <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="currentColor" />
      </Mark>
      <Mark label="writing">
        <rect x={3} y={3} width={6} height={6} fill="currentColor" />
      </Mark>
      <Mark label="mission">
        <path d="M3 2 L10 6 L3 10 Z" fill="currentColor" />
      </Mark>
      <Mark label="life, birth to death" width={22}>
        <LifeRule />
      </Mark>
      <Mark label="other events">
        <circle cx={6} cy={6} r={3} fill="currentColor" />
      </Mark>
      {/* The longest entry: its words may wrap in a narrow pane, its marks do not. */}
      <span className="inline-flex min-w-0 items-center gap-1">
        <svg width={40} height={12} viewBox="0 0 40 12" aria-hidden="true" className="shrink-0" style={{ color: CHURCH_COLOR }}>
          <path d="M6 2 L10 6 L6 10 L2 6 Z" fill="var(--color-surface)" stroke="currentColor" strokeWidth={1.5} />
          <g transform="translate(16 0)">
            <LifeRule circa />
          </g>
        </svg>
        a hollow mark or fading ends: the date is approximate (“c.”)
      </span>
    </p>
  );
}
