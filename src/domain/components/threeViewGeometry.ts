export type ThreeViewPlane = "front" | "side" | "top";

export type ThreeViewDimensions = {
  width: number;
  length: number;
  height: number;
};

export type ThreeViewPrimitive = {
  shape: "box" | "cylinder" | "ring";
  size: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  appearance?: "solid" | "cutout";
  feature?: "drilled-hole";
};

export type ThreeViewHoleDraft = {
  primitiveIndex: number;
  plane: ThreeViewPlane;
  axis: "x" | "y" | "z";
  position: [number, number, number];
  uMm: number;
  vMm: number;
  diameterMm: number;
};

export type ThreeViewHoleClearances = {
  leftMm: number;
  rightMm: number;
  topMm: number;
  bottomMm: number;
};

export type ThreeViewProjectedOutline =
  | {
      kind: "rect";
      primitiveIndex: number;
      xMm: number;
      yMm: number;
      widthMm: number;
      heightMm: number;
      radiusMm: number;
    }
  | {
      kind: "ellipse";
      primitiveIndex: number;
      cxMm: number;
      cyMm: number;
      rxMm: number;
      ryMm: number;
    };

const normalAxisByPlane = {
  front: "z",
  side: "x",
  top: "y",
} as const satisfies Record<ThreeViewPlane, "x" | "y" | "z">;

const cylinderRotationByNormalAxis = {
  x: [0, 0, 90],
  y: [0, 0, 0],
  z: [90, 0, 0],
} as const satisfies Record<"x" | "y" | "z", [number, number, number]>;

function primitiveBounds(primitives: ThreeViewPrimitive[]) {
  const solids = primitives.filter(({ appearance }) => appearance !== "cutout");
  const source = solids.length > 0 ? solids : primitives;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  source.forEach((primitive) => {
    primitive.size.forEach((_, axis) => {
      const half = primitiveProjectedExtent(primitive, axis as 0 | 1 | 2) / 2;
      min[axis] = Math.min(min[axis], primitive.position[axis] - half);
      max[axis] = Math.max(max[axis], primitive.position[axis] + half);
    });
  });

  if (min.some((value) => !Number.isFinite(value)) || max.some((value) => !Number.isFinite(value))) {
    return {
      center: [0, 0, 0] as [number, number, number],
      size: [1, 1, 1] as [number, number, number],
    };
  }

  return {
    center: min.map((value, axis) => (value + max[axis]) / 2) as [number, number, number],
    size: min.map((value, axis) => Math.max(max[axis] - value, 0.001)) as [number, number, number],
  };
}

function solidPrimitiveBounds(primitives: ThreeViewPrimitive[]) {
  return primitiveBounds(primitives.filter(({ appearance }) => appearance !== "cutout"));
}

function planeAxes(plane: ThreeViewPlane): [0 | 1 | 2, 0 | 1 | 2] {
  if (plane === "front") return [0, 1];
  if (plane === "side") return [2, 1];
  return [0, 2];
}

function planeDimensions(dimensions: ThreeViewDimensions, plane: ThreeViewPlane): [number, number] {
  if (plane === "front") return [dimensions.width, dimensions.height];
  if (plane === "side") return [dimensions.length, dimensions.height];
  return [dimensions.width, dimensions.length];
}

export function threeViewPlaneDimensions(
  dimensions: ThreeViewDimensions,
  plane: ThreeViewPlane,
): [number, number] {
  return planeDimensions(dimensions, plane);
}

export function clampCircularHolePoint(
  dimensions: ThreeViewDimensions,
  plane: ThreeViewPlane,
  point: { uMm: number; vMm: number },
  diameterMm: number,
): { uMm: number; vMm: number } {
  const [uDimension, vDimension] = planeDimensions(dimensions, plane);
  const radius = Math.max(diameterMm, 1) / 2;
  const minU = Math.min(radius, uDimension / 2);
  const maxU = Math.max(uDimension - radius, uDimension / 2);
  const minV = Math.min(radius, vDimension / 2);
  const maxV = Math.max(vDimension - radius, vDimension / 2);
  return {
    uMm: Math.max(minU, Math.min(maxU, point.uMm)),
    vMm: Math.max(minV, Math.min(maxV, point.vMm)),
  };
}

export function circularHoleClearances(
  dimensions: ThreeViewDimensions,
  plane: ThreeViewPlane,
  point: { uMm: number; vMm: number },
  diameterMm: number,
): ThreeViewHoleClearances {
  const [uDimension, vDimension] = planeDimensions(dimensions, plane);
  const center = clampCircularHolePoint(dimensions, plane, point, diameterMm);
  const radius = Math.max(diameterMm, 1) / 2;
  return {
    leftMm: roundToTenth(Math.max(0, center.uMm - radius)),
    rightMm: roundToTenth(Math.max(0, uDimension - center.uMm - radius)),
    topMm: roundToTenth(Math.max(0, vDimension - center.vMm - radius)),
    bottomMm: roundToTenth(Math.max(0, center.vMm - radius)),
  };
}

function normalAxisFromPrimitive(primitive: ThreeViewPrimitive): "x" | "y" | "z" {
  const rotation = primitive.rotation ?? [0, 0, 0];
  if (Math.abs(rotation[2]) % 180 === 90) return "x";
  if (Math.abs(rotation[0]) % 180 === 90) return "z";
  return "y";
}

function axisIndex(axis: "x" | "y" | "z"): 0 | 1 | 2 {
  if (axis === "x") return 0;
  if (axis === "y") return 1;
  return 2;
}

function dimensionForAxis(dimensions: ThreeViewDimensions, axis: 0 | 1 | 2): number {
  if (axis === 0) return Math.max(dimensions.width, 1);
  if (axis === 1) return Math.max(dimensions.height, 1);
  return Math.max(dimensions.length, 1);
}

function radialWorldAxes(normalIndex: 0 | 1 | 2): [0 | 1 | 2, 0 | 1 | 2] {
  return ([0, 1, 2] as const).filter((axis) => axis !== normalIndex) as [0 | 1 | 2, 0 | 1 | 2];
}

function cylinderLocalSizeIndex(normalIndex: 0 | 1 | 2, worldAxis: 0 | 1 | 2): 0 | 1 | 2 {
  if (worldAxis === normalIndex) return 1;
  return worldAxis === radialWorldAxes(normalIndex)[0] ? 0 : 2;
}

function localUnitsPerMm(
  bounds: ReturnType<typeof primitiveBounds>,
  dimensions: ThreeViewDimensions,
  worldAxis: 0 | 1 | 2,
): number {
  return bounds.size[worldAxis] / dimensionForAxis(dimensions, worldAxis);
}

function circularCutoutDiameterMm(
  primitive: ThreeViewPrimitive,
  bounds: ReturnType<typeof primitiveBounds>,
  dimensions: ThreeViewDimensions,
): number {
  const normalIndex = axisIndex(normalAxisFromPrimitive(primitive));
  const physicalDiameters = radialWorldAxes(normalIndex).map((worldAxis) => (
    primitive.size[cylinderLocalSizeIndex(normalIndex, worldAxis)]
      / Math.max(localUnitsPerMm(bounds, dimensions, worldAxis), 0.000001)
  ));
  return (physicalDiameters[0] + physicalDiameters[1]) / 2;
}

function circularCutoutSize(
  currentSize: [number, number, number],
  normalIndex: 0 | 1 | 2,
  bounds: ReturnType<typeof primitiveBounds>,
  dimensions: ThreeViewDimensions,
  diameterMm: number,
): [number, number, number] {
  const size = [...currentSize] as [number, number, number];
  radialWorldAxes(normalIndex).forEach((worldAxis) => {
    const localSizeIndex = cylinderLocalSizeIndex(normalIndex, worldAxis);
    size[localSizeIndex] = roundPrimitiveValue(Math.max(0.01, diameterMm * localUnitsPerMm(bounds, dimensions, worldAxis)));
  });
  return size;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundPrimitiveValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function primitiveProjectedExtent(primitive: ThreeViewPrimitive, axis: 0 | 1 | 2): number {
  if (primitive.shape === "box") return Math.abs(primitive.size[axis]);
  const normalAxis = normalAxisFromPrimitive(primitive);
  const normalIndex = axisIndex(normalAxis);
  if (primitive.shape === "cylinder") {
    return Math.abs(primitive.size[cylinderLocalSizeIndex(normalIndex, axis)]);
  }
  if (primitive.shape === "ring") {
    return Math.abs(primitive.size[cylinderLocalSizeIndex(normalIndex, axis)]);
  }
  return Math.abs(primitive.size[axis]);
}

function projectLocalToMm(
  value: number,
  axis: 0 | 1 | 2,
  bounds: ReturnType<typeof primitiveBounds>,
  dimensionMm: number,
): number {
  return ((value - bounds.center[axis]) / bounds.size[axis] + 0.5) * Math.max(dimensionMm, 1);
}

function projectLengthToMm(
  value: number,
  axis: 0 | 1 | 2,
  bounds: ReturnType<typeof primitiveBounds>,
  dimensionMm: number,
): number {
  return (Math.max(value, 0) / bounds.size[axis]) * Math.max(dimensionMm, 1);
}

export function projectThreeViewOutlines(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
  plane: ThreeViewPlane,
): ThreeViewProjectedOutline[] {
  const solids = primitives
    .map((primitive, primitiveIndex) => ({ primitive, primitiveIndex }))
    .filter(({ primitive }) => primitive.appearance !== "cutout");
  if (solids.length === 0) return [];

  const bounds = solidPrimitiveBounds(primitives);
  const [uAxis, vAxis] = planeAxes(plane);
  const [uDimension, vDimension] = planeDimensions(dimensions, plane);
  const normalAxis = normalAxisByPlane[plane];
  const normalIndex = axisIndex(normalAxis);

  return solids.map(({ primitive, primitiveIndex }) => {
    const centerU = projectLocalToMm(primitive.position[uAxis], uAxis, bounds, uDimension);
    const centerV = projectLocalToMm(primitive.position[vAxis], vAxis, bounds, vDimension);
    const extentU = projectLengthToMm(primitiveProjectedExtent(primitive, uAxis), uAxis, bounds, uDimension);
    const extentV = projectLengthToMm(primitiveProjectedExtent(primitive, vAxis), vAxis, bounds, vDimension);

    if (primitive.shape === "cylinder" || primitive.shape === "ring") {
      const primitiveNormalAxis = normalAxisFromPrimitive(primitive);
      const primitiveNormalIndex = axisIndex(primitiveNormalAxis);
      if (primitiveNormalIndex === normalIndex) {
        return {
          kind: "ellipse",
          primitiveIndex,
          cxMm: roundToTenth(centerU),
          cyMm: roundToTenth(centerV),
          rxMm: roundToTenth(Math.max(extentU / 2, 0.5)),
          ryMm: roundToTenth(Math.max(extentV / 2, 0.5)),
        };
      }
      return {
        kind: "rect",
        primitiveIndex,
        xMm: roundToTenth(centerU - extentU / 2),
        yMm: roundToTenth(centerV - extentV / 2),
        widthMm: roundToTenth(Math.max(extentU, 1)),
        heightMm: roundToTenth(Math.max(extentV, 1)),
        radiusMm: roundToTenth(Math.max(Math.min(extentU, extentV) / 2, 0.5)),
      };
    }

    return {
      kind: "rect",
      primitiveIndex,
      xMm: roundToTenth(centerU - extentU / 2),
      yMm: roundToTenth(centerV - extentV / 2),
      widthMm: roundToTenth(Math.max(extentU, 1)),
      heightMm: roundToTenth(Math.max(extentV, 1)),
      radiusMm: roundToTenth(Math.min(extentU, extentV) * 0.04),
    };
  });
}

export function addCircularCutoutPrimitive(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
  plane: ThreeViewPlane,
  point: { uMm: number; vMm: number },
  diameterMm: number,
): ThreeViewPrimitive[] {
  const bounds = primitiveBounds(primitives);
  const [uAxis, vAxis] = planeAxes(plane);
  const [uDimension, vDimension] = planeDimensions(dimensions, plane);
  const normalAxis = normalAxisByPlane[plane];
  const normalIndex = normalAxis === "x" ? 0 : normalAxis === "y" ? 1 : 2;
  const position = [...bounds.center] as [number, number, number];
  const clampedPoint = clampCircularHolePoint(dimensions, plane, point, diameterMm);
  const clampedU = clampedPoint.uMm;
  const clampedV = clampedPoint.vMm;
  position[uAxis] = bounds.center[uAxis] + (clampedU / Math.max(uDimension, 1) - 0.5) * bounds.size[uAxis];
  position[vAxis] = bounds.center[vAxis] + (clampedV / Math.max(vDimension, 1) - 0.5) * bounds.size[vAxis];
  position[normalIndex] = bounds.center[normalIndex];

  const normalLength = Math.max(bounds.size[normalIndex] * 1.35, 0.2);
  const size = circularCutoutSize([0.04, roundPrimitiveValue(normalLength), 0.04], normalIndex, bounds, dimensions, diameterMm);

  return [
    ...primitives,
    {
      shape: "cylinder",
      size,
      position: position.map(roundPrimitiveValue) as [number, number, number],
      rotation: cylinderRotationByNormalAxis[normalAxis],
      appearance: "cutout",
    },
  ];
}

export function moveCircularCutoutPrimitive(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
  primitiveIndex: number,
  point: { uMm: number; vMm: number },
): ThreeViewPrimitive[] {
  const target = primitives[primitiveIndex];
  if (!target || target.shape !== "cylinder" || target.appearance !== "cutout") return primitives;
  const bounds = primitiveBounds(primitives);
  const normalAxis = normalAxisFromPrimitive(target);
  const plane = normalAxis === "x" ? "side" : normalAxis === "y" ? "top" : "front";
  const [uAxis, vAxis] = planeAxes(plane);
  const [uDimension, vDimension] = planeDimensions(dimensions, plane);
  const hole = describeCircularCutouts(primitives, dimensions).find((item) => item.primitiveIndex === primitiveIndex);
  if (!hole) return primitives;
  const clampedPoint = clampCircularHolePoint(dimensions, plane, point, hole.diameterMm);
  const position = [...target.position] as [number, number, number];
  position[uAxis] = bounds.center[uAxis] + (clampedPoint.uMm / Math.max(uDimension, 1) - 0.5) * bounds.size[uAxis];
  position[vAxis] = bounds.center[vAxis] + (clampedPoint.vMm / Math.max(vDimension, 1) - 0.5) * bounds.size[vAxis];
  return primitives.map((primitive, index) => index === primitiveIndex
    ? { ...primitive, position: position.map(roundPrimitiveValue) as [number, number, number] }
    : primitive);
}

export function removePrimitiveAtIndex<TPrimitive>(
  primitives: TPrimitive[],
  primitiveIndex: number,
): TPrimitive[] {
  return primitives.filter((_, index) => index !== primitiveIndex);
}

export function updateCircularCutoutDiameter(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
  primitiveIndex: number,
  diameterMm: number,
): ThreeViewPrimitive[] {
  const target = primitives[primitiveIndex];
  if (!target || target.shape !== "cylinder" || target.appearance !== "cutout") return primitives;
  const bounds = primitiveBounds(primitives);
  const normalAxis = normalAxisFromPrimitive(target);
  const normalIndex = axisIndex(normalAxis);
  const size = circularCutoutSize(target.size, normalIndex, bounds, dimensions, diameterMm);

  const resized: ThreeViewPrimitive[] = primitives.map((primitive, index) => index === primitiveIndex
    ? { ...primitive, size }
    : primitive);
  const described = describeCircularCutouts(primitives, dimensions).find((hole) => hole.primitiveIndex === primitiveIndex);
  return described
    ? moveCircularCutoutPrimitive(resized, dimensions, primitiveIndex, { uMm: described.uMm, vMm: described.vMm })
    : resized;
}

export function describeCircularCutouts(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
): ThreeViewHoleDraft[] {
  const bounds = primitiveBounds(primitives);

  return primitives.flatMap((primitive, primitiveIndex) => {
    if (primitive.shape !== "cylinder" || primitive.appearance !== "cutout") return [];
    const normalAxis = normalAxisFromPrimitive(primitive);
    const plane = normalAxis === "x" ? "side" : normalAxis === "y" ? "top" : "front";
    const [uAxis, vAxis] = planeAxes(plane);
    const [uDimension, vDimension] = planeDimensions(dimensions, plane);
    const uMm = ((primitive.position[uAxis] - bounds.center[uAxis]) / bounds.size[uAxis] + 0.5) * uDimension;
    const vMm = ((primitive.position[vAxis] - bounds.center[vAxis]) / bounds.size[vAxis] + 0.5) * vDimension;
    return [{
      primitiveIndex,
      plane,
      axis: normalAxis,
      position: primitive.position,
      uMm: roundToTenth(uMm),
      vMm: roundToTenth(vMm),
      diameterMm: roundToTenth(circularCutoutDiameterMm(primitive, bounds, dimensions)),
    }];
  });
}

export function normalizeCircularCutoutPrimitives(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
): ThreeViewPrimitive[] {
  const bounds = primitiveBounds(primitives);
  return primitives.map((primitive) => {
    if (primitive.shape !== "cylinder" || primitive.appearance !== "cutout") return primitive;
    const normalIndex = axisIndex(normalAxisFromPrimitive(primitive));
    const diameterMm = circularCutoutDiameterMm(primitive, bounds, dimensions);
    const size = circularCutoutSize(primitive.size, normalIndex, bounds, dimensions, diameterMm);
    return size.every((value, index) => value === primitive.size[index]) ? primitive : { ...primitive, size };
  });
}

export function describeEditableCircularCutouts(
  primitives: ThreeViewPrimitive[],
  dimensions: ThreeViewDimensions,
): ThreeViewHoleDraft[] {
  return describeCircularCutouts(primitives, dimensions);
}
