export type PegboardParameters = {
  holeDiameter: number;
  holePitch: number;
  edgeMargin: number;
};

export type PegboardHole = {
  xMm: number;
  zMm: number;
};

export const defaultPegboardParameters: PegboardParameters = {
  holeDiameter: 6,
  holePitch: 25,
  edgeMargin: 25,
};

export function resolvePegboardParameters(
  widthMm: number,
  lengthMm: number,
  parameters: PegboardParameters,
): PegboardParameters {
  const width = Math.max(1, widthMm);
  const length = Math.max(1, lengthMm);
  const maximumDiameter = Math.max(1, Math.min(width, length));
  const holeDiameter = Math.max(1, Math.min(maximumDiameter, Number.isFinite(parameters.holeDiameter) ? parameters.holeDiameter : defaultPegboardParameters.holeDiameter));
  const holePitch = Math.max(holeDiameter + 1, Number.isFinite(parameters.holePitch) ? parameters.holePitch : defaultPegboardParameters.holePitch);
  const edgeMargin = Math.max(holeDiameter / 2, Math.min(Math.min(width, length) / 2, Number.isFinite(parameters.edgeMargin) ? parameters.edgeMargin : defaultPegboardParameters.edgeMargin));
  return { holeDiameter, holePitch, edgeMargin };
}

export function calculatePegboardHoles(
  widthMm: number,
  lengthMm: number,
  parameters: PegboardParameters = defaultPegboardParameters,
): PegboardHole[] {
  const width = Math.max(1, widthMm);
  const length = Math.max(1, lengthMm);
  const resolved = resolvePegboardParameters(width, length, parameters);
  const diameter = resolved.holeDiameter;
  const pitch = resolved.holePitch;
  const margin = resolved.edgeMargin;
  const usableWidth = Math.max(0, width - margin * 2);
  const usableLength = Math.max(0, length - margin * 2);
  const columns = Math.floor(usableWidth / pitch) + 1;
  const rows = Math.floor(usableLength / pitch) + 1;
  const startX = -(columns - 1) * pitch / 2;
  const startZ = -(rows - 1) * pitch / 2;

  return Array.from({ length: rows * columns }, (_, index) => ({
    xMm: startX + index % columns * pitch,
    zMm: startZ + Math.floor(index / columns) * pitch,
  }));
}
