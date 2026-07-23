import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type RoundFixedBaseVariant = {
  innerDiameter: number;
  bossDiameter: number;
  flangeDiameter: number;
  hubProjection: number;
  flangeThickness: number;
  mountingHolePcd: number;
  mountingHoleDiameter: number;
  setScrew: "M4" | "M5";
  setScrewDiameter: number;
};

export const roundFixedBaseVariants: readonly RoundFixedBaseVariant[] = [
  { innerDiameter: 8, bossDiameter: 25, flangeDiameter: 39, hubProjection: 13, flangeThickness: 5, mountingHolePcd: 32, mountingHoleDiameter: 3.5, setScrew: "M4", setScrewDiameter: 4 },
  { innerDiameter: 10, bossDiameter: 30, flangeDiameter: 49, hubProjection: 15, flangeThickness: 5, mountingHolePcd: 40, mountingHoleDiameter: 4.5, setScrew: "M5", setScrewDiameter: 5 },
  { innerDiameter: 12, bossDiameter: 32, flangeDiameter: 52, hubProjection: 16, flangeThickness: 6, mountingHolePcd: 42, mountingHoleDiameter: 4.5, setScrew: "M5", setScrewDiameter: 5 },
] as const;

export const defaultRoundFixedBaseVariant = roundFixedBaseVariants.find(({ innerDiameter }) => innerDiameter === 10)!;

export function resolveRoundFixedBaseVariant(innerDiameter: number): RoundFixedBaseVariant {
  if (!Number.isFinite(innerDiameter)) return defaultRoundFixedBaseVariant;
  return roundFixedBaseVariants.reduce((closest, candidate) =>
    Math.abs(candidate.innerDiameter - innerDiameter) < Math.abs(closest.innerDiameter - innerDiameter) ? candidate : closest,
  );
}

export function roundFixedBaseModel(innerDiameter: number): string {
  const variant = resolveRoundFixedBaseVariant(innerDiameter);
  return `ROUND-BASE-${variant.innerDiameter}-D${variant.flangeDiameter}`;
}

export function roundFixedBaseDimensions(variant: RoundFixedBaseVariant) {
  return {
    width: variant.flangeDiameter,
    length: variant.flangeDiameter,
    height: variant.hubProjection + variant.flangeThickness,
  };
}

export function createRoundFixedBaseDefinition(innerDiameter: number) {
  const variant = resolveRoundFixedBaseVariant(innerDiameter);
  const flangeDiameter = variant.flangeDiameter / 10;
  const bossDiameter = variant.bossDiameter / 10;
  const boreDiameter = variant.innerDiameter / 10;
  const flangeThickness = variant.flangeThickness / 10;
  const hubProjection = variant.hubProjection / 10;
  const totalHeight = flangeThickness + hubProjection;
  const bottomY = -totalHeight / 2;
  const flangeCenterY = bottomY + flangeThickness / 2;
  const hubCenterY = bottomY + flangeThickness + hubProjection / 2;
  const mountingHoleDiameter = variant.mountingHoleDiameter / 10;
  const setScrewDiameter = variant.setScrewDiameter / 10;
  const mountingHoleRadius = variant.mountingHolePcd / 20;
  const cutoutHeight = totalHeight + 0.08;

  const primitives: BooleanComponentPrimitive[] = [
    { shape: "cylinder", size: [flangeDiameter, flangeThickness, flangeDiameter], position: [0, flangeCenterY, 0] },
    { shape: "cylinder", size: [bossDiameter, hubProjection, bossDiameter], position: [0, hubCenterY, 0] },
    { shape: "cylinder", size: [boreDiameter, cutoutHeight, boreDiameter], position: [0, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [mountingHoleDiameter, flangeThickness + 0.08, mountingHoleDiameter], position: [mountingHoleRadius, flangeCenterY, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [mountingHoleDiameter, flangeThickness + 0.08, mountingHoleDiameter], position: [-mountingHoleRadius, flangeCenterY, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [mountingHoleDiameter, flangeThickness + 0.08, mountingHoleDiameter], position: [0, flangeCenterY, mountingHoleRadius], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [mountingHoleDiameter, flangeThickness + 0.08, mountingHoleDiameter], position: [0, flangeCenterY, -mountingHoleRadius], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [setScrewDiameter, bossDiameter + 0.08, setScrewDiameter], position: [0, hubCenterY, 0], rotation: [0, 0, 90], appearance: "cutout", feature: "drilled-hole" },
  ];

  return {
    variant,
    primitives,
    ports: [
      { id: "SHAFT", axis: "y" as const, position: [0, hubCenterY, 0] as [number, number, number], diameter: variant.innerDiameter },
      { id: "MOUNT-X+", axis: "y" as const, position: [mountingHoleRadius, flangeCenterY, 0] as [number, number, number], diameter: variant.mountingHoleDiameter },
      { id: "MOUNT-X-", axis: "y" as const, position: [-mountingHoleRadius, flangeCenterY, 0] as [number, number, number], diameter: variant.mountingHoleDiameter },
      { id: "MOUNT-Z+", axis: "y" as const, position: [0, flangeCenterY, mountingHoleRadius] as [number, number, number], diameter: variant.mountingHoleDiameter },
      { id: "MOUNT-Z-", axis: "y" as const, position: [0, flangeCenterY, -mountingHoleRadius] as [number, number, number], diameter: variant.mountingHoleDiameter },
      { id: "LOCK", axis: "x" as const, position: [bossDiameter / 2, hubCenterY, 0] as [number, number, number], diameter: variant.setScrewDiameter },
    ],
  };
}
