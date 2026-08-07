import type { BooleanComponentPrimitive } from "./componentBooleanGeometry";

export type EqualBoreSwivelClampVariant = {
  diameter: number;
  totalLength: number;
  halfLength: number;
  bodyWidth: number;
  bodyHeight: number;
  holeCenterDistance: number;
  lockingBolt: "M5";
};

export type EqualBoreSwivelClampAngles = {
  leftDeg: number;
  rightDeg: number;
};

export const defaultEqualBoreSwivelClampAngles: Readonly<EqualBoreSwivelClampAngles> = {
  leftDeg: 0,
  rightDeg: 0,
};

export const equalBoreSwivelClampVariants: readonly EqualBoreSwivelClampVariant[] = [
  { diameter: 8, totalLength: 55, halfLength: 32, bodyWidth: 20, bodyHeight: 20, holeCenterDistance: 26, lockingBolt: "M5" },
  { diameter: 10, totalLength: 58, halfLength: 34, bodyWidth: 20, bodyHeight: 20, holeCenterDistance: 28, lockingBolt: "M5" },
  { diameter: 12, totalLength: 62, halfLength: 36, bodyWidth: 20, bodyHeight: 20, holeCenterDistance: 30, lockingBolt: "M5" },
  { diameter: 15, totalLength: 68, halfLength: 39, bodyWidth: 20, bodyHeight: 20, holeCenterDistance: 33, lockingBolt: "M5" },
] as const;

export const defaultEqualBoreSwivelClampVariant = equalBoreSwivelClampVariants.find(({ diameter }) => diameter === 10)!;

export const equalBoreSwivelPivotDisplayAssumption = {
  bossDiameter: 8,
  recessDiameter: 8.4,
  minimumEngagementDepth: 1.6,
  projection: 0.2,
  pinDiameter: 3,
} as const;

export function resolveEqualBoreSwivelClampVariant(diameter: number): EqualBoreSwivelClampVariant {
  if (!Number.isFinite(diameter)) return defaultEqualBoreSwivelClampVariant;
  return equalBoreSwivelClampVariants.reduce((closest, candidate) =>
    Math.abs(candidate.diameter - diameter) < Math.abs(closest.diameter - diameter) ? candidate : closest,
  );
}

export function equalBoreSwivelClampModel(diameter: number): string {
  const variant = resolveEqualBoreSwivelClampVariant(diameter);
  return `EQUAL-SWIVEL-${variant.diameter}-${variant.diameter}`;
}

export function normalizeEqualBoreSwivelClampAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return Math.max(-180, Math.min(180, angle));
}

function rotateBoreDirection(angleDeg: number): [number, number, number] {
  const angle = angleDeg * Math.PI / 180;
  return [0, -Math.sin(angle), Math.cos(angle)];
}

export function resolveEqualBoreSwivelClampAngles(
  angles?: Partial<EqualBoreSwivelClampAngles>,
): EqualBoreSwivelClampAngles {
  return {
    leftDeg: normalizeEqualBoreSwivelClampAngle(angles?.leftDeg ?? 0),
    rightDeg: normalizeEqualBoreSwivelClampAngle(angles?.rightDeg ?? 0),
  };
}

export function equalBoreSwivelClampDimensions(
  variant: EqualBoreSwivelClampVariant,
  requestedAngles: Partial<EqualBoreSwivelClampAngles> = defaultEqualBoreSwivelClampAngles,
) {
  const angles = resolveEqualBoreSwivelClampAngles(requestedAngles);
  const sideCrossSections = [angles.leftDeg, angles.rightDeg].map((angle) => {
    const radians = angle * Math.PI / 180;
    return {
      height: Math.abs(Math.cos(radians)) * variant.bodyHeight + Math.abs(Math.sin(radians)) * variant.bodyWidth,
      depth: Math.abs(Math.sin(radians)) * variant.bodyHeight + Math.abs(Math.cos(radians)) * variant.bodyWidth,
    };
  });
  const rounded = (value: number) => Math.round(value * 1000) / 1000;
  return {
    width: variant.totalLength,
    length: rounded(Math.max(...sideCrossSections.map(({ depth }) => depth))),
    height: rounded(Math.max(...sideCrossSections.map(({ height }) => height))),
  };
}

export function createEqualBoreSwivelClampDefinition(
  diameter: number,
  requestedAngles: Partial<EqualBoreSwivelClampAngles> = defaultEqualBoreSwivelClampAngles,
) {
  const variant = resolveEqualBoreSwivelClampVariant(diameter);
  const angles = resolveEqualBoreSwivelClampAngles(requestedAngles);
  const bodyLength = variant.totalLength / 10;
  const bodyDepth = variant.bodyWidth / 10;
  const bodyHeight = variant.bodyHeight / 10;
  const boreDiameter = variant.diameter / 10;
  const halfPitch = variant.holeCenterDistance / 20;
  const seamDepth = 0.06;
  const visibleHalfLength = (bodyLength - seamDepth) / 2;
  const halfCenterOffset = seamDepth / 2 + visibleHalfLength / 2;
  const leftEdge = -bodyLength / 2;
  const rightEdge = bodyLength / 2;
  const leftBoreX = -halfPitch;
  const rightBoreX = halfPitch;
  const slotThickness = Math.max(0.08, boreDiameter * 0.12);
  const leftSlotLength = leftBoreX - leftEdge + boreDiameter / 2;
  const rightSlotLength = rightEdge - rightBoreX + boreDiameter / 2;
  const lockingDiameter = 0.5;
  const leftLockX = (leftEdge + leftBoreX - boreDiameter / 2) / 2;
  const rightLockX = (rightBoreX + boreDiameter / 2 + rightEdge) / 2;
  const pivot = equalBoreSwivelPivotDisplayAssumption;
  const pivotBossDiameter = pivot.bossDiameter / 10;
  const pivotRecessDiameter = pivot.recessDiameter / 10;
  const stockOverlapDepth = Math.max(0, (variant.halfLength * 2 - variant.totalLength) / 10);
  const pivotDepth = Math.max(pivot.minimumEngagementDepth / 10, stockOverlapDepth);
  const pivotProjection = pivot.projection / 10;
  const pivotPinDiameter = pivot.pinDiameter / 10;
  const edgeRadius = 0.08;
  const leftInnerFace = -seamDepth / 2;
  const rightInnerFace = seamDepth / 2;
  const pivotBossLength = pivotDepth + pivotProjection;
  const pivotBossCenterX = leftInnerFace - pivotProjection + pivotBossLength / 2;
  const pivotRecessCenterX = rightInnerFace + pivotDepth / 2;

  const sidePrimitive = (
    primitive: BooleanComponentPrimitive,
    angleDeg: number,
  ): BooleanComponentPrimitive => {
    const radians = angleDeg * Math.PI / 180;
    const [x, y, z] = primitive.position;
    return {
      ...primitive,
      position: [
        x,
        y * Math.cos(radians) - z * Math.sin(radians),
        y * Math.sin(radians) + z * Math.cos(radians),
      ],
      rotation: [(primitive.rotation?.[0] ?? 0) + angleDeg, primitive.rotation?.[1] ?? 0, primitive.rotation?.[2] ?? 0],
    };
  };
  const primitives: BooleanComponentPrimitive[] = [
    sidePrimitive({ shape: "roundedBox", radius: edgeRadius, size: [visibleHalfLength, bodyHeight, bodyDepth], position: [-halfCenterOffset, 0, 0], booleanGroup: "left" }, angles.leftDeg),
    sidePrimitive({ shape: "roundedBox", radius: edgeRadius, size: [visibleHalfLength, bodyHeight, bodyDepth], position: [halfCenterOffset, 0, 0], booleanGroup: "right" }, angles.rightDeg),
    sidePrimitive({ shape: "cylinder", size: [boreDiameter, bodyDepth + 0.08, boreDiameter], position: [leftBoreX, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "shaft-bore", booleanGroup: "left" }, angles.leftDeg),
    sidePrimitive({ shape: "cylinder", size: [boreDiameter, bodyDepth + 0.08, boreDiameter], position: [rightBoreX, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "shaft-bore", booleanGroup: "right" }, angles.rightDeg),
    sidePrimitive({ shape: "box", size: [leftSlotLength, slotThickness, bodyDepth + 0.08], position: [leftEdge + leftSlotLength / 2, 0, 0], appearance: "cutout", booleanGroup: "left" }, angles.leftDeg),
    sidePrimitive({ shape: "box", size: [rightSlotLength, slotThickness, bodyDepth + 0.08], position: [rightEdge - rightSlotLength / 2, 0, 0], appearance: "cutout", booleanGroup: "right" }, angles.rightDeg),
    sidePrimitive({ shape: "cylinder", size: [lockingDiameter, bodyDepth + 0.08, lockingDiameter], position: [leftLockX, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "drilled-hole", booleanGroup: "left" }, angles.leftDeg),
    sidePrimitive({ shape: "cylinder", size: [lockingDiameter, bodyDepth + 0.08, lockingDiameter], position: [rightLockX, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "drilled-hole", booleanGroup: "right" }, angles.rightDeg),
    { shape: "cylinder", size: [pivotBossDiameter, pivotBossLength, pivotBossDiameter], position: [pivotBossCenterX, 0, 0], rotation: [0, 0, 90], feature: "pivot-male", booleanGroup: "left" },
    { shape: "cylinder", size: [pivotRecessDiameter, pivotDepth + 0.04, pivotRecessDiameter], position: [pivotRecessCenterX, 0, 0], rotation: [0, 0, 90], appearance: "cutout", feature: "pivot-female", booleanGroup: "right" },
    { shape: "cylinder", size: [pivotPinDiameter, bodyDepth + 0.08, pivotPinDiameter], position: [0, 0, 0], rotation: [90, 0, 0], appearance: "cutout", feature: "drilled-hole", booleanGroup: "left" },
  ];

  return {
    variant,
    angles,
    pivotDisplayAssumption: { ...pivot, engagementDepth: pivotDepth * 10 },
    primitives,
    ports: [
      { id: "P1-Z", axis: "z" as const, direction: rotateBoreDirection(angles.leftDeg), position: [leftBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
      { id: "P2-Z", axis: "z" as const, direction: rotateBoreDirection(angles.rightDeg), position: [rightBoreX, 0, 0] as [number, number, number], diameter: variant.diameter },
    ],
  };
}
