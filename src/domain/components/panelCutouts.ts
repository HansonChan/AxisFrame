export type PanelCutout = {
  id: string;
  xMm: number;
  zMm: number;
  diameterMm: number;
};

export type PanelCutoutDimensions = {
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
};

export type PanelCutoutClearances = {
  leftMm: number;
  rightMm: number;
  frontMm: number;
  backMm: number;
};

export type PanelCutoutReference = "front-left" | "front-right" | "back-left" | "back-right" | "center";

export type PanelCutoutReferenceOffset = {
  horizontalMm: number;
  verticalMm: number;
};

export type PanelCutoutReferenceDistances = Record<PanelCutoutReference, number>;

const MIN_DIAMETER_MM = 2;
const MIN_EDGE_CLEARANCE_MM = 2;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function referencePoint(
  reference: PanelCutoutReference,
  dimensions: PanelCutoutDimensions,
): { xMm: number; zMm: number } {
  if (reference === "front-right") return { xMm: dimensions.widthMm, zMm: 0 };
  if (reference === "back-left") return { xMm: 0, zMm: dimensions.lengthMm };
  if (reference === "back-right") return { xMm: dimensions.widthMm, zMm: dimensions.lengthMm };
  if (reference === "center") return { xMm: dimensions.widthMm / 2, zMm: dimensions.lengthMm / 2 };
  return { xMm: 0, zMm: 0 };
}

export function normalizePanelCutout(
  cutout: PanelCutout,
  dimensions: PanelCutoutDimensions,
): PanelCutout {
  const width = Math.max(MIN_DIAMETER_MM + MIN_EDGE_CLEARANCE_MM * 2, finiteOr(dimensions.widthMm, 100));
  const length = Math.max(MIN_DIAMETER_MM + MIN_EDGE_CLEARANCE_MM * 2, finiteOr(dimensions.lengthMm, 100));
  const maximumDiameter = Math.max(MIN_DIAMETER_MM, Math.min(width, length) - MIN_EDGE_CLEARANCE_MM * 2);
  const diameterMm = Math.min(maximumDiameter, Math.max(MIN_DIAMETER_MM, finiteOr(cutout.diameterMm, 10)));
  const radius = diameterMm / 2;
  const minimum = radius + MIN_EDGE_CLEARANCE_MM;
  return {
    ...cutout,
    diameterMm: roundToTenth(diameterMm),
    xMm: roundToTenth(Math.min(width - minimum, Math.max(minimum, finiteOr(cutout.xMm, width / 2)))),
    zMm: roundToTenth(Math.min(length - minimum, Math.max(minimum, finiteOr(cutout.zMm, length / 2)))),
  };
}

export function normalizePanelCutouts(
  cutouts: readonly PanelCutout[] | undefined,
  dimensions: PanelCutoutDimensions,
): PanelCutout[] {
  return (cutouts ?? []).map((cutout) => normalizePanelCutout(cutout, dimensions));
}

export function panelCutoutClearances(
  cutout: PanelCutout,
  dimensions: PanelCutoutDimensions,
): PanelCutoutClearances {
  const normalized = normalizePanelCutout(cutout, dimensions);
  const radius = normalized.diameterMm / 2;
  return {
    leftMm: roundToTenth(normalized.xMm - radius),
    rightMm: roundToTenth(dimensions.widthMm - normalized.xMm - radius),
    frontMm: roundToTenth(normalized.zMm - radius),
    backMm: roundToTenth(dimensions.lengthMm - normalized.zMm - radius),
  };
}

export function panelCutoutReferenceOffset(
  cutout: PanelCutout,
  dimensions: PanelCutoutDimensions,
  reference: PanelCutoutReference,
): PanelCutoutReferenceOffset {
  const normalized = normalizePanelCutout(cutout, dimensions);
  if (reference === "front-right") {
    return { horizontalMm: roundToTenth(dimensions.widthMm - normalized.xMm), verticalMm: normalized.zMm };
  }
  if (reference === "back-left") {
    return { horizontalMm: normalized.xMm, verticalMm: roundToTenth(dimensions.lengthMm - normalized.zMm) };
  }
  if (reference === "back-right") {
    return {
      horizontalMm: roundToTenth(dimensions.widthMm - normalized.xMm),
      verticalMm: roundToTenth(dimensions.lengthMm - normalized.zMm),
    };
  }
  if (reference === "center") {
    return {
      horizontalMm: roundToTenth(normalized.xMm - dimensions.widthMm / 2),
      verticalMm: roundToTenth(normalized.zMm - dimensions.lengthMm / 2),
    };
  }
  return { horizontalMm: normalized.xMm, verticalMm: normalized.zMm };
}

export function movePanelCutoutFromReference(
  cutout: PanelCutout,
  dimensions: PanelCutoutDimensions,
  reference: PanelCutoutReference,
  offset: PanelCutoutReferenceOffset,
): PanelCutout {
  const horizontal = finiteOr(offset.horizontalMm, 0);
  const vertical = finiteOr(offset.verticalMm, 0);
  const point = referencePoint(reference, dimensions);
  const xMm = reference === "front-right" || reference === "back-right"
    ? point.xMm - Math.abs(horizontal)
    : reference === "center"
      ? point.xMm + horizontal
      : point.xMm + Math.abs(horizontal);
  const zMm = reference === "back-left" || reference === "back-right"
    ? point.zMm - Math.abs(vertical)
    : reference === "center"
      ? point.zMm + vertical
      : point.zMm + Math.abs(vertical);
  return normalizePanelCutout({ ...cutout, xMm, zMm }, dimensions);
}

export function panelCutoutReferenceDistances(
  cutout: PanelCutout,
  dimensions: PanelCutoutDimensions,
): PanelCutoutReferenceDistances {
  const normalized = normalizePanelCutout(cutout, dimensions);
  return Object.fromEntries(([
    "front-left",
    "front-right",
    "back-left",
    "back-right",
    "center",
  ] as PanelCutoutReference[]).map((reference) => {
    const point = referencePoint(reference, dimensions);
    return [reference, roundToTenth(Math.hypot(normalized.xMm - point.xMm, normalized.zMm - point.zMm))];
  })) as PanelCutoutReferenceDistances;
}

export function createCenteredPanelCutout(
  id: string,
  dimensions: PanelCutoutDimensions,
  diameterMm = 10,
): PanelCutout {
  return normalizePanelCutout({
    id,
    xMm: dimensions.widthMm / 2,
    zMm: dimensions.lengthMm / 2,
    diameterMm,
  }, dimensions);
}
