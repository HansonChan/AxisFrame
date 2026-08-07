export const ROTATION_DIAL_INCREMENT_DEG = 5;
export const ROTATION_SNAP_INCREMENT_DEG = 45;
export const ROTATION_SNAP_THRESHOLD_DEG = 3;

export type RotationSnapResult = {
  valueDeg: number;
  displayDeg: number;
  snapped: boolean;
  snapTargetDeg: number | null;
};

export function normalizeRotation360(valueDeg: number): number {
  if (!Number.isFinite(valueDeg)) return 0;
  const normalized = ((valueDeg % 360) + 360) % 360;
  const rounded = Math.round(normalized * 10) / 10;
  return Object.is(rounded, -0) || rounded === 360 ? 0 : rounded;
}

export function snapRotationNearIncrement(
  valueDeg: number,
  incrementDeg = ROTATION_SNAP_INCREMENT_DEG,
  thresholdDeg = ROTATION_SNAP_THRESHOLD_DEG,
): RotationSnapResult {
  if (!Number.isFinite(valueDeg)) {
    return { valueDeg: 0, displayDeg: 0, snapped: false, snapTargetDeg: null };
  }
  const safeIncrement = Math.max(1, Math.abs(incrementDeg));
  const safeThreshold = Math.max(0, Math.min(Math.abs(thresholdDeg), safeIncrement / 2));
  const nearest = Math.round(valueDeg / safeIncrement) * safeIncrement;
  const snapped = Math.abs(valueDeg - nearest) <= safeThreshold;
  const resolved = snapped ? nearest : valueDeg;
  return {
    valueDeg: resolved,
    displayDeg: normalizeRotation360(resolved),
    snapped,
    snapTargetDeg: snapped ? normalizeRotation360(nearest) : null,
  };
}
