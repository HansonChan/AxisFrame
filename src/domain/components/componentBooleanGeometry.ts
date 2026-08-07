import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ADDITION, Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

export type BooleanComponentPrimitive = {
  shape: "box" | "roundedBox" | "cylinder" | "ring";
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  radius?: number;
  appearance?: "solid" | "cutout" | "post-cutout";
  feature?: "drilled-hole" | "shaft-bore" | "pivot-male" | "pivot-female" | "joint-seam";
  finish?: "metal" | "rubber" | "dark-metal";
  booleanGroup?: string;
};

export type BooleanRingParameters = {
  innerDiameter: number;
  outerDiameter: number;
  thickness: number;
};

function degToRad(value: number): number {
  return value * Math.PI / 180;
}

function createRingGeometry(parameters: BooleanRingParameters): THREE.ExtrudeGeometry {
  const scale = 2.5 / Math.max(parameters.outerDiameter, 0.1);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, parameters.outerDiameter * scale / 2, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, Math.min(parameters.innerDiameter, parameters.outerDiameter - 0.1) * scale / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const depth = Math.max(parameters.thickness * scale, 0.08);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function primitiveGeometry(
  primitive: BooleanComponentPrimitive,
  ringParameters?: BooleanRingParameters,
): THREE.BufferGeometry {
  if (primitive.shape === "box") return new THREE.BoxGeometry(...primitive.size);
  if (primitive.shape === "roundedBox") {
    return new RoundedBoxGeometry(
      primitive.size[0],
      primitive.size[1],
      primitive.size[2],
      2,
      Math.min(primitive.radius ?? 0.08, Math.min(...primitive.size) / 2),
    );
  }
  if (primitive.shape === "ring") {
    return createRingGeometry(ringParameters ?? { innerDiameter: 10, outerDiameter: 25, thickness: 8 });
  }
  const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
  geometry.scale(primitive.size[0], primitive.size[1], primitive.size[2]);
  return geometry;
}

function primitiveBrush(
  primitive: BooleanComponentPrimitive,
  ringParameters?: BooleanRingParameters,
): Brush {
  const geometry = primitiveGeometry(primitive, ringParameters);
  geometry.clearGroups();
  const brush = new Brush(geometry);
  brush.position.fromArray(primitive.position);
  brush.rotation.set(...(primitive.rotation ?? [0, 0, 0]).map(degToRad) as [number, number, number]);
  brush.updateMatrixWorld(true);
  return brush;
}

function removeDegenerateTriangles(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  const cleanPositions: number[] = [];
  const cleanUvs: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let index = 0; index < positions.count; index += 3) {
    a.fromBufferAttribute(positions, index);
    b.fromBufferAttribute(positions, index + 1);
    c.fromBufferAttribute(positions, index + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).lengthSq() <= 1e-16) continue;
    for (let vertex = index; vertex < index + 3; vertex += 1) {
      cleanPositions.push(positions.getX(vertex), positions.getY(vertex), positions.getZ(vertex));
      if (uvs) cleanUvs.push(uvs.getX(vertex), uvs.getY(vertex));
    }
  }

  geometry.dispose();
  const clean = new THREE.BufferGeometry();
  clean.setAttribute("position", new THREE.Float32BufferAttribute(cleanPositions, 3));
  if (uvs) clean.setAttribute("uv", new THREE.Float32BufferAttribute(cleanUvs, 2));
  return clean;
}

export function hasBooleanCutouts(primitives: BooleanComponentPrimitive[]): boolean {
  return primitives.some(({ appearance }) => appearance === "cutout");
}

export function createHollowComponentGeometry(
  primitives: BooleanComponentPrimitive[],
  ringParameters?: BooleanRingParameters,
): THREE.BufferGeometry {
  const groupNames = [...new Set(primitives.map(({ booleanGroup }) => booleanGroup ?? "default"))];
  const groupGeometries = groupNames.map((groupName) => createBooleanGroupGeometry(
    primitives.filter(({ booleanGroup }) => (booleanGroup ?? "default") === groupName),
    ringParameters,
  ));
  if (groupGeometries.length === 1) return groupGeometries[0];

  const geometry = mergeGeometries(groupGeometries, false);
  groupGeometries.forEach((groupGeometry) => groupGeometry.dispose());
  if (!geometry) throw new Error("COMPONENT_BOOLEAN_GROUP_MERGE_FAILED");
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBooleanGroupGeometry(
  primitives: BooleanComponentPrimitive[],
  ringParameters?: BooleanRingParameters,
): THREE.BufferGeometry {
  const solids = primitives.filter(({ appearance }) => appearance !== "cutout" && appearance !== "post-cutout");
  const cutouts = primitives.filter(({ appearance }) => appearance === "cutout");
  const postCutoutSolids = primitives.filter(({ appearance }) => appearance === "post-cutout");
  if (solids.length === 0) throw new Error("COMPONENT_BOOLEAN_REQUIRES_SOLID");

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const temporaryGeometries = new Set<THREE.BufferGeometry>();
  const solidBrushes = solids.map((primitive) => primitiveBrush(primitive, ringParameters));
  const cutoutBrushes = cutouts.map((primitive) => primitiveBrush(primitive, ringParameters));
  const postCutoutBrushes = postCutoutSolids.map((primitive) => primitiveBrush(primitive, ringParameters));
  [...solidBrushes, ...cutoutBrushes, ...postCutoutBrushes].forEach(({ geometry }) => temporaryGeometries.add(geometry));

  let result: Brush = solidBrushes[0];
  for (const solid of solidBrushes.slice(1)) {
    result = evaluator.evaluate(result, solid, ADDITION) as Brush;
    temporaryGeometries.add(result.geometry);
  }
  for (const cutout of cutoutBrushes) {
    result = evaluator.evaluate(result, cutout, SUBTRACTION) as Brush;
    temporaryGeometries.add(result.geometry);
  }
  for (const solid of postCutoutBrushes) {
    result = evaluator.evaluate(result, solid, ADDITION) as Brush;
    temporaryGeometries.add(result.geometry);
  }

  const cleanGeometry = removeDegenerateTriangles(result.geometry);
  cleanGeometry.computeVertexNormals();
  const geometry = cleanGeometry;
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  temporaryGeometries.forEach((temporary) => temporary.dispose());
  return geometry;
}

const hollowGeometryCache = new WeakMap<BooleanComponentPrimitive[], Map<string, THREE.BufferGeometry>>();

export function getCachedHollowComponentGeometry(
  primitives: BooleanComponentPrimitive[],
  ringParameters?: BooleanRingParameters,
): THREE.BufferGeometry {
  let variants = hollowGeometryCache.get(primitives);
  if (!variants) {
    variants = new Map();
    hollowGeometryCache.set(primitives, variants);
  }
  const parameterKey = ringParameters
    ? `${ringParameters.innerDiameter}:${ringParameters.outerDiameter}:${ringParameters.thickness}`
    : "default";
  const cached = variants.get(parameterKey);
  if (cached) return cached;
  const geometry = createHollowComponentGeometry(primitives, ringParameters);
  variants.set(parameterKey, geometry);
  return geometry;
}
