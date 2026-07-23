import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type ParallelClampParameters = {
  hole1Diameter: number;
  hole2Diameter: number;
  holeCenterDistance: number;
};

export type ParallelClampParameterKey = keyof ParallelClampParameters;

export type ParallelClampVariant = {
  boreDiameter: number;
  holeCenterDistance: number;
  length: number;
  width: number;
  height: number;
  screw: "M5";
};

export const parallelClampVariants: readonly ParallelClampVariant[] = [
  { boreDiameter: 6, holeCenterDistance: 10, length: 32, width: 12, height: 12, screw: "M5" },
  { boreDiameter: 6, holeCenterDistance: 15, length: 37, width: 12, height: 12, screw: "M5" },
  { boreDiameter: 6, holeCenterDistance: 20, length: 42, width: 12, height: 12, screw: "M5" },
  { boreDiameter: 6, holeCenterDistance: 25, length: 47, width: 12, height: 12, screw: "M5" },
  { boreDiameter: 8, holeCenterDistance: 15, length: 41, width: 15, height: 15, screw: "M5" },
  { boreDiameter: 8, holeCenterDistance: 20, length: 46, width: 15, height: 15, screw: "M5" },
  { boreDiameter: 8, holeCenterDistance: 25, length: 51, width: 15, height: 15, screw: "M5" },
  { boreDiameter: 8, holeCenterDistance: 30, length: 56, width: 15, height: 15, screw: "M5" },
  { boreDiameter: 10, holeCenterDistance: 15, length: 45, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 10, holeCenterDistance: 20, length: 50, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 10, holeCenterDistance: 25, length: 55, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 10, holeCenterDistance: 30, length: 60, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 12, holeCenterDistance: 15, length: 47, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 12, holeCenterDistance: 20, length: 52, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 12, holeCenterDistance: 25, length: 57, width: 20, height: 20, screw: "M5" },
  { boreDiameter: 12, holeCenterDistance: 30, length: 62, width: 20, height: 20, screw: "M5" },
] as const;

export const defaultParallelClampVariant = parallelClampVariants.find(({ boreDiameter, holeCenterDistance }) => boreDiameter === 10 && holeCenterDistance === 15)!;

export const defaultParallelClampParameters: ParallelClampParameters = {
  hole1Diameter: defaultParallelClampVariant.boreDiameter,
  hole2Diameter: defaultParallelClampVariant.boreDiameter,
  holeCenterDistance: defaultParallelClampVariant.holeCenterDistance,
};

export function parallelClampDiameterOptions(): number[] {
  return [...new Set(parallelClampVariants.map(({ boreDiameter }) => boreDiameter))];
}

export function parallelClampCenterDistanceOptions(boreDiameter: number): number[] {
  const resolvedDiameter = parallelClampDiameterOptions().reduce((closest, candidate) =>
    Math.abs(candidate - boreDiameter) < Math.abs(closest - boreDiameter) ? candidate : closest,
  );
  return parallelClampVariants
    .filter((variant) => variant.boreDiameter === resolvedDiameter)
    .map(({ holeCenterDistance }) => holeCenterDistance);
}

export function resolveParallelClampVariant(parameters: ParallelClampParameters): ParallelClampVariant {
  const requestedDiameter = Number.isFinite(parameters.hole1Diameter) && Number.isFinite(parameters.hole2Diameter)
    ? (parameters.hole1Diameter + parameters.hole2Diameter) / 2
    : defaultParallelClampVariant.boreDiameter;
  const diameter = parallelClampDiameterOptions().reduce((closest, candidate) =>
    Math.abs(candidate - requestedDiameter) < Math.abs(closest - requestedDiameter) ? candidate : closest,
  );
  const requestedCenterDistance = Number.isFinite(parameters.holeCenterDistance)
    ? parameters.holeCenterDistance
    : defaultParallelClampVariant.holeCenterDistance;
  return parallelClampVariants
    .filter((variant) => variant.boreDiameter === diameter)
    .reduce((closest, candidate) =>
      Math.abs(candidate.holeCenterDistance - requestedCenterDistance) < Math.abs(closest.holeCenterDistance - requestedCenterDistance) ? candidate : closest,
    );
}

export function resolveParallelClampParameters(parameters: ParallelClampParameters): ParallelClampParameters {
  const variant = resolveParallelClampVariant(parameters);
  return {
    hole1Diameter: variant.boreDiameter,
    hole2Diameter: variant.boreDiameter,
    holeCenterDistance: variant.holeCenterDistance,
  };
}

export function parallelClampModel(parameters: ParallelClampParameters): string {
  const variant = resolveParallelClampVariant(parameters);
  return `PARA-${variant.boreDiameter}-${variant.boreDiameter}-C${variant.holeCenterDistance}`;
}

export function parallelClampDimensions(parameters: ParallelClampParameters) {
  const variant = resolveParallelClampVariant(parameters);
  return { width: variant.length, length: variant.width, height: variant.height };
}

export function createParallelClampDefinition(parameters: ParallelClampParameters) {
  const variant = resolveParallelClampVariant(parameters);
  const resolved = resolveParallelClampParameters(parameters);
  const bodyLength = variant.length / 10;
  const bodyHeight = variant.height / 10;
  const bodyDepth = variant.width / 10;
  const boreDiameter = variant.boreDiameter / 10;
  const halfPitch = variant.holeCenterDistance / 20;
  const splitThickness = Math.max(0.08, bodyHeight * 0.045);
  const fastenerDiameter = 0.5;
  const edgeSpan = Math.max(0.2, (bodyLength - variant.holeCenterDistance / 10 - boreDiameter) / 2);
  const fastenerOffset = halfPitch + boreDiameter / 2 + edgeSpan / 2;
  const primitives: BooleanComponentPrimitive[] = [
    { shape: "box", size: [bodyLength, bodyHeight, bodyDepth], position: [0, 0, 0] },
    { shape: "cylinder", size: [boreDiameter, bodyDepth + 0.08, boreDiameter], position: [-halfPitch, 0, 0], rotation: [90, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [boreDiameter, bodyDepth + 0.08, boreDiameter], position: [halfPitch, 0, 0], rotation: [90, 0, 0], appearance: "cutout" },
    { shape: "box", size: [bodyLength + 0.08, splitThickness, bodyDepth + 0.08], position: [0, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [fastenerDiameter, bodyHeight + 0.08, fastenerDiameter], position: [-fastenerOffset, 0, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [fastenerDiameter, bodyHeight + 0.08, fastenerDiameter], position: [fastenerOffset, 0, 0], appearance: "cutout", feature: "drilled-hole" },
  ];
  return {
    variant,
    parameters: resolved,
    primitives,
    ports: [
      { id: "P1", axis: "z" as const, position: [-halfPitch, 0, 0] as [number, number, number], diameter: variant.boreDiameter },
      { id: "P2", axis: "z" as const, position: [halfPitch, 0, 0] as [number, number, number], diameter: variant.boreDiameter },
      { id: "LOCK-L", axis: "y" as const, position: [-fastenerOffset, 0, 0] as [number, number, number], diameter: 5 },
      { id: "LOCK-R", axis: "y" as const, position: [fastenerOffset, 0, 0] as [number, number, number], diameter: 5 },
    ],
  };
}
