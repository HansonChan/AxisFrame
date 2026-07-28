export const ROTATION_DIAL_MAX_VIEWPORT_FRACTION = 2 / 3;
export const ROTATION_DIAL_LABEL_EXTENT_FACTOR = 1.16;

export function rotationDialMaxRadiusPixels(viewportWidth: number, viewportHeight: number) {
  const shortSide = Math.max(0, Math.min(viewportWidth, viewportHeight));
  return shortSide * ROTATION_DIAL_MAX_VIEWPORT_FRACTION / 2 / ROTATION_DIAL_LABEL_EXTENT_FACTOR;
}

export function clampRotationDialWorldRadius({
  desiredRadius,
  pixelsPerWorldUnit,
  viewportWidth,
  viewportHeight,
}: {
  desiredRadius: number;
  pixelsPerWorldUnit: number;
  viewportWidth: number;
  viewportHeight: number;
}) {
  if (!Number.isFinite(desiredRadius) || desiredRadius <= 0) return 0;
  if (!Number.isFinite(pixelsPerWorldUnit) || pixelsPerWorldUnit <= 0) return desiredRadius;
  return Math.min(
    desiredRadius,
    rotationDialMaxRadiusPixels(viewportWidth, viewportHeight) / pixelsPerWorldUnit,
  );
}

export function rotationDialEnvelopeDiameterPixels(radius: number, pixelsPerWorldUnit: number) {
  return Math.max(0, radius * pixelsPerWorldUnit * 2 * ROTATION_DIAL_LABEL_EXTENT_FACTOR);
}
