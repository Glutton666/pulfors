export interface AppPreparationLayout {
  roomy: boolean;
  iconSize: number;
  contentMaxWidth: number;
  statusFontSize: number;
  statusBottom: number;
}

/**
 * Responsive geometry for the app's first-load surface.
 * Phone sizing deliberately follows the established dimensions; roomy tablet
 * and browser viewports get a larger icon, status label, and text column.
 */
export function getAppPreparationLayout(
  width: number,
  height: number,
  safeTop = 0,
  safeBottom = 0,
): AppPreparationLayout {
  const minDimension = Math.min(width, height);
  const roomy = height >= 400 && (minDimension >= 600 || width >= 900);

  if (!roomy) {
    return {
      roomy: false,
      iconSize: Math.max(120, Math.min(240, width * 0.56, height * 0.48)),
      contentMaxWidth: 420,
      statusFontSize: 13,
      statusBottom: Math.max(safeBottom, 24),
    };
  }

  const usableHeight = Math.max(0, height - safeTop - safeBottom);
  return {
    roomy: true,
    iconSize: Math.max(
      120,
      Math.min(360, width * 0.48, usableHeight * 0.7),
    ),
    contentMaxWidth: Math.min(560, width * 0.78),
    statusFontSize: 18,
    statusBottom: Math.max(safeBottom, 24),
  };
}
