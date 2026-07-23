export type ShaftInstanceInput = {
  baseDiameterMm: number;
  baseLengthMm: number;
  diameterMm: number;
  lengthScalePercent: number;
};

export type ShaftInstanceParameters = {
  diameterMm: number;
  lengthMm: number;
  previewLengthScene: number;
};

const roundMm = (value: number) => Math.round(value * 10) / 10;

export function resolveShaftInstanceParameters({
  baseDiameterMm,
  baseLengthMm,
  diameterMm,
  lengthScalePercent,
}: ShaftInstanceInput): ShaftInstanceParameters {
  const diameter = Math.max(1, Number.isFinite(diameterMm) ? diameterMm : baseDiameterMm);
  const length = Math.max(1, baseLengthMm * Math.max(0.1, lengthScalePercent) / 100);
  return {
    diameterMm: roundMm(diameter),
    lengthMm: roundMm(length),
    previewLengthScene: Math.min(4.2, Math.max(1.5, length / 285)),
  };
}
