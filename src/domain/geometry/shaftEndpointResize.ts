export type ShaftResizeTransform = {
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

export type ShaftResizeVector = [number, number, number];

const MM_TO_SCENE = 0.01;

function add(a: ShaftResizeVector, b: ShaftResizeVector): ShaftResizeVector {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: ShaftResizeVector, factor: number): ShaftResizeVector {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

export function resizeShaftFromEndpoint({
  baseCenter,
  baseLengthScene,
  transform,
  fixedEndpoint,
  axisFromFixedEndpoint,
  physicalLengthMm,
  visualUnitsPerPhysicalUnit = 1,
}: {
  baseCenter: ShaftResizeVector;
  baseLengthScene: number;
  transform: ShaftResizeTransform;
  fixedEndpoint: ShaftResizeVector;
  axisFromFixedEndpoint: ShaftResizeVector;
  physicalLengthMm: number;
  visualUnitsPerPhysicalUnit?: number;
}): ShaftResizeTransform {
  const minimumLengthMm = 50;
  const maximumLengthMm = 5000;
  const snappedLengthMm = Math.min(
    maximumLengthMm,
    Math.max(minimumLengthMm, Math.round(physicalLengthMm / 10) * 10),
  );
  const physicalLengthScene = snappedLengthMm * MM_TO_SCENE;
  const visualLengthScene = physicalLengthScene * Math.max(visualUnitsPerPhysicalUnit, 0.0001);
  const draggedEndpoint = add(fixedEndpoint, scale(axisFromFixedEndpoint, visualLengthScene));
  const nextCenter = scale(add(fixedEndpoint, draggedEndpoint), 0.5);
  const sceneToMm = (value: number) => Math.round((value / MM_TO_SCENE) * 10) / 10;

  return {
    ...transform,
    x: sceneToMm(nextCenter[0] - baseCenter[0]),
    y: sceneToMm(nextCenter[1] - baseCenter[1]),
    z: sceneToMm(nextCenter[2] - baseCenter[2]),
    sizeX: Math.round((physicalLengthScene / Math.max(baseLengthScene, 0.0001)) * 1000) / 10,
  };
}
