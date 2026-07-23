import * as THREE from "three";
import type { Vec3 } from "./assembly";

export type AlignmentAxis = "x" | "y" | "z";

export type ReferenceGuide = {
  axis: AlignmentAxis;
  referenceId: string;
  referencePosition: Vec3;
  distanceMm: number;
};

export type ReferenceAlignment = {
  position: Vec3;
  guides: ReferenceGuide[];
};

export type RigidPose = {
  position: Vec3;
  rotation: Vec3;
};

const axisIndex: Record<AlignmentAxis, number> = { x: 0, y: 1, z: 2 };

export function alignPairPosition(anchor: Vec3, moving: Vec3, axis: AlignmentAxis): Vec3 {
  const next = [...moving] as Vec3;
  next[axisIndex[axis]] = anchor[axisIndex[axis]];
  return next;
}

const quaternionFromDegrees = (rotation: Vec3) => new THREE.Quaternion().setFromEuler(new THREE.Euler(
  THREE.MathUtils.degToRad(rotation[0]),
  THREE.MathUtils.degToRad(rotation[1]),
  THREE.MathUtils.degToRad(rotation[2]),
  "XYZ",
));

const cleanRigidValue = (value: number) => Math.abs(value) < 1e-10 ? 0 : value;

/**
 * Reverses a solved snap so the selected anchor pose stays fixed and the other
 * component receives the equivalent rigid transform instead.
 */
export function retargetMovingPartForFixedAnchor({
  fixedAnchor,
  solvedAnchor,
  movingPart,
}: {
  fixedAnchor: RigidPose;
  solvedAnchor: RigidPose;
  movingPart: RigidPose;
}): RigidPose {
  const fixedAnchorQuaternion = quaternionFromDegrees(fixedAnchor.rotation);
  const solvedAnchorQuaternion = quaternionFromDegrees(solvedAnchor.rotation);
  const deltaQuaternion = fixedAnchorQuaternion.clone().multiply(solvedAnchorQuaternion.clone().invert()).normalize();
  const solvedAnchorPosition = new THREE.Vector3(...solvedAnchor.position);
  const fixedAnchorPosition = new THREE.Vector3(...fixedAnchor.position);
  const nextPosition = new THREE.Vector3(...movingPart.position)
    .sub(solvedAnchorPosition)
    .applyQuaternion(deltaQuaternion)
    .add(fixedAnchorPosition);
  const nextQuaternion = deltaQuaternion.clone().multiply(quaternionFromDegrees(movingPart.rotation)).normalize();
  const nextEuler = new THREE.Euler().setFromQuaternion(nextQuaternion, "XYZ");
  return {
    position: nextPosition.toArray().map(cleanRigidValue) as Vec3,
    rotation: [
      THREE.MathUtils.radToDeg(nextEuler.x),
      THREE.MathUtils.radToDeg(nextEuler.y),
      THREE.MathUtils.radToDeg(nextEuler.z),
    ].map(cleanRigidValue) as Vec3,
  };
}

export function findReferenceAlignment({
  movingId,
  position,
  references,
  thresholdMm = 18,
}: {
  movingId: string;
  position: Vec3;
  references: Record<string, Vec3>;
  thresholdMm?: number;
}): ReferenceAlignment {
  const thresholdScene = thresholdMm / 100;
  const next = [...position] as Vec3;
  const guides: ReferenceGuide[] = [];

  (["x", "y", "z"] as const).forEach((axis) => {
    const index = axisIndex[axis];
    const nearest = Object.entries(references)
      .filter(([id]) => id !== movingId)
      .map(([referenceId, referencePosition]) => ({
        referenceId,
        referencePosition,
        gap: Math.abs(referencePosition[index] - position[index]),
      }))
      .filter(({ gap }) => gap <= thresholdScene)
      .sort((a, b) => a.gap - b.gap || a.referenceId.localeCompare(b.referenceId))[0];
    if (!nearest) return;
    next[index] = nearest.referencePosition[index];
    guides.push({
      axis,
      referenceId: nearest.referenceId,
      referencePosition: nearest.referencePosition,
      distanceMm: Math.round(nearest.gap * 1000) / 10,
    });
  });

  return { position: next, guides };
}
