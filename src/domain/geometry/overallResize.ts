export type OverallResizeDimensions = {
  width: number;
  depth: number;
  height: number;
};

export type OverallResizeFactors = {
  width: number;
  depth: number;
  height: number;
};

export type OverallResizeAnchor = {
  x: number;
  y: number;
  z: number;
};

export const OVERALL_DIMENSION_MIN_MM = 100;
export const OVERALL_DIMENSION_MAX_MM = 6000;

function normalizeDimension(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(OVERALL_DIMENSION_MAX_MM, Math.max(OVERALL_DIMENSION_MIN_MM, Math.round(value)));
}

export function createOverallResizePlan(
  current: OverallResizeDimensions,
  requested: OverallResizeDimensions,
) {
  const dimensions = {
    width: normalizeDimension(requested.width, current.width),
    depth: normalizeDimension(requested.depth, current.depth),
    height: normalizeDimension(requested.height, current.height),
  };
  return {
    dimensions,
    factors: {
      width: dimensions.width / Math.max(1, current.width),
      depth: dimensions.depth / Math.max(1, current.depth),
      height: dimensions.height / Math.max(1, current.height),
    } satisfies OverallResizeFactors,
  };
}

export function scaleWorldPointMm(
  point: [number, number, number],
  factors: OverallResizeFactors,
  anchor: OverallResizeAnchor = { x: 0, y: 0, z: 0 },
): [number, number, number] {
  return [
    anchor.x + (point[0] - anchor.x) * factors.width,
    anchor.y + (point[1] - anchor.y) * factors.height,
    anchor.z + (point[2] - anchor.z) * factors.depth,
  ];
}

export function resizePanelEnvelope(
  envelope: { width: number; thickness: number; depth: number },
  factors: OverallResizeFactors,
) {
  return {
    width: Math.max(1, Math.round(envelope.width * factors.width * 10) / 10),
    thickness: envelope.thickness,
    depth: Math.max(1, Math.round(envelope.depth * factors.depth * 10) / 10),
  };
}

export function dominantDirectionScale(
  direction: [number, number, number],
  factors: OverallResizeFactors,
) {
  const absolute = direction.map(Math.abs);
  const largest = Math.max(...absolute);
  if (largest === absolute[1]) return factors.height;
  if (largest === absolute[2]) return factors.depth;
  return factors.width;
}
