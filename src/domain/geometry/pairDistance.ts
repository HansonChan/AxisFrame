import { SCENE_UNITS_PER_MM } from "../components/componentBounds";

export type PairDistancePoint = [number, number, number];
export type PairDistanceAxis = "x" | "y" | "z";

export type PairDistanceGuide = {
  axis: PairDistanceAxis;
  start: PairDistancePoint;
  end: PairDistancePoint;
  midpoint: PairDistancePoint;
  distanceMm: number;
};

function midpoint(start: PairDistancePoint, end: PairDistancePoint): PairDistancePoint {
  return start.map((value, index) => (value + end[index]) / 2) as PairDistancePoint;
}

export function createPairDistanceGuides(
  first: PairDistancePoint,
  second: PairDistancePoint,
  sceneUnitsPerMm = SCENE_UNITS_PER_MM,
): PairDistanceGuide[] {
  const afterX: PairDistancePoint = [second[0], first[1], first[2]];
  const afterY: PairDistancePoint = [second[0], second[1], first[2]];
  const segments: Array<[PairDistanceAxis, PairDistancePoint, PairDistancePoint]> = [
    ["x", first, afterX],
    ["y", afterX, afterY],
    ["z", afterY, second],
  ];

  return segments.map(([axis, start, end]) => {
    const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
    return {
      axis,
      start,
      end,
      midpoint: midpoint(start, end),
      distanceMm: Math.round(Math.abs(end[axisIndex] - start[axisIndex]) / sceneUnitsPerMm * 10) / 10,
    };
  });
}
