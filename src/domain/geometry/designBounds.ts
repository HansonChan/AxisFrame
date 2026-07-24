import * as THREE from "three";

export type BoundsVector = [number, number, number];

export type BoundsTransform = {
  position: BoundsVector;
  rotationDeg: BoundsVector;
  scale: BoundsVector;
};

export type OverallDesignBounds = {
  min: BoundsVector;
  max: BoundsVector;
  center: BoundsVector;
  sizeScene: BoundsVector;
  dimensionsMm: {
    width: number;
    height: number;
    depth: number;
  };
};

function degreesToRadians(value: number) {
  return value * Math.PI / 180;
}

export function orientedBoxBounds({
  size,
  transform,
  localRotation,
}: {
  size: BoundsVector;
  transform: BoundsTransform;
  localRotation?: THREE.Quaternion;
}) {
  const halfSize = new THREE.Vector3(...size).multiplyScalar(0.5);
  const bounds = new THREE.Box3(halfSize.clone().multiplyScalar(-1), halfSize);
  const parentMatrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(
      degreesToRadians(transform.rotationDeg[0]),
      degreesToRadians(transform.rotationDeg[1]),
      degreesToRadians(transform.rotationDeg[2]),
      "XYZ",
    )),
    new THREE.Vector3(...transform.scale),
  );
  if (localRotation) parentMatrix.multiply(new THREE.Matrix4().makeRotationFromQuaternion(localRotation));
  return bounds.applyMatrix4(parentMatrix);
}

export function shaftBounds({
  start,
  end,
  diameterScene,
  lengthScale,
  transform,
}: {
  start: BoundsVector;
  end: BoundsVector;
  diameterScene: number;
  lengthScale: number;
  transform: BoundsTransform;
}) {
  const startVector = new THREE.Vector3(...start);
  const endVector = new THREE.Vector3(...end);
  const direction = endVector.clone().sub(startVector);
  const midpoint = startVector.clone().add(endVector).multiplyScalar(0.5);
  const localRotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  );
  return orientedBoxBounds({
    size: [diameterScene, direction.length() * Math.max(0.01, lengthScale), diameterScene],
    transform: {
      ...transform,
      position: [
        midpoint.x + transform.position[0],
        midpoint.y + transform.position[1],
        midpoint.z + transform.position[2],
      ],
    },
    localRotation,
  });
}

export function mergeDesignBounds(
  boxes: THREE.Box3[],
  sceneUnitsPerMm = 0.01,
): OverallDesignBounds | null {
  if (boxes.length === 0) return null;
  const merged = boxes.reduce((result, box) => result.union(box), new THREE.Box3());
  const center = merged.getCenter(new THREE.Vector3());
  const size = merged.getSize(new THREE.Vector3());
  const toMm = (value: number) => Math.max(0, Math.round(value / sceneUnitsPerMm * 10) / 10);
  return {
    min: merged.min.toArray() as BoundsVector,
    max: merged.max.toArray() as BoundsVector,
    center: center.toArray() as BoundsVector,
    sizeScene: size.toArray() as BoundsVector,
    dimensionsMm: {
      width: toMm(size.x),
      height: toMm(size.y),
      depth: toMm(size.z),
    },
  };
}
