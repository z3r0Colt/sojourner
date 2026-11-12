/** Where a tooltip goes: centred under what it names, above it when there
 * is no room below, and held inside the window either way. */
export function tipPosition(
  target: { left: number; right: number; top: number; bottom: number },
  tip: { width: number; height: number },
  view: { width: number; height: number },
  gap = 6,
  margin = 6,
): { left: number; top: number } {
  const centre = (target.left + target.right) / 2;
  const left = Math.max(margin, Math.min(centre - tip.width / 2, view.width - tip.width - margin));
  const below = target.bottom + gap;
  const top = below + tip.height + margin <= view.height ? below : Math.max(margin, target.top - gap - tip.height);
  return { left, top };
}
