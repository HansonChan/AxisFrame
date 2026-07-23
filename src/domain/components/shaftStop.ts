import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type ShaftStopParameters = {
  innerDiameter: number;
  outerDiameter: number;
  thickness: number;
};

export type ShaftStopVariant = ShaftStopParameters & {
  thread: "M3" | "M4" | "M5" | "M6";
  throughHoleDiameter: number;
  counterboreDiameter: number;
  screwCenterOffset: number;
  counterboreDepth: number;
  slitWidth: number;
};

export type ShaftStopParameterKey = "innerDiameter" | "thickness";

export const shaftStopVariants: readonly ShaftStopVariant[] = [
  { innerDiameter: 3, thickness: 8, outerDiameter: 16, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 4.5, counterboreDepth: 2.2, slitWidth: 1 },
  { innerDiameter: 4, thickness: 8, outerDiameter: 18, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 5, counterboreDepth: 3, slitWidth: 1 },
  { innerDiameter: 5, thickness: 8, outerDiameter: 20, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 5.5, counterboreDepth: 4, slitWidth: 1 },
  { innerDiameter: 5, thickness: 10, outerDiameter: 22, thread: "M4", throughHoleDiameter: 4.5, counterboreDiameter: 7.5, screwCenterOffset: 6.5, counterboreDepth: 4, slitWidth: 1 },
  { innerDiameter: 6, thickness: 8, outerDiameter: 20, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 6, counterboreDepth: 4, slitWidth: 1 },
  { innerDiameter: 6, thickness: 10, outerDiameter: 20, thread: "M4", throughHoleDiameter: 4.5, counterboreDiameter: 7.5, screwCenterOffset: 6, counterboreDepth: 4, slitWidth: 1 },
  { innerDiameter: 8, thickness: 8, outerDiameter: 25, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 8, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 8, thickness: 10, outerDiameter: 25, thread: "M4", throughHoleDiameter: 4.5, counterboreDiameter: 7.5, screwCenterOffset: 8, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 8, thickness: 12, outerDiameter: 25, thread: "M5", throughHoleDiameter: 5.5, counterboreDiameter: 9, screwCenterOffset: 9, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 8, thickness: 15, outerDiameter: 25, thread: "M6", throughHoleDiameter: 6.6, counterboreDiameter: 12, screwCenterOffset: 9, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 10, thickness: 8, outerDiameter: 30, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 9, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 10, thickness: 10, outerDiameter: 30, thread: "M4", throughHoleDiameter: 4.5, counterboreDiameter: 7.5, screwCenterOffset: 9, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 10, thickness: 12, outerDiameter: 30, thread: "M5", throughHoleDiameter: 5.5, counterboreDiameter: 9, screwCenterOffset: 9, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 10, thickness: 15, outerDiameter: 35, thread: "M6", throughHoleDiameter: 6.6, counterboreDiameter: 12, screwCenterOffset: 10, counterboreDepth: 6, slitWidth: 1.5 },
  { innerDiameter: 12, thickness: 8, outerDiameter: 30, thread: "M3", throughHoleDiameter: 3.4, counterboreDiameter: 6, screwCenterOffset: 10, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 12, thickness: 10, outerDiameter: 30, thread: "M4", throughHoleDiameter: 4.5, counterboreDiameter: 7.5, screwCenterOffset: 10, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 12, thickness: 12, outerDiameter: 30, thread: "M5", throughHoleDiameter: 5.5, counterboreDiameter: 9, screwCenterOffset: 10, counterboreDepth: 5, slitWidth: 1.5 },
  { innerDiameter: 12, thickness: 15, outerDiameter: 35, thread: "M6", throughHoleDiameter: 6.6, counterboreDiameter: 12, screwCenterOffset: 11, counterboreDepth: 6, slitWidth: 1.5 },
] as const;

export const defaultShaftStopVariant = shaftStopVariants.find(({ innerDiameter, thickness }) => innerDiameter === 10 && thickness === 10)!;

export const defaultShaftStopParameters: ShaftStopParameters = {
  innerDiameter: defaultShaftStopVariant.innerDiameter,
  outerDiameter: defaultShaftStopVariant.outerDiameter,
  thickness: defaultShaftStopVariant.thickness,
};

export function shaftStopInnerDiameterOptions(): number[] {
  return [...new Set(shaftStopVariants.map(({ innerDiameter }) => innerDiameter))];
}

export function shaftStopThicknessOptions(innerDiameter: number): number[] {
  const diameter = shaftStopInnerDiameterOptions().reduce((closest, candidate) =>
    Math.abs(candidate - innerDiameter) < Math.abs(closest - innerDiameter) ? candidate : closest,
  );
  return shaftStopVariants.filter((variant) => variant.innerDiameter === diameter).map(({ thickness }) => thickness);
}

export function resolveShaftStopVariant(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">): ShaftStopVariant {
  const requestedDiameter = Number.isFinite(parameters.innerDiameter) ? parameters.innerDiameter : defaultShaftStopVariant.innerDiameter;
  const diameter = shaftStopInnerDiameterOptions().reduce((closest, candidate) =>
    Math.abs(candidate - requestedDiameter) < Math.abs(closest - requestedDiameter) ? candidate : closest,
  );
  const requestedThickness = Number.isFinite(parameters.thickness) ? parameters.thickness : defaultShaftStopVariant.thickness;
  return shaftStopVariants
    .filter((variant) => variant.innerDiameter === diameter)
    .reduce((closest, candidate) =>
      Math.abs(candidate.thickness - requestedThickness) < Math.abs(closest.thickness - requestedThickness) ? candidate : closest,
    );
}

export function resolveShaftStopParameters(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">): ShaftStopParameters {
  const variant = resolveShaftStopVariant(parameters);
  return { innerDiameter: variant.innerDiameter, outerDiameter: variant.outerDiameter, thickness: variant.thickness };
}

export function shaftStopModel(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">): string {
  const variant = resolveShaftStopVariant(parameters);
  return `LIMITER-D${variant.innerDiameter}-B${variant.thickness}-OD${variant.outerDiameter}`;
}

export function shaftStopDimensions(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">) {
  const variant = resolveShaftStopVariant(parameters);
  return { width: variant.outerDiameter, length: variant.outerDiameter, height: variant.thickness };
}

export function createShaftStopDefinition(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">) {
  const variant = resolveShaftStopVariant(parameters);
  const resolved = resolveShaftStopParameters(parameters);
  const outerDiameter = variant.outerDiameter / 10;
  const innerDiameter = variant.innerDiameter / 10;
  const thickness = variant.thickness / 10;
  const slitWidth = variant.slitWidth / 10;
  const screwCenterZ = -variant.screwCenterOffset / 10;
  const throughHoleDiameter = variant.throughHoleDiameter / 10;
  const counterboreDiameter = variant.counterboreDiameter / 10;
  const counterboreLength = variant.counterboreDepth / 10 + 0.02;
  const counterboreCenterX = outerDiameter / 2 - counterboreLength / 2 + 0.01;
  const slitLength = Math.max(0.08, outerDiameter / 2 - innerDiameter / 2 + 0.04);
  const slitCenterZ = -(innerDiameter / 2 + slitLength / 2 - 0.02);

  const primitives: BooleanComponentPrimitive[] = [
    { shape: "cylinder", size: [outerDiameter, thickness, outerDiameter], position: [0, 0, 0] },
    { shape: "cylinder", size: [innerDiameter, thickness + 0.08, innerDiameter], position: [0, 0, 0], appearance: "cutout" },
    { shape: "box", size: [slitWidth, thickness + 0.08, slitLength], position: [0, 0, slitCenterZ], appearance: "cutout" },
    { shape: "cylinder", size: [throughHoleDiameter, outerDiameter + 0.08, throughHoleDiameter], position: [0, 0, screwCenterZ], rotation: [0, 0, 90], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [counterboreDiameter, counterboreLength, counterboreDiameter], position: [counterboreCenterX, 0, screwCenterZ], rotation: [0, 0, 90], appearance: "cutout", feature: "drilled-hole" },
  ];

  return {
    variant,
    parameters: resolved,
    primitives,
    ports: [
      { id: "SHAFT", axis: "y" as const, position: [0, 0, 0] as [number, number, number], diameter: variant.innerDiameter },
      { id: "LOCK", axis: "x" as const, position: [outerDiameter / 2, 0, screwCenterZ] as [number, number, number], diameter: Number(variant.thread.slice(1)) },
    ],
  };
}
