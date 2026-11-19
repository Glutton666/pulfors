import type { NotebookSettings, StaffNotebook, StaffPage, StaffPoint, StaffStamp } from "./staff-notebook";
import { ROW_HEIGHT, STAFF_GAP, STAFF_TOP, rowAt, type NotebookRow } from "./staff-notebook-layout";
import { notebookMeasureRegions, type NotebookMeasureRegion } from "./notebook-measures";

export type NotebookMeter = NonNullable<NotebookSettings["notationMeter"]>;
export const notebookMeterUnits = [2, 4, 8, 16] as const;
export const defaultNotationMeter: NotebookMeter = { beats: 4, unit: 4 };
export type SectionKind = "clef" | "meter";
export function meterFromGlyph(glyph: string): NotebookMeter | undefined {
  const match = /^time-([1-9]|1[0-2])-(2|4|8|16)$/.exec(glyph);
  return match ? { beats: Number(match[1]), unit: Number(match[2]) as NotebookMeter["unit"] } : undefined;
}
export function sectionKind(glyph: string): SectionKind | undefined {
  return /^clef-(treble|bass|alto|tenor|percussion)$/.test(glyph) ? "clef" : meterFromGlyph(glyph) ? "meter" : undefined;
}
export const meterLength = (meter: NotebookMeter) => meter.beats * 4 / meter.unit;
export function sectionStaffY(glyph: string, row: number) {
  const line = glyph === "clef-treble" ? 3 : glyph === "clef-bass" || glyph === "clef-tenor" ? 1 : 2;
  return row * ROW_HEIGHT + STAFF_TOP + line * STAFF_GAP;
}

export type SectionMeasure = NotebookMeasureRegion & {
  clef?: string;
  meter: NotebookMeter;
  clefChange?: StaffStamp;
  meterChange?: StaffStamp;
};

export function notebookSections(note: StaffNotebook) {
  let meter = note.settings?.notationMeter ?? defaultNotationMeter;
  let clef: string | undefined;
  return note.pages.map((page) => {
    const regions = notebookMeasureRegions(page, note.settings);
    const changes = new Map<string, Partial<Record<SectionKind, StaffStamp>>>();
    const byRow = groupRegions(regions);
    (page.stamps ?? []).forEach((stamp) => {
      const kind = stamp.sectionStart && sectionKind(stamp.glyph);
      if (!kind) return;
      const region = regionAt(byRow, stamp, page.staffCount ?? 7);
      const key = `${region.row}:${region.index}`;
      changes.set(key, { ...changes.get(key), [kind]: stamp });
    });
    return regions.map((region): SectionMeasure => {
      const next = changes.get(`${region.row}:${region.index}`);
      if (next?.clef) clef = next.clef.glyph;
      if (next?.meter) meter = meterFromGlyph(next.meter.glyph)!;
      return { ...region, clef, meter, clefChange: next?.clef, meterChange: next?.meter };
    });
  });
}

function groupRegions<T extends NotebookMeasureRegion>(regions: T[]) {
  const rows = new Map<number, T[]>();
  regions.forEach((region) => {
    const list = rows.get(region.row);
    if (list) list.push(region); else rows.set(region.row, [region]);
  });
  return rows;
}
function regionAt<T extends NotebookMeasureRegion>(rows: Map<number, T[]>, point: StaffPoint, count: number): T {
  const row = rows.get(rowAt(point.y, count))!;
  return row.find((region) => point.x < region.right) ?? row[row.length - 1];
}
export function measureAtPoint<T extends NotebookMeasureRegion>(regions: T[], point: StaffPoint, count: number) {
  return regionAt(groupRegions(regions), point, count);
}

export function placeSectionStamp(stamp: StaffStamp, region: NotebookMeasureRegion): StaffStamp {
  const width = region.right - region.left;
  // Keep the stamp strictly inside its measure even in very narrow manual bars.
  const x = region.left + Math.min(sectionKind(stamp.glyph) === "clef" ? 18 : 42, width * 0.6);
  return { ...stamp, x, y: sectionStaffY(stamp.glyph, region.row), measure: region.index };
}

/** Use edited geometry to move/change sections without promoting legacy stamps. */
export function normalizeNotebookSections(before: StaffNotebook, next: StaffNotebook): StaffNotebook {
  const previous = new Map(before.pages.flatMap((page, i) => {
    const marks = (page.stamps ?? []).filter((s) => s.sectionStart);
    if (!marks.length) return [];
    const regions = groupRegions(notebookMeasureRegions(page, before.settings));
    return marks.map((s) => [s.id, { s, i, region: regionAt(regions, s, page.staffCount ?? 7) }] as const);
  }));
  return { ...next, pages: next.pages.map((page, i) => {
    if (!page.stamps?.some((s) => s.sectionStart)) return page;
    const regions = groupRegions(notebookMeasureRegions(page, next.settings));
    const keyFor = (s: StaffStamp) => {
      const region = regionAt(regions, s, page.staffCount ?? 7);
      return { key: `${region.row}:${region.index}:${sectionKind(s.glyph)}`, region };
    };
    const owners = new Map<string, { id: string; edited: boolean }>();
    const keys = new Map<string, string>();
    return { ...page, stamps: page.stamps.map((s) => {
      if (!s.sectionStart) return s;
      const prior = previous.get(s.id);
      const edited = !prior || prior.i !== i || s.x !== prior.s.x || s.y !== prior.s.y || s.glyph !== prior.s.glyph;
      const hit = keyFor(s);
      // Adding a boundary between a header and its left edge must not
      // make the unchanged header belong to the right-hand measure.
      const region = !edited && prior && page.id === before.pages[i]?.id
        ? regions.get(hit.region.row)?.find((r) => Math.abs(r.left - prior.region.left) < 1) ?? hit.region
        : hit.region;
      const key = `${region.row}:${region.index}:${sectionKind(s.glyph)}`;
      keys.set(s.id, key);
      if (edited || !owners.get(key)?.edited) owners.set(key, { id: s.id, edited });
      return placeSectionStamp(s, region);
    }).filter((s) => !s.sectionStart || owners.get(keys.get(s.id)!)?.id === s.id) };
  }) };
}

export function hasNotebookSections(note: StaffNotebook) {
  return note.pages.some((p) => p.stamps?.some((s) => s.sectionStart));
}

export function materializedNotebookSections(note: StaffNotebook, rows: NotebookRow[], page: StaffPage) {
  const authored = notebookSections(note).map(groupRegions);
  const visible = notebookMeasureRegions(page, note.settings);
  const marks = new Map((page.stamps ?? []).filter((s) => s.sectionStart).map((s) => [s.id, s]));
  return visible.map((r): SectionMeasure => {
    const row = rows[r.row];
    const value = row && authored[row.pageIndex].get(row.rowIndex)?.[r.index];
    return { ...r, meter: value?.meter ?? note.settings?.notationMeter ?? defaultNotationMeter, clef: value?.clef,
      clefChange: value?.clefChange && marks.get(`${r.row}:${value.clefChange.id}`),
      meterChange: value?.meterChange && marks.get(`${r.row}:${value.meterChange.id}`) };
  });
}
