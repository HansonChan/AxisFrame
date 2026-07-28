import * as THREE from "three";
import {
  type AssemblyConnection,
  type ShaftSegment,
  type Vec3,
} from "./assembly";

export type PreciseRelationType = "surface-contact" | "surface-gap" | "shaft-bore";
export type PreciseRelationStatus = "valid" | "warning" | "invalid";
export type ShaftAxialReference = "preserve" | "shaft-center" | "shaft-start" | "shaft-end";

export type PreciseAssemblyRelation = {
  id: string;
  type: PreciseRelationType;
  fixedPartId: string;
  movingPartId: string;
  fixedFeatureId: string;
  movingFeatureId: string;
  gapMm?: number;
  axialReference?: ShaftAxialReference;
  axialOffsetMm?: number;
  status: PreciseRelationStatus;
  residualMm: number;
  message?: string;
};

export type BoxAssemblyPart = {
  partId: string;
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
};

export type AssemblySurfaceFeature = {
  id: string;
  partId: string;
  center: Vec3;
  normal: Vec3;
  tangents: [Vec3, Vec3];
  halfExtents: [number, number];
};

export type SurfaceRelationCandidate = {
  fixedFeature: AssemblySurfaceFeature;
  movingFeature: AssemblySurfaceFeature;
  translation: Vec3;
  travelMm: number;
  currentGapMm: number;
  targetGapMm: number;
  residualMm: number;
};

export type SurfaceRelationFailure =
  | "negative-gap"
  | "no-opposed-surfaces"
  | "no-overlapping-surfaces"
  | "preferred-feature-unavailable";

export type SurfaceRelationResult =
  | { ok: true; candidate: SurfaceRelationCandidate }
  | { ok: false; reason: SurfaceRelationFailure };

export type ShaftAxisMoveResult = {
  position: Vec3;
  axis: Vec3;
  appliedDistanceMm: number;
  connectionPositionDelta: number;
};

const AXES = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
] as const;

function quaternionForRotation(rotation: Vec3) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotation[0]),
    THREE.MathUtils.degToRad(rotation[1]),
    THREE.MathUtils.degToRad(rotation[2]),
    "XYZ",
  ));
}

function toVec3(vector: THREE.Vector3): Vec3 {
  return vector.toArray() as Vec3;
}

export function solveShaftAxisMove({
  shaft,
  distanceMm,
  retainedConnections = [],
  sceneUnitsPerMm = 0.01,
}: {
  shaft: ShaftSegment;
  distanceMm: number;
  retainedConnections?: AssemblyConnection[];
  sceneUnitsPerMm?: number;
}): ShaftAxisMoveResult | null {
  if (!Number.isFinite(distanceMm) || sceneUnitsPerMm <= 0) return null;
  const start = new THREE.Vector3(...shaft.start);
  const end = new THREE.Vector3(...shaft.end);
  const shaftVector = end.clone().sub(start);
  const shaftLength = shaftVector.length();
  if (shaftLength <= 1e-8) return null;
  const shaftAxis = shaftVector.clone().normalize();
  const shaftCenter = start.clone().add(end).multiplyScalar(0.5);
  const retainedPositions = retainedConnections
    .filter(({ shaftId }) => shaftId === shaft.partId)
    .map(({ positionOnShaft }) => THREE.MathUtils.clamp(positionOnShaft, 0, 1));
  if (retainedPositions.length === 0) return null;
  const minimumTravelScene = Math.max(...retainedPositions.map((position) => (position - 1) * shaftLength));
  const maximumTravelScene = Math.min(...retainedPositions.map((position) => position * shaftLength));
  const requestedTravelScene = distanceMm * sceneUnitsPerMm;
  const appliedTravelScene = THREE.MathUtils.clamp(requestedTravelScene, minimumTravelScene, maximumTravelScene);
  const connectionPositionDelta = -appliedTravelScene / shaftLength;

  return {
    position: toVec3(shaftCenter.clone().addScaledVector(shaftAxis, appliedTravelScene)),
    axis: toVec3(shaftAxis),
    appliedDistanceMm: appliedTravelScene / sceneUnitsPerMm,
    connectionPositionDelta,
  };
}

function featureId(axis: number, sign: number) {
  return `face:${"xyz"[axis]}${sign > 0 ? "+" : "-"}`;
}

export function createBoxSurfaceFeatures(part: BoxAssemblyPart): AssemblySurfaceFeature[] {
  const center = new THREE.Vector3(...part.center);
  const halfSize = new THREE.Vector3(
    Math.max(0.000001, Math.abs(part.size[0])) / 2,
    Math.max(0.000001, Math.abs(part.size[1])) / 2,
    Math.max(0.000001, Math.abs(part.size[2])) / 2,
  );
  const quaternion = quaternionForRotation(part.rotation);
  const worldAxes = AXES.map((axis) => axis.clone().applyQuaternion(quaternion).normalize());

  return worldAxes.flatMap((axis, axisIndex) => [-1, 1].map((sign) => {
    const tangentIndexes = [0, 1, 2].filter((index) => index !== axisIndex);
    const normal = axis.clone().multiplyScalar(sign);
    return {
      id: featureId(axisIndex, sign),
      partId: part.partId,
      center: toVec3(center.clone().addScaledVector(normal, halfSize.getComponent(axisIndex))),
      normal: toVec3(normal),
      tangents: [
        toVec3(worldAxes[tangentIndexes[0]]),
        toVec3(worldAxes[tangentIndexes[1]]),
      ],
      halfExtents: [
        halfSize.getComponent(tangentIndexes[0]),
        halfSize.getComponent(tangentIndexes[1]),
      ],
    } satisfies AssemblySurfaceFeature;
  }));
}

function projectedHalfExtent(feature: AssemblySurfaceFeature, axis: THREE.Vector3) {
  return feature.tangents.reduce((total, tangent, index) =>
    total + Math.abs(axis.dot(new THREE.Vector3(...tangent))) * feature.halfExtents[index], 0);
}

function surfacesOverlap(
  fixed: AssemblySurfaceFeature,
  moving: AssemblySurfaceFeature,
  toleranceScene: number,
) {
  const delta = new THREE.Vector3(...moving.center).sub(new THREE.Vector3(...fixed.center));
  return fixed.tangents.every((tangent, index) => {
    const axis = new THREE.Vector3(...tangent);
    const centerDistance = Math.abs(delta.dot(axis));
    const movingExtent = projectedHalfExtent(moving, axis);
    return centerDistance <= fixed.halfExtents[index] + movingExtent + toleranceScene;
  });
}

export function solveSurfaceRelation({
  fixed,
  moving,
  gapMm,
  sceneUnitsPerMm = 0.01,
  normalToleranceDeg = 5,
  overlapToleranceMm = 0.1,
  fixedFeatureId,
  movingFeatureId,
}: {
  fixed: BoxAssemblyPart;
  moving: BoxAssemblyPart;
  gapMm: number;
  sceneUnitsPerMm?: number;
  normalToleranceDeg?: number;
  overlapToleranceMm?: number;
  fixedFeatureId?: string;
  movingFeatureId?: string;
}): SurfaceRelationResult {
  if (!Number.isFinite(gapMm) || gapMm < 0) return { ok: false, reason: "negative-gap" };
  const fixedFeatures = createBoxSurfaceFeatures(fixed);
  const movingFeatures = createBoxSurfaceFeatures(moving);
  const minimumOpposition = Math.cos(THREE.MathUtils.degToRad(normalToleranceDeg));
  const targetGapScene = gapMm * sceneUnitsPerMm;
  const toleranceScene = overlapToleranceMm * sceneUnitsPerMm;
  const preferredRequested = Boolean(fixedFeatureId || movingFeatureId);
  let opposedCount = 0;
  const candidates: SurfaceRelationCandidate[] = [];

  for (const fixedFeature of fixedFeatures) {
    if (fixedFeatureId && fixedFeature.id !== fixedFeatureId) continue;
    const fixedNormal = new THREE.Vector3(...fixedFeature.normal);
    for (const movingFeature of movingFeatures) {
      if (movingFeatureId && movingFeature.id !== movingFeatureId) continue;
      const movingNormal = new THREE.Vector3(...movingFeature.normal);
      if (fixedNormal.dot(movingNormal) > -minimumOpposition) continue;
      opposedCount += 1;
      if (!surfacesOverlap(fixedFeature, movingFeature, toleranceScene)) continue;

      const centerDirection = new THREE.Vector3(...moving.center).sub(new THREE.Vector3(...fixed.center));
      if (centerDirection.dot(fixedNormal) < -toleranceScene) continue;
      const currentGapScene = new THREE.Vector3(...movingFeature.center)
        .sub(new THREE.Vector3(...fixedFeature.center))
        .dot(fixedNormal);
      const correctionScene = targetGapScene - currentGapScene;
      const translation = fixedNormal.clone().multiplyScalar(correctionScene);
      candidates.push({
        fixedFeature,
        movingFeature,
        translation: toVec3(translation),
        travelMm: Math.abs(correctionScene / sceneUnitsPerMm),
        currentGapMm: currentGapScene / sceneUnitsPerMm,
        targetGapMm: gapMm,
        residualMm: 0,
      });
    }
  }

  if (candidates.length === 0) {
    if (preferredRequested && opposedCount === 0) return { ok: false, reason: "preferred-feature-unavailable" };
    return { ok: false, reason: opposedCount > 0 ? "no-overlapping-surfaces" : "no-opposed-surfaces" };
  }

  candidates.sort((left, right) =>
    left.travelMm - right.travelMm
    || left.fixedFeature.id.localeCompare(right.fixedFeature.id)
    || left.movingFeature.id.localeCompare(right.movingFeature.id));
  return { ok: true, candidate: candidates[0] };
}

export function createSurfaceRelation({
  id,
  fixedPartId,
  movingPartId,
  candidate,
}: {
  id: string;
  fixedPartId: string;
  movingPartId: string;
  candidate: SurfaceRelationCandidate;
}): PreciseAssemblyRelation {
  const isContact = candidate.targetGapMm <= 0;
  return {
    id,
    type: isContact ? "surface-contact" : "surface-gap",
    fixedPartId,
    movingPartId,
    fixedFeatureId: candidate.fixedFeature.id,
    movingFeatureId: candidate.movingFeature.id,
    gapMm: isContact ? 0 : candidate.targetGapMm,
    status: candidate.residualMm <= 0.1 ? "valid" : "warning",
    residualMm: candidate.residualMm,
  };
}

export function createShaftBoreRelation({
  id,
  fixedPartId,
  movingPartId,
  connectorId,
  portId,
  shaftId,
  residualMm = 0,
  axialReference = "preserve",
  axialOffsetMm,
}: {
  id: string;
  fixedPartId: string;
  movingPartId: string;
  connectorId: string;
  portId: string;
  shaftId: string;
  residualMm?: number;
  axialReference?: ShaftAxialReference;
  axialOffsetMm?: number;
}): PreciseAssemblyRelation {
  return {
    id,
    type: "shaft-bore",
    fixedPartId,
    movingPartId,
    fixedFeatureId: fixedPartId === shaftId ? "shaft-axis" : portId,
    movingFeatureId: movingPartId === shaftId ? "shaft-axis" : portId,
    axialReference,
    axialOffsetMm,
    status: residualMm <= 0.1 ? "valid" : "warning",
    residualMm,
    message: `${connectorId}:${portId} ↔ ${shaftId}`,
  };
}

export function replacePairRelation(
  relations: readonly PreciseAssemblyRelation[],
  relation: PreciseAssemblyRelation,
) {
  return [
    ...relations.filter((candidate) =>
      candidate.id !== relation.id
      && !(candidate.fixedPartId === relation.fixedPartId
        && candidate.movingPartId === relation.movingPartId
        && candidate.type === relation.type)),
    relation,
  ];
}

export function copyPreciseRelationsForPartMap(
  relations: readonly PreciseAssemblyRelation[],
  partIdMap: Readonly<Record<string, string>>,
  idFactory: (sourceId: string) => string = (sourceId) => `${sourceId}-copy`,
) {
  return relations.flatMap((relation) => {
    const fixedPartId = partIdMap[relation.fixedPartId];
    const movingPartId = partIdMap[relation.movingPartId];
    if (!fixedPartId || !movingPartId) return [];
    return [{
      ...relation,
      id: idFactory(relation.id),
      fixedPartId,
      movingPartId,
      status: "valid" as const,
      residualMm: 0,
    }];
  });
}

export function preciseRelationFailureMessage(reason: SurfaceRelationFailure, lang: "zh" | "en" = "zh") {
  const messages = {
    "negative-gap": {
      zh: "间距不能为负数",
      en: "GAP CANNOT BE NEGATIVE",
    },
    "no-opposed-surfaces": {
      zh: "当前姿态没有方向相对的表面；系统不会自动旋转组件",
      en: "NO OPPOSED FACES IN THE CURRENT POSE; ROTATION IS NOT CHANGED",
    },
    "no-overlapping-surfaces": {
      zh: "方向相对的表面没有重叠区域",
      en: "OPPOSED FACES DO NOT OVERLAP",
    },
    "preferred-feature-unavailable": {
      zh: "原装配表面在当前参数下不可用",
      en: "THE STORED ASSEMBLY FACE IS UNAVAILABLE",
    },
  } satisfies Record<SurfaceRelationFailure, Record<"zh" | "en", string>>;
  return messages[reason][lang];
}
