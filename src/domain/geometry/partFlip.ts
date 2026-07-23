export type FlipDirection = "horizontal" | "vertical";
export type ViewHorizontalAxis = "x" | "z";

type ScaledTransform = {
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export function flipPartTransform<T extends ScaledTransform>(
  transform: T,
  direction: FlipDirection,
  horizontalAxis: ViewHorizontalAxis,
): T {
  if (direction === "vertical") {
    return { ...transform, scaleY: -transform.scaleY };
  }

  return horizontalAxis === "x"
    ? { ...transform, scaleX: -transform.scaleX }
    : { ...transform, scaleZ: -transform.scaleZ };
}
