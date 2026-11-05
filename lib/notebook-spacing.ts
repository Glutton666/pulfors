import type { StaffPage, StaffStamp } from "./staff-notebook";
import { PAPER_WIDTH, rowAt } from "./staff-notebook-layout";

export type NotebookSpacingResult = { page: StaffPage; reason: "changed" | "unchanged" | "crowded" };

// Conservative horizontal ink envelopes, in the glyph's 26-unit coordinate
// system. Include flags, dots, ghost parentheses, and the widest text signs.
const textSigns: Record<string, string> = {
  pizzicato: "pizz.", arco: "arco", ottava1: "8va", trill: "tr~",
  glissando: "gliss.", da_capo: "D.C.", dal_segno: "D.S.",
  dal_segno_coda: "D.S. al Coda", da_capo_coda: "D.C. al Coda", fine: "Fine",
};
function horizontalInk(stamp: StaffStamp) {
  const half = textSigns[stamp.glyph] ? Math.max(20, textSigns[stamp.glyph].length * 12) : 28;
  const unit = stamp.size / 26;
  return { left: half * unit, right: half * unit };
}

/** One manual, equal-center-spacing edit in document coordinates. Attachments
 * are a single slot with their owner; no duration, y, ink, or group edits. */
export function spaceNotebookRow(page: StaffPage): NotebookSpacingResult {
  const stamps = page.stamps ?? [];
  const anchor = page.anchor ?? stamps.at(-1);
  const row = rowAt(anchor?.y ?? 0, page.staffCount ?? 7);
  const byId = new Map(stamps.map((stamp) => [stamp.id, stamp]));
  const rootOf = (stamp: StaffStamp): StaffStamp => {
    let current = stamp;
    const seen = new Set([stamp.id]);
    while (current.attachTo && byId.has(current.attachTo)) {
      if (seen.has(current.attachTo)) return stamp; // tolerate malformed legacy cycles
      current = byId.get(current.attachTo)!;
      seen.add(current.id);
    }
    return current;
  };
  const owners = new Map(stamps.map((stamp) => [stamp.id, rootOf(stamp).id]));
  const roots = stamps.filter((stamp) => owners.get(stamp.id) === stamp.id &&
    rowAt(stamp.y, page.staffCount ?? 7) === row).sort((a, b) => a.x - b.x);
  if (roots.length < 2) return { page, reason: "unchanged" };

  const groupedInk = new Map(roots.map((root) => [root.id, { root, left: 0, right: 0 }]));
  stamps.forEach((stamp) => {
    const group = groupedInk.get(owners.get(stamp.id)!);
    if (!group) return;
    const ink = horizontalInk(stamp);
    group.left = Math.max(group.left, group.root.x - stamp.x + ink.left);
    group.right = Math.max(group.right, stamp.x - group.root.x + ink.right);
  });
  const envelopes = roots.map((root) => groupedInk.get(root.id)!);
  const firstX = 38 + Math.max(...envelopes.map((ink) => ink.left));
  const lastX = PAPER_WIDTH - 38 - Math.max(...envelopes.map((ink) => ink.right));
  const step = (lastX - firstX) / (roots.length - 1);
  if (step <= 0 || envelopes.some((ink, index) =>
    index > 0 && step < envelopes[index - 1].right + ink.left + 8)) {
    return { page, reason: "crowded" };
  }
  const shifts = new Map(roots.map((stamp, index) => [stamp.id, firstX + step * index - stamp.x]));
  if ([...shifts.values()].every((dx) => Math.abs(dx) < 0.000001)) return { page, reason: "unchanged" };

  // Erasure masks are object-local: spreading each object without rewriting
  // masks keeps the same cut on the moved glyph.
  const nextStamps = stamps.map((stamp) => {
    const dx = shifts.get(owners.get(stamp.id)!);
    return dx === undefined ? stamp : { ...stamp, x: stamp.x + dx };
  });
  const reference = anchor && stamps.reduce<StaffStamp | undefined>((closest, stamp) =>
    shifts.has(owners.get(stamp.id)!) && (!closest ||
      Math.hypot(stamp.x - anchor.x, stamp.y - anchor.y) < Math.hypot(closest.x - anchor.x, closest.y - anchor.y))
      ? stamp : closest, undefined);
  const dx = reference ? shifts.get(owners.get(reference.id)!)! : 0;
  return { reason: "changed", page: { ...page, stamps: nextStamps,
    anchor: anchor ? { x: anchor.x + dx, y: anchor.y } : page.anchor } };
}
