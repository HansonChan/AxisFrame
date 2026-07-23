export type QuickRotateAxis = "x" | "y" | "z";
export type QuickRotateDirection = "cw" | "ccw";

type RotatedTransform = {
  rotX: number;
  rotY: number;
  rotZ: number;
};

const rotationKeyByAxis = {
  x: "rotX",
  y: "rotY",
  z: "rotZ",
} as const satisfies Record<QuickRotateAxis, keyof RotatedTransform>;

export function snapQuarterRotation(value: number): number {
  const snapped = Math.round(value / 90) * 90;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function rotatePartTransform90<T extends RotatedTransform>(
  transform: T,
  axis: QuickRotateAxis,
  direction: QuickRotateDirection,
): T {
  const key = rotationKeyByAxis[axis];
  const delta = direction === "cw" ? 90 : -90;

  return {
    ...transform,
    [key]: snapQuarterRotation(transform[key]) + delta,
  };
}
