import { fixedModeDialAnchor, MODE_DIAL_ICON_SIZE, MODE_DIAL_FAN_RADIUS } from "@/lib/mode-dial-logic";

describe("fixed mode fan safe-area placement", () => {
  it.each([0, 20, 44, 59])("clears the native top inset of %i without moving off center", (topInset) => {
    const anchor = fixedModeDialAnchor(393, topInset, false);
    expect(anchor).toEqual({ x: 196.5, y: topInset + 34 });
    expect(anchor.y - MODE_DIAL_ICON_SIZE / 2).toBe(topInset + 8);
  });
  it("does not mistake the web body reserve for a notch", () => {
    expect(fixedModeDialAnchor(768, 67, true)).toEqual({ x: 384, y: 0 });
  });
  it("clears a landscape side-notch viewport without a negative top anchor", () => {
    expect(fixedModeDialAnchor(852, -1, false)).toEqual({ x: 426, y: 34 });
  });
  it.each([{ top: 0, left: 59, right: 0 }, { top: 0, left: 0, right: 59 }])(
    "keeps the complete fan inside landscape side cutouts: %o", (insets) => {
      const anchor = fixedModeDialAnchor(852, 0, false, insets);
      expect(anchor.x - MODE_DIAL_FAN_RADIUS).toBeGreaterThanOrEqual(insets.left + 8);
      expect(anchor.x + MODE_DIAL_FAN_RADIUS).toBeLessThanOrEqual(852 - insets.right - 8);
    },
  );
  it("uses real web safe-area insets but ignores the unrelated body reserve", () => {
    expect(fixedModeDialAnchor(393, 67, true, { top: 59, left: 0, right: 0 }))
      .toEqual({ x: 196.5, y: 93 });
  });
  it("prefers current safe-area data after rotation over an older header measurement", () => {
    expect(fixedModeDialAnchor(393, 20, false, { top: 59, left: 0, right: 0 }).y).toBe(93);
  });
});
