import type { ViewHorizontalAxis } from "./partFlip";

export type MirrorPoint = [number, number, number];

export function mirrorDuplicatePlacement<T extends object>(
  worldPoint: MirrorPoint,
  transform: T,
  horizontalAxis: ViewHorizontalAxis,
): { worldPoint: MirrorPoint; transform: T } {
  return {
    worldPoint: horizontalAxis === "x"
      ? [-worldPoint[0], worldPoint[1], worldPoint[2]]
      : [worldPoint[0], worldPoint[1], -worldPoint[2]],
    transform: { ...transform },
  };
}
