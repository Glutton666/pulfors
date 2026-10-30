import { fixedModeDialAnchor } from "@/lib/mode-dial-logic";

describe("fixed mode fan safe-area placement", () => {
  it.each([0, 20, 44, 59])("clears the native top inset of %i without moving off center", (topInset) => {
    expect(fixedModeDialAnchor(393, topInset, false)).toEqual({ x: 196.5, y: topInset });
  });
  it("does not mistake the web body reserve for a notch", () => {
    expect(fixedModeDialAnchor(768, 67, true)).toEqual({ x: 384, y: 0 });
  });
  it("clears a landscape side-notch viewport without a negative top anchor", () => {
    expect(fixedModeDialAnchor(852, -1, false)).toEqual({ x: 426, y: 0 });
  });
});
