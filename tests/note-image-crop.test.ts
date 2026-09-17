import {
  clampNoteImageCropToFrame,
  fitNoteImageFrame,
  getNoteImagePanBounds,
  normalizeNoteImageCrop,
} from "@/lib/note-image-crop";

describe("normalizeNoteImageCrop", () => {
  test("clamps persisted framing to supported bounds", () => {
    expect(normalizeNoteImageCrop({ scale: 8, x: -2, y: 1 }))
      .toEqual({ scale: 3, x: -0.5, y: 0.5 });
  });

  test("rejects malformed framing values", () => {
    expect(normalizeNoteImageCrop({ scale: Number.NaN, x: 0, y: 0 })).toBeUndefined();
    expect(normalizeNoteImageCrop({ scale: 1, x: "0", y: 0 })).toBeUndefined();
  });

  test("prevents blank edges at scale 1 and after zooming out", () => {
    expect(getNoteImagePanBounds(1000, 500, 300, 600, 1)).toEqual({ x: 1.5, y: 0 });
    expect(clampNoteImageCropToFrame(
      { scale: 1, x: 0.5, y: 0.5 },
      1000,
      500,
      300,
      600,
    )).toEqual({ scale: 1, x: 0.5, y: 0 });
  });

  test("preserves and bounds a saved frame aspect ratio", () => {
    expect(normalizeNoteImageCrop({ scale: 1, x: 0, y: 0, aspectRatio: 0.25 }))
      .toEqual({ scale: 1, x: 0, y: 0, aspectRatio: 0.4 });
  });

  test("fits the saved frame inside portrait and landscape playback areas", () => {
    expect(fitNoteImageFrame(390, 844, 0.5)).toEqual({ width: 390, height: 780 });
    expect(fitNoteImageFrame(844, 390, 0.5)).toEqual({ width: 195, height: 390 });
  });
});