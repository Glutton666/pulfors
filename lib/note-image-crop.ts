import type { NoteImageCrop } from "@/lib/storage";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function normalizeNoteImageCrop(value: unknown): NoteImageCrop | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const crop = value as Partial<NoteImageCrop>;
  if (
    typeof crop.scale !== "number" ||
    typeof crop.x !== "number" ||
    typeof crop.y !== "number" ||
    !Number.isFinite(crop.scale) ||
    !Number.isFinite(crop.x) ||
    !Number.isFinite(crop.y)
  ) {
    return undefined;
  }
  return {
    scale: clamp(crop.scale, 1, 3),
    x: clamp(crop.x, -0.5, 0.5),
    y: clamp(crop.y, -0.5, 0.5),
    ...(typeof crop.aspectRatio === "number" && Number.isFinite(crop.aspectRatio)
      ? { aspectRatio: clamp(crop.aspectRatio, 0.4, 2.2) }
      : {}),
  };
}

export function getNoteImagePanBounds(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  scale: number,
): { x: number; y: number } {
  if (
    imageWidth <= 0 ||
    imageHeight <= 0 ||
    frameWidth <= 0 ||
    frameHeight <= 0
  ) {
    const fallback = Math.max(0, (scale - 1) / 2);
    return { x: fallback, y: fallback };
  }
  const coverScale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const renderedWidth = imageWidth * coverScale * scale;
  const renderedHeight = imageHeight * coverScale * scale;
  return {
    x: Math.max(0, (renderedWidth - frameWidth) / (2 * frameWidth)),
    y: Math.max(0, (renderedHeight - frameHeight) / (2 * frameHeight)),
  };
}

export function clampNoteImageCropToFrame(
  crop: NoteImageCrop,
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): NoteImageCrop {
  const normalized = normalizeNoteImageCrop(crop) ?? { scale: 1, x: 0, y: 0 };
  const bounds = getNoteImagePanBounds(
    imageWidth,
    imageHeight,
    frameWidth,
    frameHeight,
    normalized.scale,
  );
  return {
    scale: normalized.scale,
    x: clamp(normalized.x, -bounds.x, bounds.x),
    y: clamp(normalized.y, -bounds.y, bounds.y),
    ...(normalized.aspectRatio ? { aspectRatio: normalized.aspectRatio } : {}),
  };
}

export function fitNoteImageFrame(
  containerWidth: number,
  containerHeight: number,
  aspectRatio: number,
): { width: number; height: number } {
  if (containerWidth <= 0 || containerHeight <= 0 || aspectRatio <= 0) {
    return { width: 0, height: 0 };
  }
  if (containerWidth / containerHeight > aspectRatio) {
    return { width: containerHeight * aspectRatio, height: containerHeight };
  }
  return { width: containerWidth, height: containerWidth / aspectRatio };
}