export type PanelResizeTransform = {
  x: number;
  y: number;
  z: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

export type PanelResizeVector = [number, number, number];
export type PanelResizeAxis = "x" | "z";

const MM_TO_SCENE = 0.01;

function add(a: PanelResizeVector, b: PanelResizeVector): PanelResizeVector {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: PanelResizeVector, factor: number): PanelResizeVector {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

export function resizePanelFromEdge({
  baseCenter,
  transform,
  axis,
  fixedEdge,
  axisFromFixedEdge,
  physicalSizeMm,
  visualUnitsPerPhysicalUnit = 1,
}: {
  baseCenter: PanelResizeVector;
  transform: PanelResizeTransform;
  axis: PanelResizeAxis;
  fixedEdge: PanelResizeVector;
  axisFromFixedEdge: PanelResizeVector;
  physicalSizeMm: number;
  visualUnitsPerPhysicalUnit?: number;
}): PanelResizeTransform {
  const minimumSizeMm = 100;
  const maximumSizeMm = 5000;
  const snappedSizeMm = Math.min(
    maximumSizeMm,
    Math.max(minimumSizeMm, Math.round(physicalSizeMm / 10) * 10),
  );
  const physicalSizeScene = snappedSizeMm * MM_TO_SCENE;
  const visualSizeScene = physicalSizeScene * Math.max(visualUnitsPerPhysicalUnit, 0.0001);
  const draggedEdge = add(fixedEdge, scale(axisFromFixedEdge, visualSizeScene));
  const nextCenter = scale(add(fixedEdge, draggedEdge), 0.5);
  const sceneToMm = (value: number) => Math.round((value / MM_TO_SCENE) * 10) / 10;

  return {
    ...transform,
    x: sceneToMm(nextCenter[0] - baseCenter[0]),
    y: sceneToMm(nextCenter[1] - baseCenter[1]),
    z: sceneToMm(nextCenter[2] - baseCenter[2]),
    ...(axis === "x" ? { sizeX: snappedSizeMm } : { sizeZ: snappedSizeMm }),
  };
}
