export type ComponentDimensions = { width: number; length: number; height: number };

export const SCENE_UNITS_PER_MM = 0.01;

export function mmToScene(mm: number) {
  return mm * SCENE_UNITS_PER_MM;
}

export function componentSceneSize(
  dimensions: ComponentDimensions,
  padding = 0,
): [number, number, number] {
  return [
    mmToScene(dimensions.width) + padding,
    mmToScene(dimensions.height) + padding,
    mmToScene(dimensions.length) + padding,
  ];
}

export function normalizedComponentSelectionSize(
  dimensions: ComponentDimensions,
  maxSceneSize = 2.8,
  outlinePadding = 0.08,
): [number, number, number] {
  const maxDimension = Math.max(dimensions.width, dimensions.length, dimensions.height, 0.001);
  const scale = maxSceneSize / maxDimension;
  return [
    dimensions.width * scale + outlinePadding,
    dimensions.height * scale + outlinePadding,
    dimensions.length * scale + outlinePadding,
  ];
}
