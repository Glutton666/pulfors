export interface SubdivisionCellLayoutInput {
  containerWidth: number;
  cellCount: number;
  preferredCellSize: number;
  preferredGap: number;
  hintWidth?: number;
}

export interface SubdivisionCellLayout {
  cellSize: number;
  gap: number;
  radius: number;
  fontSize: number;
}

const MIN_CELL_SIZE = 14;
const MAX_CELL_SIZE = 30;

/**
 * Keeps subdivision controls compact on large screens while allowing a dense
 * pattern to shrink enough to fit inside its measured container.
 */
export function getSubdivisionCellLayout({
  containerWidth,
  cellCount,
  preferredCellSize,
  preferredGap,
  hintWidth = 16,
}: SubdivisionCellLayoutInput): SubdivisionCellLayout {
  const safeCount = Math.max(1, cellCount);
  const baseCellSize = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, preferredCellSize));
  const gap = Math.max(0, Math.min(4, preferredGap));
  const availableWidth = containerWidth > 0 ? containerWidth - hintWidth * 2 : 0;
  const fittedCellSize = availableWidth > 0
    ? Math.floor((availableWidth - gap * (safeCount - 1)) / safeCount)
    : baseCellSize;
  const cellSize = Math.max(MIN_CELL_SIZE, Math.min(baseCellSize, fittedCellSize));

  return {
    cellSize,
    gap,
    radius: Math.max(4, Math.round(cellSize * 4 / baseCellSize)),
    fontSize: Math.min(11, Math.max(7, Math.round(cellSize * 11 / baseCellSize))),
  };
}