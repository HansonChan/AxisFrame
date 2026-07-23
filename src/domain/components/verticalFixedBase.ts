import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type VerticalFixedBaseVariant = {
  model: "SK8" | "SK10" | "SK12" | "SK13" | "SK16";
  shaftDiameter: number;
  h: number;
  e: number;
  w: number;
  l: number;
  f: number;
  g: number;
  p: number;
  b: number;
  s: number;
  lockingBolt: "M4";
  mountingBolt: "M5";
  weightKg: number;
};

export const verticalFixedBaseVariants: readonly VerticalFixedBaseVariant[] = [
  { model: "SK8", shaftDiameter: 8, h: 20, e: 21, w: 42, l: 14, f: 32.8, g: 6, p: 18, b: 32, s: 5.5, lockingBolt: "M4", mountingBolt: "M5", weightKg: 0.024 },
  { model: "SK10", shaftDiameter: 10, h: 20, e: 21, w: 42, l: 14, f: 32.8, g: 6, p: 18, b: 32, s: 5.5, lockingBolt: "M4", mountingBolt: "M5", weightKg: 0.024 },
  { model: "SK12", shaftDiameter: 12, h: 23, e: 21, w: 42, l: 14, f: 37.5, g: 6, p: 20, b: 32, s: 5.5, lockingBolt: "M4", mountingBolt: "M5", weightKg: 0.03 },
  { model: "SK13", shaftDiameter: 13, h: 23, e: 21, w: 42, l: 14, f: 37.5, g: 6, p: 20, b: 32, s: 5.5, lockingBolt: "M4", mountingBolt: "M5", weightKg: 0.03 },
  { model: "SK16", shaftDiameter: 16, h: 27, e: 24, w: 48, l: 16, f: 44, g: 8, p: 25, b: 38, s: 5.5, lockingBolt: "M4", mountingBolt: "M5", weightKg: 0.04 },
] as const;

export const defaultVerticalFixedBaseVariant = verticalFixedBaseVariants.find(({ model }) => model === "SK10")!;

export function resolveVerticalFixedBaseVariant(modelOrShaftDiameter: string | number): VerticalFixedBaseVariant {
  if (typeof modelOrShaftDiameter === "string") {
    const normalized = modelOrShaftDiameter.trim().toUpperCase();
    return verticalFixedBaseVariants.find(({ model }) => model === normalized) ?? defaultVerticalFixedBaseVariant;
  }
  if (!Number.isFinite(modelOrShaftDiameter)) return defaultVerticalFixedBaseVariant;
  return verticalFixedBaseVariants.reduce((closest, candidate) =>
    Math.abs(candidate.shaftDiameter - modelOrShaftDiameter) < Math.abs(closest.shaftDiameter - modelOrShaftDiameter) ? candidate : closest,
  );
}

export function verticalFixedBaseDimensions(variant: VerticalFixedBaseVariant) {
  return { width: variant.w, length: variant.l, height: variant.f };
}

export function createVerticalFixedBaseDefinition(modelOrShaftDiameter: string | number) {
  const variant = resolveVerticalFixedBaseVariant(modelOrShaftDiameter);
  const width = variant.w / 10;
  const depth = variant.l / 10;
  const totalHeight = variant.f / 10;
  const baseThickness = variant.g / 10;
  const boreDiameter = variant.shaftDiameter / 10;
  const boreCenterY = -totalHeight / 2 + variant.h / 10;
  const baseCenterY = -totalHeight / 2 + baseThickness / 2;
  const baseTopY = -totalHeight / 2 + baseThickness;
  const upperWidth = variant.e / 10;
  const pedestalWidth = variant.p / 10;
  const upperBottomY = Math.max(baseTopY, boreCenterY - boreDiameter / 2 - 0.2);
  const pedestalHeight = Math.max(0.08, upperBottomY - baseTopY + 0.02);
  const upperHeight = totalHeight / 2 - upperBottomY;
  const mountHoleDiameter = variant.s / 10;
  const mountHalfPitch = variant.b / 20;
  const clampSlitWidth = Math.max(0.08, boreDiameter * 0.12);
  const clampSlitHeight = totalHeight / 2 - boreCenterY + 0.02;
  const lockDiameter = 0.4;
  const lockY = Math.min(totalHeight / 2 - lockDiameter * 0.65, boreCenterY + boreDiameter / 2 + 0.22);

  const primitives: BooleanComponentPrimitive[] = [
    { shape: "box", size: [width, baseThickness, depth], position: [0, baseCenterY, 0] },
    { shape: "box", size: [pedestalWidth, pedestalHeight, depth], position: [0, baseTopY + pedestalHeight / 2 - 0.01, 0] },
    { shape: "box", size: [upperWidth, upperHeight, depth], position: [0, upperBottomY + upperHeight / 2, 0] },
    { shape: "cylinder", size: [boreDiameter, depth + 0.08, boreDiameter], position: [0, boreCenterY, 0], rotation: [90, 0, 0], appearance: "cutout" },
    { shape: "box", size: [clampSlitWidth, clampSlitHeight, depth + 0.08], position: [0, boreCenterY + clampSlitHeight / 2, 0], appearance: "cutout" },
    { shape: "cylinder", size: [mountHoleDiameter, baseThickness + 0.08, mountHoleDiameter], position: [-mountHalfPitch, baseCenterY, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [mountHoleDiameter, baseThickness + 0.08, mountHoleDiameter], position: [mountHalfPitch, baseCenterY, 0], appearance: "cutout", feature: "drilled-hole" },
    { shape: "cylinder", size: [lockDiameter, upperWidth + 0.08, lockDiameter], position: [0, lockY, 0], rotation: [0, 0, 90], appearance: "cutout", feature: "drilled-hole" },
  ];

  return {
    variant,
    primitives,
    ports: [
      { id: "SHAFT", axis: "z" as const, position: [0, boreCenterY, 0] as [number, number, number], diameter: variant.shaftDiameter },
      { id: "MOUNT-L", axis: "y" as const, position: [-mountHalfPitch, baseCenterY, 0] as [number, number, number], diameter: variant.s },
      { id: "MOUNT-R", axis: "y" as const, position: [mountHalfPitch, baseCenterY, 0] as [number, number, number], diameter: variant.s },
      { id: "LOCK", axis: "x" as const, position: [upperWidth / 2, lockY, 0] as [number, number, number], diameter: 4 },
    ],
  };
}
