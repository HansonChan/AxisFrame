import { SCENE_UNITS_PER_MM } from "../components/componentBounds";

export const FREE_POSITION_PRECISION_MM = 0.1;

export function roundFreePositionMm(value: number) {
  if (!Number.isFinite(value)) return 0;
  const precisionFactor = 1 / FREE_POSITION_PRECISION_MM;
  return Math.round(value * precisionFactor) / precisionFactor;
}

export function sceneDeltaToFreePositionMm(sceneDelta: number) {
  return roundFreePositionMm(sceneDelta / SCENE_UNITS_PER_MM);
}
