import type { NotebookSettings, StaffPage, StaffPoint, StaffStamp } from "./staff-notebook";
import { PAPER_WIDTH, ROW_HEIGHT, rowAt } from "./staff-notebook-layout";
import { NOTEBOOK_LEFT, NOTEBOOK_SPAN, naturalPaperWidth } from "./notebook-measures";
import { notebookSections, placeSectionStamp, sectionKind, sectionStaffY, type SectionMeasure } from "./notebook-sections";

/** A view projection only: resizing never rewrites the saved score or its meter. */
export function notebookPortraitPolicy(width: number, height: number, requestedZoom: number) {
  const portrait = width > 0 && width < 600 && height > width;
  const zoom = Math.max(portrait ? 0.5 : 0.35, Math.min(2.5, requestedZoom));
  return { portrait, zoom, columns: portrait ? Math.min(2, Math.max(1, Math.floor(1 / zoom + 1e-7))) : undefined };
}

export function notebookDisplayColumns(zoom: number, base: number, portraitColumns?: number) {
  return portraitColumns ?? Math.min(32, Math.max(1, Math.floor(base / zoom + 1e-7)));
}

export function projectNotebookPortrait(page: StaffPage, settings: Partial<NotebookSettings>, columns: number, zoom = 1, boost = 1, sections?: SectionMeasure[], keepRows = false) {
  const regions = sections ?? notebookSections({ id: "", title: "", updatedAt: 0, pages: [page], settings: settings as NotebookSettings })[0];
  const byRow = new Map<number, { region: (typeof regions)[number]; index: number }[]>();
  regions.forEach((region, index) => {
    const group = byRow.get(region.row) ?? [];
    group.push({ region, index }); byRow.set(region.row, group);
  });
  const count = Math.max(1, Math.min(32, columns));
  const span = PAPER_WIDTH / (Math.min(1, zoom) * boost) - NOTEBOOK_LEFT * 2;
  const cellWidth = span / count;
  const displayRows: number[][] = [];
  const cells = regions.map((region, index) => {
    let row = displayRows.at(-1);
    if (!row || (keepRows ? region.index === 0 : row.length >= count || region.clefChange || region.meterChange)) { row = []; displayRows.push(row); }
    const col = row.length;
    row.push(index);
    const clef = col === 0 ? region.clef : region.clefChange?.glyph;
    const marks = Number(!!clef) + Number(!!region.meterChange);
    const sourceSpan = naturalPaperWidth(page) - NOTEBOOK_LEFT * 2;
    const width = keepRows ? (region.right - region.left) * span / sourceSpan : cellWidth;
    const left = keepRows ? NOTEBOOK_LEFT + (region.left - NOTEBOOK_LEFT) * span / sourceSpan : NOTEBOOK_LEFT + col * cellWidth;
    const pad = Math.min(marks * 32, width * .52);
    return { row: displayRows.length - 1, col, left, width, clef, marks, pad };
  });
  const rows = displayRows.length;
  const displayedRegions = regions.map((r, i): SectionMeasure => ({
    ...r, row: cells[i].row, index: cells[i].col, left: cells[i].left, right: cells[i].left + cells[i].width,
  }));
  const sourceIndex = (point: StaffPoint) => {
    const row = rowAt(point.y, page.staffCount ?? 7);
    const candidates = byRow.get(row)!;
    return (candidates.find(({ region }) => point.x < region.right) ?? candidates[candidates.length - 1]).index;
  };
  const inCell = (point: StaffPoint, index: number) => {
    const r = regions[index];
    const cell = cells[index];
    return {
      x: cell.left + cell.pad + (point.x - r.left) * (cell.width - cell.pad) / (r.right - r.left),
      y: cell.row * ROW_HEIGHT + point.y - r.row * ROW_HEIGHT,
    };
  };
  const forward = (point: StaffPoint) => inCell(point, sourceIndex(point));
  const displayIndex = (point: StaffPoint) => {
    const row = Math.max(0, Math.min(rows - 1, Math.floor(point.y / ROW_HEIGHT)));
    return displayRows[row].find((i) => point.x < cells[i].left + cells[i].width) ?? displayRows[row].at(-1)!;
  };
  const inverse = (point: StaffPoint): StaffPoint => {
    const index = displayIndex(point);
    const r = regions[index];
    const cell = cells[index];
    return {
      x: r.left + (point.x - cell.left - cell.pad) * (r.right - r.left) / (cell.width - cell.pad),
      y: r.row * ROW_HEIGHT + point.y - cell.row * ROW_HEIGHT,
    };
  };
  // Headers occupy the reserved leading space, not the note coordinate
  // range. Drag their reference point by its *displayed* delta between
  // cells, then snap to the corresponding source measure.
  const sectionDrag = (source: StaffStamp, rendered: StaffStamp, start: StaffPoint, point: StaffPoint): StaffPoint => {
    const reference = { x: rendered.x + point.x - start.x, y: rendered.y + point.y - start.y };
    const target = displayIndex(reference);
    if (target === sourceIndex(source)) return { x: source.x, y: source.y };
    const { x, y } = placeSectionStamp(source, regions[target]);
    return { x, y };
  };
  const headerPoint = (index: number, glyph: string) => {
    const c = cells[index];
    return { x: c.left + c.pad / Math.max(1, c.marks) * (sectionKind(glyph) === "meter" && c.clef ? 1.5 : .5),
      y: sectionStaffY(glyph, c.row), size: Math.min(26, c.pad / Math.max(1, c.marks) * .86) };
  };
  const inheritedClefs = regions.flatMap((region, i) =>
    cells[i].clef && !region.clefChange ? [{ glyph: cells[i].clef!, ...headerPoint(i, cells[i].clef!) }] : []);
  const strokeOwners = new Map<string, string>();
  // Split only the displayed path at fold boundaries. The original stroke,
  // including its id, masks, and coordinates, remains untouched in the document.
  const strokes = page.strokes.flatMap((stroke) => {
    const pieces: { cell: number; points: StaffPoint[] }[] = [];
    const append = (cell: number, a: StaffPoint, b: StaffPoint) => {
      const last = pieces[pieces.length - 1];
      if (last?.cell === cell) last.points.push(inCell(b, cell));
      else pieces.push({ cell, points: [inCell(a, cell), inCell(b, cell)] });
    };
    if (stroke.points.length === 1) append(sourceIndex(stroke.points[0]), stroke.points[0], stroke.points[0]);
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1], b = stroke.points[i];
      const ts = [0, 1];
      const firstRow = rowAt(Math.min(a.y, b.y), page.staffCount ?? 7), lastRow = rowAt(Math.max(a.y, b.y), page.staffCount ?? 7);
      for (let row = firstRow; row <= lastRow; row++) for (const { region: r } of byRow.get(row) ?? []) {
        if (b.x !== a.x) {
          const t = (r.left - a.x) / (b.x - a.x), y = a.y + (b.y - a.y) * t;
          if (t > 0 && t < 1 && y >= r.row * ROW_HEIGHT && y < (r.row + 1) * ROW_HEIGHT) ts.push(t);
        }
        if (b.y !== a.y) {
          const t = (r.row * ROW_HEIGHT - a.y) / (b.y - a.y);
          if (t > 0 && t < 1) ts.push(t);
        }
      }
      const sorted = [...new Set(ts)].sort((x, y) => x - y);
      const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      for (let j = 1; j < sorted.length; j++) append(sourceIndex(at((sorted[j - 1] + sorted[j]) / 2)), at(sorted[j - 1]), at(sorted[j]));
    }
    return pieces.map((piece, index) => {
      const id = `${stroke.id}:portrait:${index}`;
      strokeOwners.set(id, stroke.id);
      const origin = stroke.points[0], projectedOrigin = piece.points[0];
      return { ...stroke, id, points: piece.points, erasures: stroke.erasures?.map((cut) => ({
        ...cut, points: cut.points.map((p) => {
          const mapped = inCell({ x: origin.x + p.x * stroke.width, y: origin.y + p.y * stroke.width }, piece.cell);
          return { x: (mapped.x - projectedOrigin.x) / stroke.width, y: (mapped.y - projectedOrigin.y) / stroke.width };
        }),
      })) };
    });
  });
  const projected: StaffPage = {
    ...page, staffCount: rows, strokes, layoutScale: NOTEBOOK_SPAN / span,
    stamps: page.stamps?.map((s) => {
      const i = sourceIndex(s), cell = cells[i];
      const pos = s.sectionStart && cell.pad ? headerPoint(i, s.glyph)
        : s.glyph === "barline" || s.glyph === "bar_line" ? { ...forward(s), x: forward(s).x - cell.pad } : forward(s);
      return { ...s, ...pos, measure: cell.col };
    }),
    anchor: page.anchor && forward(page.anchor),
    measureCounts: displayRows.map((row) => row.length),
  };
  return { page: projected, forward, inverse, sectionDrag, inheritedClefs, regions: displayedRegions, strokeOwners,
    firstMeasureInRow(point: StaffPoint) { return regions[displayRows[cells[sourceIndex(point)].row][0]]; } };
}
