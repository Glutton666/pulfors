export interface RotationPoint {
  x: number;
  y: number;
}

export interface EasterEggTrigger {
  isHighRange: boolean;
}

const MIN_GESTURE_DELTA = 10;
const ROTATION_EPSILON = 0.001;

export function usesSharedEasterEggGesture(
  currentMode: string,
  showPolygon: boolean,
): boolean {
  return currentMode !== "beat" || showPolygon;
}

function angleBetween(center: RotationPoint, point: RotationPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
}

function wrapAngle(delta: number): number {
  let wrapped = delta % 360;
  if (wrapped > 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped;
}

/**
 * Accumulates same-direction circular gestures across touch/mouse releases.
 * The tracker has no platform dependencies so web and native input adapters
 * can share the exact threshold and direction behavior.
 */
export class EasterEggRotationTracker {
  private readonly threshold: number;
  private totalRotation = 0;
  private gestureRotation = 0;
  private previousAngle: number | null = null;
  private center: RotationPoint | null = null;
  private dragging = false;

  constructor(threshold = 2520) {
    this.threshold = threshold;
  }

  start(center: RotationPoint, point: RotationPoint): void {
    this.center = center;
    this.previousAngle = angleBetween(center, point);
    this.gestureRotation = 0;
    this.dragging = true;
  }

  move(point: RotationPoint): number {
    if (!this.dragging || !this.center) return 0;
    const currentAngle = angleBetween(this.center, point);
    if (this.previousAngle === null) {
      this.previousAngle = currentAngle;
      return this.gestureRotation;
    }

    this.gestureRotation += wrapAngle(currentAngle - this.previousAngle);
    this.previousAngle = currentAngle;
    return this.gestureRotation;
  }

  end(): EasterEggTrigger | null {
    if (!this.dragging) return null;
    const delta = this.gestureRotation;
    this.dragging = false;
    this.center = null;
    this.previousAngle = null;
    this.gestureRotation = 0;

    if (Math.abs(delta) <= MIN_GESTURE_DELTA) return null;

    const direction = delta > 0 ? 1 : -1;
    if (this.totalRotation === 0 || Math.sign(this.totalRotation) === direction) {
      this.totalRotation += delta;
    } else {
      this.totalRotation = delta;
    }

    if (Math.abs(this.totalRotation) < this.threshold - ROTATION_EPSILON) return null;

    const isHighRange = Math.abs(this.totalRotation) >= this.threshold * 1.5 - ROTATION_EPSILON;
    this.totalRotation = 0;
    return { isHighRange };
  }

  reset(): void {
    this.totalRotation = 0;
    this.gestureRotation = 0;
    this.previousAngle = null;
    this.center = null;
    this.dragging = false;
  }
}