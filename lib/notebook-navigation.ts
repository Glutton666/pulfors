import type { StaffNotebook } from "./staff-notebook";
import { rowAt } from "./staff-notebook-layout";
import type { NotebookPlan } from "./notebook-playback-plan";
import { notebookStampMeasure } from "./notebook-measures";

const commands = new Set(["repeat_start", "repeat_end", "repeat_both", "volta1", "volta2", "segno", "coda", "da_capo", "dal_segno", "dal_segno_coda", "da_capo_coda", "fine"]);
type Sign = { glyph: string; unit: number; id: string };
const invalid = (detail: string) => new Error(`반복·이동 기호를 확인해 주세요: ${detail} / Check navigation signs: ${detail}`);

/** Interpret only explicit stamps, at measure boundaries; never infer handwriting. */
export function followNotebookSigns(note: StaffNotebook, base: NotebookPlan, measuresPerRow: number, random = false, rng: () => number = Math.random): NotebookPlan {
  const count = base.chunks.length;
  const counts = base.rows.map((_, i) => base.chunks.filter((c) => c.row === i).length);
  const starts = counts.map((_, i) => counts.slice(0, i).reduce((a, b) => a + b, 0));
  const signs: Sign[] = base.rows.flatMap((row, rowIndex) => (note.pages[row.pageIndex].stamps ?? [])
    .filter((s) => commands.has(s.glyph) && rowAt(s.y, note.pages[row.pageIndex].staffCount ?? 7) === row.rowIndex)
    .map((s) => ({ id: s.id, glyph: s.glyph, unit: starts[rowIndex] +
      notebookStampMeasure(note.pages[row.pageIndex], s, { ...note.settings, measuresPerRow }) })));
  const at = (unit: number, glyph: string) => signs.some((s) => s.unit === unit && s.glyph === glyph);
  const unitsOf = (glyph: string) => signs.filter((s) => s.glyph === glyph).map((s) => s.unit).sort((a, b) => a - b);
  for (const sign of signs) if (signs.filter((s) => s.unit === sign.unit && s.glyph === sign.glyph).length > 1)
    throw invalid(`${sign.glyph}: 같은 마디에 중복 / duplicate in measure ${sign.unit + 1}`);
  const pairs: { start: number; end: number }[] = [], stack: number[] = [];
  for (let unit = 0; unit < count; unit++) {
    if (at(unit, "repeat_start")) stack.push(unit);
    if (at(unit, "repeat_end") || at(unit, "repeat_both")) pairs.push({ start: stack.pop() ?? 0, end: unit });
    if (at(unit, "repeat_both") && unit + 1 < count) stack.push(unit + 1);
  }
  if (stack.length) throw invalid(`반복 끝 없음 / missing repeat end (${stack[0] + 1})`);
  const endings = unitsOf("volta1").map((start) => {
    const pair = pairs.filter((p) => p.start <= start && p.end >= start).sort((a, b) => a.end - b.end)[0];
    if (!pair || !at(pair.end + 1, "volta2")) throw invalid(`1·2번 괄호의 반복 끝·다음 시작 확인 / unmatched endings (${start + 1})`);
    return { start, end: pair.end, pair };
  });
  if (unitsOf("volta2").some((unit) => !endings.some((e) => e.end + 1 === unit))) throw invalid("대응하는 1번 괄호 없음 / missing first ending");
  const jumps = signs.filter((s) => ["da_capo", "dal_segno", "dal_segno_coda", "da_capo_coda"].includes(s.glyph));
  const segnos = unitsOf("segno"), codas = unitsOf("coda");
  if (jumps.some((s) => s.glyph.startsWith("dal_segno")) && segnos.length !== 1) throw invalid("세뇨 목적지를 하나 지정 / specify one Segno");
  if (jumps.some((s) => s.glyph.endsWith("_coda")) && codas.length !== 2) throw invalid("코다 이동 지점과 목적지 두 곳 지정 / specify two Coda marks");
  if (jumps.some((s) => s.glyph.startsWith("dal_segno") && segnos[0] > s.unit)) throw invalid("D.S. 앞에 세뇨 지정 / Segno must precede D.S.");
  if (jumps.some((s) => s.glyph.endsWith("_coda") && !(codas[0] < s.unit && s.unit < codas[1])))
    throw invalid("첫 코다 → D.C./D.S. → 도착 코다 순서 / ambiguous Coda route");
  if (jumps.some((s) => jumps.filter((other) => other.unit === s.unit).length > 1)) throw invalid("같은 마디의 이동 명령 충돌 / conflicting jumps");
  const visits: number[] = [], repeatPass = new Map<number, number>(), usedJumps = new Set<string>();
  let unit = 0, returned = false, seekCoda = false;
  while (unit < count) {
    if (visits.length > 20000) throw invalid("끝나지 않는 경로 / non-terminating route");
    const ending = endings.find((e) => e.start === unit);
    if (ending && ((repeatPass.get(ending.end) ?? 0) > 0 || returned)) { unit = ending.end + 1; continue; }
    visits.push(unit);
    if (seekCoda && unit === codas[0]) { seekCoda = false; unit = codas[1]; continue; }
    if (at(unit, "fine") && (returned || !jumps.length)) break;
    const jump = jumps.find((s) => s.unit === unit && !usedJumps.has(s.id));
    if (jump) {
      usedJumps.add(jump.id); returned = true; seekCoda = jump.glyph.endsWith("_coda");
      unit = jump.glyph.startsWith("dal_segno") ? segnos[0] : 0;
      continue;
    }
    const pair = pairs.find((p) => p.end === unit);
    if (pair && !returned && !(repeatPass.get(unit) ?? 0)) {
      repeatPass.set(unit, 1);
      pairs.filter((p) => p !== pair && p.start >= pair.start && p.end < pair.end).forEach((p) => repeatPass.delete(p.end));
      unit = pair.start; continue;
    }
    unit++;
  }
  if (seekCoda) throw invalid("돌아온 경로에서 코다 이동 지점에 도달하지 못함 / unreachable To Coda");
  // Source block boundaries remain atomic, even when notation changes the route.
  visits.forEach((original, i) => {
    const chunk = base.chunks[original], next = base.chunks[original + 1];
    if (chunk.group && chunk.group === next?.group && visits[i + 1] !== original + 1)
      throw invalid("불러온 반복 블록 중간에서 이동할 수 없음 / jump splits a source block");
    const previous = base.chunks[original - 1];
    if (previous?.group && previous.group === chunk.group && visits[i - 1] !== original - 1)
      throw invalid("불러온 반복 블록 중간으로 이동할 수 없음 / jump enters a source block");
    const rowIndex = base.chunks[original].row, endOfRow = original === starts[rowIndex] + counts[rowIndex] - 1;
    if (endOfRow && base.rows[rowIndex].keepWithNext && visits[i + 1] !== original + 1)
      throw invalid("잇단음표·연결 기호의 묶음 중간에서 이동할 수 없음 / jump splits linked notation");
    if (original === starts[rowIndex] && base.rows[rowIndex - 1]?.keepWithNext && visits[i - 1] !== original - 1)
      throw invalid("잇단음표·연결 기호의 묶음 중간으로 이동할 수 없음 / jump enters linked notation");
  });
  // Merge every crossed interval. Shuffle closed musical sections, not targets.
  const spans: [number, number][] = [];
  visits.forEach((from, i) => { const to = visits[i + 1]; if (to !== undefined && to !== from + 1) spans.push([Math.min(from, to), Math.max(from, to)]); });
  base.chunks.forEach((chunk, i) => { if (chunk.group && chunk.group === base.chunks[i + 1]?.group) spans.push([i, i + 1]); });
  // A paper row is indivisible in the shuffled sheet.
  starts.forEach((start, i) => spans.push([start, start + counts[i] - 1]));
  base.rows.forEach((row, i) => { if (row.keepWithNext && i + 1 < base.rows.length) spans.push([starts[i], starts[i + 1] + counts[i + 1] - 1]); });
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  spans.forEach((span) => { const last = merged.at(-1); if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]); });
  const sections = merged.map(([low, high]) => visits.filter((v) => v >= low && v <= high)).filter((part) => part.length);
  if (random) for (let i = sections.length - 1; i > 0; i--) { const j = Math.floor(Math.max(0, Math.min(0.999999, rng())) * (i + 1)); [sections[i], sections[j]] = [sections[j], sections[i]]; }
  const order = random ? sections.flat() : visits;
  let durationMs = 0;
  const rowEnds: number[] = [], positionRows: number[] = [];
  const displayRows = random ? [] as NotebookPlan["rows"] : base.rows;
  const chunks = order.map((original, index) => {
    const chunk = base.chunks[original];
    durationMs += chunk.endMs - chunk.startMs;
    if (random && (!index || base.chunks[order[index - 1]].row !== chunk.row || order[index - 1] + 1 !== original))
      displayRows.push(base.rows[chunk.row]);
    rowEnds.push(durationMs); positionRows.push(random ? displayRows.length - 1 : chunk.row);
    return { ...chunk, row: positionRows[index] };
  });
  if (durationMs > 600000) throw new Error("NOTEBOOK_TOO_LONG");
  return { rows: displayRows, chunks, rowEnds, durationMs, positionRows };
}
