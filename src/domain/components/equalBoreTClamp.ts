import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type EqualBoreTClampVariant = {
  diameter: number;
  a: number;
  b: number;
  c: number;
  e: number;
  f: number;
  lockingBolt: "M4" | "M5";
};

export const equalBoreTClampVariants: readonly EqualBoreTClampVariant[] = [
  { diameter: 8, a: 40, b: 15, c: 15, e: 13, f: 15, lockingBolt: "M4" },
  { diameter: 10, a: 45, b: 20, c: 20, e: 15, f: 20, lockingBolt: "M5" },
  { diameter: 12, a: 50, b: 20, c: 20, e: 16, f: 22, lockingBolt: "M5" },
  { diameter: 15, a: 60, b: 25, c: 25, e: 17.5, f: 30, lockingBolt: "M5" },
] as const;

export const defaultEqualBoreTClampVariant = equalBoreTClampVariants.find(({ diameter }) => diameter === 10)!;

export function resolveEqualBoreTClampVariant(diameter: number): EqualBoreTClampVariant {
  if (!Number.isFinite(diameter)) return defaultEqualBoreTClampVariant;
  return equalBoreTClampVariants.reduce((closest, candidate) =>
    Math.abs(candidate.diameter - diameter) < Math.abs(closest.diameter - diameter) ? candidate : closest,
  );
}

export function equalBoreTClampModel(diameter: number): string {
  const variant = resolveEqualBoreTClampVariant(diameter);
  return `EQUAL-T-${variant.diameter}-${variant.diameter}`;
}

export function equalBoreTClampDimensions(variant: EqualBoreTClampVariant) {
  return { width: variant.a, length: variant.c, height: variant.b };
}

export function createEqualBoreTClampDefinition(diameter: number) {
  const variant = resolveEqualBoreTClampVariant(diameter);
  const bodyLength = variant.a / 10;
  const bodyHeight = variant.b / 10;
  const bodyDepth = variant.c / 10;
  const boreDiameter = variant.diameter / 10;
  const leftEdge = -bodyLength / 2;
  const rightEdge = bodyLength / 2;
  const leftBoreX = leftEdge + variant.e / 10;
  const rightBoreX = rightEdge - variant.f / 10;
  const slotThickness = Math.max(0.08, boreDiameter * 0.14);
  const leftSlotLength = Math.max(0.08, leftBoreX - leftEdge + boreDiameter / 2);
  const rightSlotLength = Math.max(0.08, rightEdge - rightBoreX + boreDiameter / 2);
  const lockingDiameter = Number(variant.lockingBolt.slice(1)) / 10;
  const leftLockX = (leftEdge + leftBoreX - boreDiameter / 2) / 2;
  const rightLockX = (rightBoreX + boreDiameter / 2 + rightEdge) / 2;

  const primitives: BooleanComponentPrimitive[] = [
    { shape: "box", size: [bodyLength, bodyHeight, bodyDepth], position: [0, 0, 0] },
    { shape: "cylinder", size: [boreDiameter, bodyDepth + 0.08, boreDiameter], position: [leftBoreX, 0, 0], rotation: [90, 0, 0], appearance: "cutout" },
    { shape: "box", size: [leftSlotLength, slotThickness, bodyDepth + 0.08], position: [leftEdge + leftSlotLength / 2, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [boreDiameter, bodyHeight + 0.08, boreDiameter], position: [rightBoreX, 0, 0], appearance: "cutout" },
    { shape: "box", size: [rightSlotLength, bodyHeight + 0.08, slotThickness], position: [rightEdge - rightSlotLength / 2, 0, 0], appearance: "cutout" },
    { shape: "cylinder", size: [lockingDiameter, bodyHeight + 0.08, lockingDiameter], position: [leftLockX, 0, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [lockingDiameter, bodyDepth + 0.08, lockingDiameter], position: [rightLockX, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "drilled-hole" },
  ];

  return {
    variant,
    primitives,
    ports: [
      { id: "P1-Z", axis: "z" as const, position: [leftBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
      { id: "P2-Y", axis: "y" as const, position: [rightBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
      { id: "LOCK-Z", axis: "y" as const, position: [leftLockX, 0, 0] as [number, number, number], diameter: Number(variant.lockingBolt.slice(1)) },
      { id: "LOCK-Y", axis: "z" as const, position: [rightLockX, 0, 0] as [number, number, number], diameter: Number(variant.lockingBolt.slice(1)) },
    ],
  };
}
