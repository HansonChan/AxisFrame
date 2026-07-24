import type { ViewHorizontalAxis } from "./partFlip";

export type MirrorPoint = [number, number, number];

type HorizontallyRotatedTransform = {
  rotY: number;
};

export function rotateHorizontally180(rotationY: number): number {
  const wrapped = (rotationY + 180) % 360;
  const normalized = wrapped > 180 ? wrapped - 360 : wrapped <= -180 ? wrapped + 360 : wrapped;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function mirrorDuplicatePlacement<T extends HorizontallyRotatedTransform>(
  worldPoint: MirrorPoint,
  transform: T,
  horizontalAxis: ViewHorizontalAxis,
): { worldPoint: MirrorPoint; transform: T } {
  return {
    worldPoint: horizontalAxis === "x"
      ? [-worldPoint[0], worldPoint[1], worldPoint[2]]
      : [worldPoint[0], worldPoint[1], -worldPoint[2]],
    transform: {
      ...transform,
      rotY: rotateHorizontally180(transform.rotY),
    },
  };
}
