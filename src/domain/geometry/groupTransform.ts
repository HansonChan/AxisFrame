import * as THREE from "three";
import type { Vec3 } from "../assembly/assembly";
import type { ComponentTransform } from "../model/editorSchema";

export type GroupTransformPlacement = {
  id: string;
  position: Vec3;
  transform: ComponentTransform;
};

const clean = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;

const quaternionFromDegrees = (transform: Pick<ComponentTransform, "rotX" | "rotY" | "rotZ">) => (
  new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(transform.rotX),
    THREE.MathUtils.degToRad(transform.rotY),
    THREE.MathUtils.degToRad(transform.rotZ),
    "XYZ",
  ))
);

export function calculateGroupPivot(positions: readonly Vec3[]): Vec3 {
  if (positions.length === 0) return [0, 0, 0];
  const bounds = new THREE.Box3();
  positions.forEach((position) => bounds.expandByPoint(new THREE.Vector3(...position)));
  return bounds.getCenter(new THREE.Vector3()).toArray().map(clean) as Vec3;
}

export function transformGroupMembers({
  pivot,
  controlPosition,
  controlRotation,
  controlScale,
  memberIds,
  memberPositions,
  memberTransforms,
}: {
  pivot: Vec3;
  controlPosition: Vec3;
  controlRotation: Vec3;
  controlScale: Vec3;
  memberIds: readonly string[];
  memberPositions: Readonly<Record<string, Vec3>>;
  memberTransforms: Readonly<Record<string, ComponentTransform>>;
}): GroupTransformPlacement[] {
  const pivotVector = new THREE.Vector3(...pivot);
  const controlPositionVector = new THREE.Vector3(...controlPosition);
  const deltaQuaternion = quaternionFromDegrees({
    rotX: controlRotation[0],
    rotY: controlRotation[1],
    rotZ: controlRotation[2],
  }).normalize();
  const safeScale = new THREE.Vector3(
    Math.sign(controlScale[0] || 1) * Math.max(0.1, Math.abs(controlScale[0])),
    Math.sign(controlScale[1] || 1) * Math.max(0.1, Math.abs(controlScale[1])),
    Math.sign(controlScale[2] || 1) * Math.max(0.1, Math.abs(controlScale[2])),
  );

  return memberIds.flatMap((id) => {
    const position = memberPositions[id];
    const transform = memberTransforms[id];
    if (!position || !transform) return [];
    const nextPosition = new THREE.Vector3(...position)
      .sub(pivotVector)
      .multiply(safeScale)
      .applyQuaternion(deltaQuaternion)
      .add(controlPositionVector);
    const nextQuaternion = deltaQuaternion.clone().multiply(quaternionFromDegrees(transform)).normalize();
    const nextEuler = new THREE.Euler().setFromQuaternion(nextQuaternion, "XYZ");
    return [{
      id,
      position: nextPosition.toArray().map(clean) as Vec3,
      transform: {
        ...transform,
        rotX: clean(THREE.MathUtils.radToDeg(nextEuler.x)),
        rotY: clean(THREE.MathUtils.radToDeg(nextEuler.y)),
        rotZ: clean(THREE.MathUtils.radToDeg(nextEuler.z)),
        scaleX: clean(transform.scaleX * safeScale.x),
        scaleY: clean(transform.scaleY * safeScale.y),
        scaleZ: clean(transform.scaleZ * safeScale.z),
      },
    }];
  });
}
