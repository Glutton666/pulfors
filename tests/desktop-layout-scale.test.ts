import { Platform, useWindowDimensions } from "react-native";
import { useScale } from "@/lib/scale";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (factory: () => unknown) => factory(),
}));
jest.mock("react-native", () => ({
  Platform: { OS: "web" },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  useWindowDimensions: jest.fn(),
}));

function layout(width: number, height: number, platform = "web") {
  Object.assign(Platform, { OS: platform });
  jest.mocked(useWindowDimensions).mockReturnValue({ width, height, scale: 1, fontScale: 1 });
  return useScale();
}

describe("web desktop scale isolation", () => {
  test.each([[1280, 720], [1440, 900], [1920, 1080], [1100, 650]])(
    "fits the desktop dial and utility rail at %s×%s",
    (width, height) => {
      const s = layout(width, height);
      expect(s.isWideWebDesktop).toBe(true);
      expect(s.scale).toBe(1.35);
      expect(s.dialSize).toBeLessThanOrEqual(520);
      expect(s.dialSize + 64).toBeLessThan(height - 101);
      expect(s.contentMaxWidth).toBeLessThanOrEqual(Math.min(width - 64, 1600));
    },
  );

  test.each([[1099, 800], [1280, 649], [1200, 1400], [1300, 1300], [667, 375], [375, 812]])(
    "falls back without hiding portrait tools at %s×%s",
    (width, height) => expect(layout(width, height).isWideWebDesktop).toBe(false),
  );

  test("responds to resize rather than retaining the initial desktop flag", () => {
    expect(layout(1440, 900).isWideWebDesktop).toBe(true);
    expect(layout(960, 600).isWideWebDesktop).toBe(false);
    expect(layout(1440, 900).isWideWebDesktop).toBe(true);
  });

  test("keeps phone portrait geometry unchanged", () => {
    const s = layout(375, 812);
    expect(s.scale).toBe(1);
    expect(s.dialSize).toBe(350);
    expect(s.contentMaxWidth).toBeUndefined();
  });

  test.each([
    [1004, 632, 380],
    [1024, 768, 470],
  ])("uses the landscape tablet primary column at %s×%s", (width, height, minExpectedDial) => {
    const s = layout(width, height);
    const availableHeight = height - 101 - 16;
    const contentWidth = Math.min(width, s.contentMaxWidth ?? width);
    const innerWidth = contentWidth - s.ms(16, 0.3) * 2;
    const dialColumnWidth = innerWidth * 5 / 8 - 60;

    expect(s.isTablet).toBe(true);
    expect(s.isLandscape).toBe(true);
    expect(s.dialSize).toBeGreaterThan(minExpectedDial);
    expect(s.dialSize).toBeLessThanOrEqual(availableHeight * 0.76);
    expect(s.dialSize).toBeLessThanOrEqual(dialColumnWidth);
    expect(s.contentMaxWidth).toBe(width - 48);
  });

  test("grows the 4:3 portrait tablet dial within vertical and column bounds", () => {
    const s = layout(768, 1024);
    const availableHeight = 1024 - 101 - 24;
    const contentWidth = Math.min(768, s.contentMaxWidth ?? 768);

    expect(s.isTablet).toBe(true);
    expect(s.isLandscape).toBe(false);
    expect(s.dialSize).toBeGreaterThan(540);
    expect(s.dialSize).toBeLessThanOrEqual(1024 * 0.54);
    expect(s.dialSize).toBeLessThanOrEqual((availableHeight - 56) * 5 / 7);
    expect(s.dialSize).toBeLessThan(availableHeight);
    expect(s.dialSize).toBeLessThanOrEqual(contentWidth - 64);
    expect(s.contentMaxWidth).toBe(720);
  });

  test("keeps phone landscape geometry unchanged", () => {
    const s = layout(667, 375);
    expect(s.dialSize).toBe(248);
    expect(s.contentMaxWidth).toBeUndefined();
  });

  test("uses more of the available height for the beat dial in roomy landscape", () => {
    const s = layout(1004, 451);
    expect(s.isLandscape).toBe(true);
    expect(s.dialSize).toBe(324);
    expect(s.dialSize).toBeLessThanOrEqual(451 - 101 - 16 - 10);
  });

  test("keeps compact phone landscape dial geometry unchanged", () => {
    const s = layout(667, 375);
    expect(s.dialSize).toBe(248);
  });

  test.each(["ios", "android"])("does not adopt desktop geometry on %s tablets", (platform) => {
    const s = layout(1280, 800, platform);
    expect(s.isWideWebDesktop).toBe(false);
    expect(s.contentMaxWidth).toBe(1232);
    expect(s.scale).toBe(800 / 375);
  });
});
