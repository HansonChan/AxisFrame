import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type EqualBoreCrossClampVariant = {
  diameter: number;
  length: number;
  width: number;
  height: number;
  holeCenterDistance: number;
};

export const equalBoreCrossClampVariants: readonly EqualBoreCrossClampVariant[] = [
  { diameter: 5, length: 34, width: 12, height: 12, holeCenterDistance: 10 },
  { diameter: 6, length: 34, width: 12, height: 12, holeCenterDistance: 10 },
  { diameter: 8, length: 41, width: 15, height: 15, holeCenterDistance: 13 },
  { diameter: 10, length: 45, width: 20, height: 20, holeCenterDistance: 15 },
  { diameter: 12, length: 49, width: 20, height: 20, holeCenterDistance: 17 },
  { diameter: 14, length: 53, width: 20, height: 20, holeCenterDistance: 19 },
  { diameter: 15, length: 57, width: 25, height: 25, holeCenterDistance: 21 },
  { diameter: 16, length: 57, width: 25, height: 25, holeCenterDistance: 21 },
  { diameter: 17, length: 61, width: 25, height: 25, holeCenterDistance: 23 },
  { diameter: 18, length: 61, width: 25, height: 25, holeCenterDistance: 23 },
  { diameter: 20, length: 69, width: 25, height: 25, holeCenterDistance: 25 },
] as const;

export const defaultEqualBoreCrossClampVariant = equalBoreCrossClampVariants.find(({ diameter }) => diameter === 10)!;

export function resolveEqualBoreCrossClampVariant(diameter: number): EqualBoreCrossClampVariant {
  if (!Number.isFinite(diameter)) return defaultEqualBoreCrossClampVariant;
  return equalBoreCrossClampVariants.reduce((closest, candidate) =>
    Math.abs(candidate.diameter - diameter) < Math.abs(closest.diameter - diameter) ? candidate : closest,
  );
}

export function equalBoreCrossClampModel(diameter: number): string {
  const resolved = resolveEqualBoreCrossClampVariant(diameter);
  return `EQUAL-CROSS-${resolved.diameter}-${resolved.diameter}`;
}

export function equalBoreCrossClampDimensions(variant: EqualBoreCrossClampVariant) {
  return {
    width: variant.length,
    length: variant.width,
    height: variant.height,
  };
}

export function createEqualBoreCrossClampDefinition(diameter: number) {
  const variant = resolveEqualBoreCrossClampVariant(diameter);
  const bodyLength = variant.length / 10;
  const bodyWidth = variant.width / 10;
  const bodyHeight = variant.height / 10;
  const boreDiameter = variant.diameter / 10;
  const halfPitch = variant.holeCenterDistance / 20;
  const leftBoreX = -halfPitch;
  const rightBoreX = halfPitch;
  const leftEdge = -bodyLength / 2;
  const rightEdge = bodyLength / 2;
  const slotThickness = Math.max(0.08, boreDiameter * 0.16);
  const leftSlotLength = Math.max(0.08, leftBoreX - leftEdge);
  const rightSlotLength = Math.max(0.08, rightEdge - rightBoreX);

  const primitives: BooleanComponentPrimitive[] = [
    { shape: "box", size: [bodyLength, bodyHeight, bodyWidth], position: [0, 0, 0] },
    { shape: "cylinder", size: [boreDiameter, bodyHeight + 0.04, boreDiameter], position: [leftBoreX, 0, 0], appearance: "cutout" },
    { shape: "box", size: [leftSlotLength + 0.02, bodyHeight + 0.04, slotThickness], position: [(leftEdge + leftBoreX) / 2, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [boreDiameter, bodyWidth + 0.04, boreDiameter], position: [rightBoreX, 0, 0], rotation: [90, 0, 0], appearance: "cutout" },
    { shape: "box", size: [rightSlotLength + 0.02, slotThickness, bodyWidth + 0.04], position: [(rightBoreX + rightEdge) / 2, 0, 0], appearance: "cutout" },
  ];

  return {
    variant,
    primitives,
    ports: [
      { id: "P1-Y", axis: "y" as const, position: [leftBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
      { id: "P2-Z", axis: "z" as const, position: [rightBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
    ],
  };
}
