import { getAppPreparationLayout } from "../components/app-preparation-layout";

describe("app preparation responsive layout", () => {
  test("preserves phone icon, column, and status sizing", () => {
    const layout = getAppPreparationLayout(375, 812, 44, 34);

    expect(layout.roomy).toBe(false);
    expect(layout.iconSize).toBeCloseTo(210);
    expect(layout.contentMaxWidth).toBe(420);
    expect(layout.statusFontSize).toBe(13);
    expect(layout.statusBottom).toBe(34);
  });

  test("enlarges the icon and status for tablet portrait", () => {
    const layout = getAppPreparationLayout(768, 1024, 24, 24);

    expect(layout.roomy).toBe(true);
    expect(layout.iconSize).toBe(360);
    expect(layout.contentMaxWidth).toBe(560);
    expect(layout.statusFontSize).toBe(18);
  });

  test("uses a larger capped icon in tablet landscape", () => {
    const layout = getAppPreparationLayout(1024, 768, 24, 24);

    expect(layout.roomy).toBe(true);
    expect(layout.iconSize).toBe(360);
  });

  test("enlarges for wide browser viewports, bounded by the window height", () => {
    const layout = getAppPreparationLayout(1440, 900);

    expect(layout.roomy).toBe(true);
    expect(layout.iconSize).toBe(360);
    expect(layout.contentMaxWidth).toBe(560);
  });

  test.each([
    [844, 390],
    [1200, 360],
  ])("keeps short windows compact at %s×%s", (width, height) => {
    const layout = getAppPreparationLayout(width, height);

    expect(layout.roomy).toBe(false);
    expect(layout.iconSize).toBeLessThanOrEqual(240);
    expect(layout.statusFontSize).toBe(13);
  });

  test("recomputes geometry when the live viewport changes", () => {
    const phone = getAppPreparationLayout(390, 844);
    const tablet = getAppPreparationLayout(1024, 768);

    expect(tablet.iconSize).toBeGreaterThan(phone.iconSize);
    expect(tablet.roomy).toBe(true);
  });
});
