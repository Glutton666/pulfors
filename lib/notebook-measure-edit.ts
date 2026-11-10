import type { StaffNotebook } from "./staff-notebook";
import { notebookStampMeasure } from "./notebook-measures";

/**
 * Refresh derived measure metadata against the edited geometry. Manual lines
 * define the effective measures; old stamp.measure values cannot pin ownership
 * across a moved boundary. This step never moves objects or changes durations.
 * Automatic spacing, if requested, is a separate document transaction.
 */
export function prepareNotebookMeasureEdit(_before: StaffNotebook, next: StaffNotebook): StaffNotebook {
  return {
    ...next,
    pages: next.pages.map((page) => ({
      ...page,
      stamps: page.stamps?.map((s) => ({ ...s, measure: notebookStampMeasure(page, s, next.settings) })),
    })),
  };
}
