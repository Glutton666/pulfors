import { createPolygonOffsetGesture } from "@/lib/polygon-offset-gesture";
import { formatPolygonOffsetMs, polygonSlotDurationMs } from "@/lib/polygon-offset";

describe("polygon vertex timing gestures", () => {
  it("unlocks after two back-and-forth shakes without applying the shake's movement", () => {
    const gesture = createPolygonOffsetGesture(0.06, 400);
    [15, -15, 15, -15].forEach((x, i) => expect(gesture.update(x, 0, 50 * i)).toBeNull());
    expect(gesture.update(15, 0, 220)).toEqual({ ms: 24, offset: 0.06 });
    expect(gesture.update(-33, 0, 245)).toEqual({ ms: -24, offset: -0.06 });
    expect(gesture.update(700, 0, 260)).toEqual({ ms: 200, offset: 0.5 });
  });

  it("does not unlock on a tap, one-way drag, or mostly vertical movement", () => {
    const tap = createPolygonOffsetGesture(0, 500);
    expect(tap.update(4, 3, 100)).toBeNull();
    expect(tap.moved).toBe(false);
    const gesture = createPolygonOffsetGesture(0, 500);
    for (let i = 0; i < 20; i++) expect(gesture.update(i * 5, 0, i * 15)).toBeNull();
    expect(gesture.moved).toBe(true);
    [15, -15, 15, -15, 15].forEach((x, i) => expect(gesture.update(x, 50, 400 + 50 * i)).toBeNull());
  });

  it("uses the common speed, meter, and layer spacing for signed milliseconds", () => {
    expect(polygonSlotDurationMs(120, 2, 4, 4)).toBe(250);
    expect(polygonSlotDurationMs(120, 0.5, 3, 3)).toBe(1000);
    expect(formatPolygonOffsetMs(-24)).toBe("-24 ms");
    expect(formatPolygonOffsetMs(24)).toBe("+24 ms");
  });

  it("does not accumulate widely spaced reversals into a shake", () => {
    const gesture = createPolygonOffsetGesture(0, 500);
    [15, -15, 15, -15, 15].forEach((x, i) => expect(gesture.update(x, 0, 1000 * i)).toBeNull());
  });
});
