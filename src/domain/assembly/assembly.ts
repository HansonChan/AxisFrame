export type Vec3 = [number, number, number];
export type PortKind = "shaft-bore" | "shaft-end" | "mount" | "fastener" | "support";
export type PortBehavior = "fixed" | "slide" | "stop";
export type SpatialOrientation = "horizontal" | "vertical" | "diagonal";

export type AssemblyPort = {
  id: string;
  axis: "x" | "y" | "z";
  direction?: Vec3;
  position: Vec3;
  diameter: number;
  kind?: PortKind;
  behavior?: PortBehavior;
  toleranceMm?: number;
  maximumClearanceMm?: number;
  capacity?: number;
};

export type ShaftSegment = {
  partId: string;
  start: Vec3;
  end: Vec3;
  diameter: number;
};

export type AssemblyConnection = {
  connectorId: string;
  portId: string;
  shaftId: string;
  positionOnShaft: number;
  behavior: PortBehavior;
};

export type SmartSnapResult = {
  position: Vec3;
  rotation: Vec3;
  connections: AssemblyConnection[];
  distanceMm: number;
  shaftOrientation: SpatialOrientation;
  directionPriorityApplied: boolean;
  orientationLocked?: boolean;
  preferredShaftPreserved?: boolean;
  panelContact?: {
    panelId: string;
    distanceMm: number;
  };
  panelHole?: {
    panelId: string;
    holeId: string;
  };
};

export type PanelContactTarget = {
  partId: string;
  center: Vec3;
  size: Vec3;
  rotation: Vec3;
};

export type ConnectorContactTarget = PanelContactTarget;

export type ConnectorSurfaceContact = {
  position: Vec3;
  connectorId: string;
  distanceMm: number;
  correctedPenetration: boolean;
};

export type ConnectorPanelSurfaceContact = {
  position: Vec3;
  panelId: string;
  distanceMm: number;
  correctedPenetration: boolean;
};

export type PanelHoleTarget = {
  panelId: string;
  holeId: string;
  center: Vec3;
  axis: Vec3;
  diameter: number;
};

export type PortMatePart = {
  partId: string;
  position: Vec3;
  rotation: Vec3;
  ports: AssemblyPort[];
};

export type ThreadedPortMateResult = {
  position: Vec3;
  fixedPortId: string;
  movingPortId: string;
  stemPartId: string;
  stemPortId: string;
  borePartId: string;
  borePortId: string;
  distanceMm: number;
};

type SnapInput = {
  connectorId: string;
  proposedPosition: Vec3;
  proposedRotation: Vec3;
  ports: AssemblyPort[];
  shafts: ShaftSegment[];
  occupiedConnections?: AssemblyConnection[];
  localScale?: number | Vec3;
  maxDistanceMm?: number;
  diameterToleranceMm?: number;
  axisToleranceDeg?: number;
  lockPortOrientation?: boolean;
  requiredShaftIds?: readonly string[];
};

const axisVectors: Record<AssemblyPort["axis"], Vec3> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
};

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (v: Vec3, amount: number): Vec3 => [v[0] * amount, v[1] * amount, v[2] * amount];
const scaleAxes = (v: Vec3, amount: number | Vec3): Vec3 => typeof amount === "number" ? scale(v, amount) : [v[0] * amount[0], v[1] * amount[1], v[2] * amount[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (v: Vec3) => Math.sqrt(dot(v, v));
const distance = (a: Vec3, b: Vec3) => length(subtract(a, b));
const normalize = (v: Vec3): Vec3 => {
  const magnitude = length(v);
  return magnitude > 1e-8 ? scale(v, 1 / magnitude) : [0, 0, 0];
};

export function portLocalDirection(port: AssemblyPort): Vec3 {
  return normalize(port.direction ?? axisVectors[port.axis]);
}

export function classifySpatialOrientation(vector: Vec3, cardinalTolerance = 0.85): SpatialOrientation {
  const direction = normalize(vector);
  const verticalAmount = Math.abs(direction[1]);
  const horizontalAmount = Math.hypot(direction[0], direction[2]);
  if (verticalAmount >= cardinalTolerance) return "vertical";
  if (horizontalAmount >= cardinalTolerance) return "horizontal";
  return "diagonal";
}

export function shaftSpatialOrientation(segment: ShaftSegment): SpatialOrientation {
  return classifySpatialOrientation(subtract(segment.end, segment.start));
}

function rotateVector(vector: Vec3, rotation: Vec3): Vec3 {
  const [rx, ry, rz] = rotation.map((value) => value * Math.PI / 180);
  const [sinX, cosX] = [Math.sin(rx), Math.cos(rx)];
  const [sinY, cosY] = [Math.sin(ry), Math.cos(ry)];
  const [sinZ, cosZ] = [Math.sin(rz), Math.cos(rz)];
  // Three.js renders parts with an XYZ Euler. For column vectors that means
  // applying the component rotations in Z → Y → X order.
  const afterZ: Vec3 = [vector[0] * cosZ - vector[1] * sinZ, vector[0] * sinZ + vector[1] * cosZ, vector[2]];
  const afterY: Vec3 = [afterZ[0] * cosY + afterZ[2] * sinY, afterZ[1], -afterZ[0] * sinY + afterZ[2] * cosY];
  return [afterY[0], afterY[1] * cosX - afterY[2] * sinX, afterY[1] * sinX + afterY[2] * cosX];
}

function closestPointOnSegment(point: Vec3, segment: ShaftSegment) {
  const direction = subtract(segment.end, segment.start);
  const lengthSquared = dot(direction, direction);
  const t = lengthSquared > 1e-8
    ? Math.max(0, Math.min(1, dot(subtract(point, segment.start), direction) / lengthSquared))
    : 0;
  return { point: add(segment.start, scale(direction, t)), t };
}

function behaviorForPort(port: AssemblyPort): AssemblyConnection["behavior"] {
  if (port.behavior) return port.behavior;
  const id = port.id.toUpperCase();
  if (id.includes("SLIDE")) return "slide";
  if (id.includes("STOP") || id.includes("SHAFT") && id.includes("RING")) return "stop";
  return "fixed";
}

export function isShaftAssemblyPort(port: AssemblyPort) {
  if (port.kind) return port.kind === "shaft-bore";
  const id = port.id.toUpperCase();
  if (port.diameter <= 0) return false;
  if (["MOUNT", "CLAMP", "LOCK", "FASTENER", "FLANGE", "TABLE", "SUPPORT"].some((token) => id.includes(token))) return false;
  return id.startsWith("P") || id.includes("SHAFT") || id.includes("SLIDE") || id === "BORE";
}

export function isThreadedStemPort(port: AssemblyPort) {
  return port.kind === "shaft-end" && port.diameter > 0;
}

/**
 * Checks a shaft against a bore using an asymmetric fit rule. A shaft may be
 * up to `maximumClearanceMm` smaller than the bore, while a shaft that is
 * larger than the bore only receives the much tighter manufacturing tolerance.
 */
export function isShaftDiameterCompatible({
  boreDiameterMm,
  shaftDiameterMm,
  oversizeToleranceMm = 0.25,
  maximumClearanceMm = 2,
}: {
  boreDiameterMm: number;
  shaftDiameterMm: number;
  oversizeToleranceMm?: number;
  maximumClearanceMm?: number;
}) {
  if (
    !Number.isFinite(boreDiameterMm)
    || !Number.isFinite(shaftDiameterMm)
    || boreDiameterMm <= 0
    || shaftDiameterMm <= 0
  ) return false;
  const clearanceMm = boreDiameterMm - shaftDiameterMm;
  return clearanceMm >= 0
    ? clearanceMm <= Math.max(maximumClearanceMm, oversizeToleranceMm)
    : -clearanceMm <= oversizeToleranceMm;
}

/**
 * Mates a male threaded stem to a bore without rotating either component.
 * Port positions are expected to use the same fitted scene scale as the model.
 */
export function findBestThreadedPortMate({
  fixed,
  moving,
  maxDistanceMm = 10000,
  axisToleranceDeg = 7.5,
  sceneUnitsPerMm = 0.01,
}: {
  fixed: PortMatePart;
  moving: PortMatePart;
  maxDistanceMm?: number;
  axisToleranceDeg?: number;
  sceneUnitsPerMm?: number;
}): ThreadedPortMateResult | null {
  if (sceneUnitsPerMm <= 0) return null;
  const minimumAxisDot = Math.cos(axisToleranceDeg * Math.PI / 180);
  const candidates: ThreadedPortMateResult[] = [];

  for (const fixedPort of fixed.ports) {
    for (const movingPort of moving.ports) {
      const fixedIsStem = isThreadedStemPort(fixedPort);
      const movingIsStem = isThreadedStemPort(movingPort);
      const fixedIsBore = isShaftAssemblyPort(fixedPort);
      const movingIsBore = isShaftAssemblyPort(movingPort);
      if (!((fixedIsStem && movingIsBore) || (movingIsStem && fixedIsBore))) continue;

      const stemPort = fixedIsStem ? fixedPort : movingPort;
      const borePort = fixedIsBore ? fixedPort : movingPort;
      const stemPart = fixedIsStem ? fixed : moving;
      const borePart = fixedIsBore ? fixed : moving;
      const fitToleranceMm = Math.max(
        0.25,
        stemPort.toleranceMm ?? 0,
        borePort.toleranceMm ?? 0,
      );
      if (!isShaftDiameterCompatible({
        boreDiameterMm: borePort.diameter,
        shaftDiameterMm: stemPort.diameter,
        oversizeToleranceMm: fitToleranceMm,
        maximumClearanceMm: fitToleranceMm,
      })) continue;

      const fixedAxis = normalize(rotateVector(portLocalDirection(fixedPort), fixed.rotation));
      const movingAxis = normalize(rotateVector(portLocalDirection(movingPort), moving.rotation));
      if (Math.abs(dot(fixedAxis, movingAxis)) < minimumAxisDot) continue;

      const fixedPortPosition = add(fixed.position, rotateVector(fixedPort.position, fixed.rotation));
      const movingPortOffset = rotateVector(movingPort.position, moving.rotation);
      const solvedPosition = subtract(fixedPortPosition, movingPortOffset);
      const distanceMm = distance(solvedPosition, moving.position) / sceneUnitsPerMm;
      if (distanceMm > maxDistanceMm) continue;
      candidates.push({
        position: solvedPosition,
        fixedPortId: fixedPort.id,
        movingPortId: movingPort.id,
        stemPartId: stemPart.partId,
        stemPortId: stemPort.id,
        borePartId: borePart.partId,
        borePortId: borePort.id,
        distanceMm,
      });
    }
  }

  candidates.sort((left, right) =>
    left.distanceMm - right.distanceMm
    || left.fixedPortId.localeCompare(right.fixedPortId)
    || left.movingPortId.localeCompare(right.movingPortId));
  return candidates[0] ?? null;
}

export function findBestSmartSnap({
  connectorId,
  proposedPosition,
  proposedRotation,
  ports,
  shafts,
  localScale = 1,
  maxDistanceMm = 35,
  diameterToleranceMm = 0.25,
  axisToleranceDeg = 5,
  lockPortOrientation = false,
  requiredShaftIds = [],
}: SnapInput): SmartSnapResult | null {
  const shaftPorts = ports.filter(isShaftAssemblyPort);
  if (shaftPorts.length === 0 || shafts.length === 0) return null;
  const maxDistance = maxDistanceMm / 100;
  const minimumAxisDot = Math.cos(axisToleranceDeg * Math.PI / 180);
  // Smart connection is translation-only. Port axes are evaluated in the
  // component's current pose and the solver never searches alternative poses.
  const rotation: Vec3 = [...proposedRotation];

  const proposedPortOrientations = new Map(shaftPorts.map((port) => [
    port.id,
    classifySpatialOrientation(rotateVector(scaleAxes(portLocalDirection(port), localScale), proposedRotation)),
  ]));
  let best: (SmartSnapResult & { score: number; matchCount: number; directionMatchCount: number }) | null = null;
  for (const primaryPort of shaftPorts) {
    const rotatedPortAxis = normalize(rotateVector(scaleAxes(portLocalDirection(primaryPort), localScale), rotation));
    const rotatedPortOffset = rotateVector(scaleAxes(primaryPort.position, localScale), rotation);
    const proposedPortPosition = add(proposedPosition, rotatedPortOffset);
    for (const shaft of shafts) {
        if (requiredShaftIds.length > 0 && !requiredShaftIds.includes(shaft.partId)) continue;
        const primaryPortToleranceMm = Math.max(diameterToleranceMm, primaryPort.toleranceMm ?? 0);
        if (!isShaftDiameterCompatible({
          boreDiameterMm: primaryPort.diameter,
          shaftDiameterMm: shaft.diameter,
          oversizeToleranceMm: primaryPortToleranceMm,
          maximumClearanceMm: Math.max(primaryPort.maximumClearanceMm ?? 2, primaryPortToleranceMm),
        })) continue;
        const shaftAxis = normalize(subtract(shaft.end, shaft.start));
        if (Math.abs(dot(rotatedPortAxis, shaftAxis)) < minimumAxisDot) continue;
        const target = closestPointOnSegment(proposedPortPosition, shaft);
        const snapDistance = distance(proposedPortPosition, target.point);
        if (snapDistance > maxDistance) continue;
        const solvedPosition = subtract(target.point, rotatedPortOffset);
        const matches: AssemblyConnection[] = [];

        for (const port of shaftPorts) {
          const worldAxis = normalize(rotateVector(scaleAxes(portLocalDirection(port), localScale), rotation));
          const worldPosition = add(solvedPosition, rotateVector(scaleAxes(port.position, localScale), rotation));
          let closestMatch: { shaft: ShaftSegment; t: number; gap: number } | null = null;
          for (const candidateShaft of shafts) {
            if (requiredShaftIds.length > 0 && !requiredShaftIds.includes(candidateShaft.partId)) continue;
            if (matches.some((match) => match.shaftId === candidateShaft.partId)) continue;
            const portToleranceMm = Math.max(diameterToleranceMm, port.toleranceMm ?? 0);
            if (!isShaftDiameterCompatible({
              boreDiameterMm: port.diameter,
              shaftDiameterMm: candidateShaft.diameter,
              oversizeToleranceMm: portToleranceMm,
              maximumClearanceMm: Math.max(port.maximumClearanceMm ?? 2, portToleranceMm),
            })) continue;
            const candidateAxis = normalize(subtract(candidateShaft.end, candidateShaft.start));
            if (Math.abs(dot(worldAxis, candidateAxis)) < minimumAxisDot) continue;
            const closest = closestPointOnSegment(worldPosition, candidateShaft);
            const gap = distance(worldPosition, closest.point);
            if (gap <= 0.12 && (!closestMatch || gap < closestMatch.gap)) {
              closestMatch = { shaft: candidateShaft, t: closest.t, gap };
            }
          }
          if (!closestMatch) continue;
          matches.push({
            connectorId,
            portId: port.id,
            shaftId: closestMatch.shaft.partId,
            positionOnShaft: closestMatch.t,
            behavior: behaviorForPort(port),
          });
        }

        if (!matches.some((match) => match.portId === primaryPort.id && match.shaftId === shaft.partId)) continue;
        const directionMatchCount = matches.filter((match) => {
          const preferred = proposedPortOrientations.get(match.portId) ?? "diagonal";
          const matchedShaft = shafts.find((candidate) => candidate.partId === match.shaftId);
          const actual = matchedShaft ? shaftSpatialOrientation(matchedShaft) : "diagonal";
          return preferred !== "diagonal" && preferred === actual;
        }).length;
        const primaryOrientation = shaftSpatialOrientation(shaft);
        const primaryPreferredOrientation = proposedPortOrientations.get(primaryPort.id) ?? "diagonal";
        const score = snapDistance * 1000 - matches.length * 100;
        if (
          !best
          || matches.length > best.matchCount
          || matches.length === best.matchCount && directionMatchCount > best.directionMatchCount
          || matches.length === best.matchCount && directionMatchCount === best.directionMatchCount && score < best.score
        ) {
          best = {
            position: solvedPosition,
            rotation,
            connections: matches,
            distanceMm: Math.round(snapDistance * 1000) / 10,
            shaftOrientation: primaryOrientation,
            directionPriorityApplied: primaryPreferredOrientation !== "diagonal" && primaryPreferredOrientation === primaryOrientation,
            orientationLocked: lockPortOrientation,
            preferredShaftPreserved: requiredShaftIds.length > 0 && matches.some((match) => requiredShaftIds.includes(match.shaftId)),
            score,
            matchCount: matches.length,
            directionMatchCount,
          };
        }
    }
  }

  if (!best) return null;
  return {
    position: best.position,
    rotation: [...proposedRotation],
    connections: best.connections,
    distanceMm: best.distanceMm,
    shaftOrientation: best.shaftOrientation,
    directionPriorityApplied: best.directionPriorityApplied,
    orientationLocked: best.orientationLocked,
    preferredShaftPreserved: best.preferredShaftPreserved,
  };
}

/**
 * Snaps a shaft centreline through a compatible panel hole. A shaft is a shared
 * structural member, so this creates another relation without consuming the
 * shaft or displacing any connector already attached to it.
 */
export function findBestShaftPanelHoleSnap({
  shaftId,
  proposedPosition,
  proposedRotation,
  localAxis,
  shaftDiameterMm,
  shaftLength,
  holes,
  maxDistanceMm = 35,
  diameterToleranceMm = 0.25,
  axisToleranceDeg = 5,
}: {
  shaftId: string;
  proposedPosition: Vec3;
  proposedRotation: Vec3;
  localAxis: Vec3;
  shaftDiameterMm: number;
  shaftLength: number;
  holes: readonly PanelHoleTarget[];
  maxDistanceMm?: number;
  diameterToleranceMm?: number;
  axisToleranceDeg?: number;
}): SmartSnapResult | null {
  if (holes.length === 0 || shaftLength <= 0) return null;
  const maxDistance = maxDistanceMm / 100;
  const minimumAxisDot = Math.cos(axisToleranceDeg * Math.PI / 180);
  const rotation: Vec3 = [...proposedRotation];

  let best: (SmartSnapResult & { score: number }) | null = null;
  const worldAxis = normalize(rotateVector(localAxis, rotation));
  if (length(worldAxis) < 0.99) return null;
  for (const hole of holes) {
      if (!isShaftDiameterCompatible({
        boreDiameterMm: hole.diameter,
        shaftDiameterMm,
        oversizeToleranceMm: diameterToleranceMm,
      })) continue;
      const holeAxis = normalize(hole.axis);
      if (Math.abs(dot(worldAxis, holeAxis)) < minimumAxisDot) continue;
      const fromCenter = subtract(hole.center, proposedPosition);
      const axialDistance = dot(fromCenter, worldAxis);
      if (Math.abs(axialDistance) > shaftLength / 2) continue;
      const perpendicularOffset = subtract(fromCenter, scale(worldAxis, axialDistance));
      const snapDistance = length(perpendicularOffset);
      if (snapDistance > maxDistance) continue;
      const solvedPosition = add(proposedPosition, perpendicularOffset);
      const positionOnShaft = Math.max(0, Math.min(1, axialDistance / shaftLength + 0.5));
      const score = snapDistance * 1000;
      if (best && best.score <= score) continue;
      best = {
        position: solvedPosition,
        rotation,
        connections: [{
          connectorId: hole.panelId,
          portId: hole.holeId,
          shaftId,
          positionOnShaft,
          behavior: "slide",
        }],
        distanceMm: Math.round(snapDistance * 1000) / 10,
        shaftOrientation: classifySpatialOrientation(worldAxis),
        directionPriorityApplied: true,
        orientationLocked: true,
        panelHole: { panelId: hole.panelId, holeId: hole.holeId },
        score,
      };
  }

  if (!best) return null;
  const solvedAxis = normalize(rotateVector(localAxis, best.rotation));
  const throughConnections = holes.flatMap((hole) => {
    if (!isShaftDiameterCompatible({
      boreDiameterMm: hole.diameter,
      shaftDiameterMm,
      oversizeToleranceMm: diameterToleranceMm,
    })) return [];
    if (Math.abs(dot(solvedAxis, normalize(hole.axis))) < minimumAxisDot) return [];
    const fromCenter = subtract(hole.center, best!.position);
    const axialDistance = dot(fromCenter, solvedAxis);
    if (Math.abs(axialDistance) > shaftLength / 2) return [];
    const centerlineGap = length(subtract(fromCenter, scale(solvedAxis, axialDistance)));
    if (centerlineGap > 0.01) return [];
    return [{
      connectorId: hole.panelId,
      portId: hole.holeId,
      shaftId,
      positionOnShaft: Math.max(0, Math.min(1, axialDistance / shaftLength + 0.5)),
      behavior: "slide" as const,
    }];
  });
  return {
    position: best.position,
    rotation: [...proposedRotation],
    connections: throughConnections,
    distanceMm: best.distanceMm,
    shaftOrientation: best.shaftOrientation,
    directionPriorityApplied: best.directionPriorityApplied,
    panelHole: best.panelHole,
  };
}

function worldToLocalVector(vector: Vec3, rotation: Vec3): Vec3 {
  const basisX = normalize(rotateVector([1, 0, 0], rotation));
  const basisY = normalize(rotateVector([0, 1, 0], rotation));
  const basisZ = normalize(rotateVector([0, 0, 1], rotation));
  return [dot(vector, basisX), dot(vector, basisY), dot(vector, basisZ)];
}

/**
 * Places an oriented connector envelope against an oriented panel face. The
 * connector may approach either face, but its volume is never allowed to pass
 * through the panel while their projected surface footprints overlap.
 */
export function snapConnectorToPanelSurface({
  position,
  rotation,
  size,
  panels,
  snapDistanceMm = 3,
}: {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  panels: readonly PanelContactTarget[];
  snapDistanceMm?: number;
}): ConnectorPanelSurfaceContact | null {
  const connectorHalfSize = size.map((value) => Math.max(0.0001, Math.abs(value) / 2)) as Vec3;
  const connectorWorldAxes = [
    normalize(rotateVector([1, 0, 0], rotation)),
    normalize(rotateVector([0, 1, 0], rotation)),
    normalize(rotateVector([0, 0, 1], rotation)),
  ] as const;
  const snapDistance = Math.max(0, snapDistanceMm) / 100;
  let best: (ConnectorPanelSurfaceContact & { travel: number }) | null = null;

  for (const panel of panels) {
    const panelHalfSize = panel.size.map((value) => Math.max(0.0001, Math.abs(value) / 2)) as Vec3;
    const thicknessAxis = panel.size.reduce(
      (smallestAxis, value, axis) => Math.abs(value) < Math.abs(panel.size[smallestAxis]) ? axis : smallestAxis,
      0,
    );
    const localCenter = worldToLocalVector(subtract(position, panel.center), panel.rotation);
    const projectedConnectorHalfSize: Vec3 = [0, 0, 0];
    connectorWorldAxes.forEach((worldAxis, connectorAxis) => {
      const localAxis = worldToLocalVector(worldAxis, panel.rotation);
      for (let panelAxis = 0; panelAxis < 3; panelAxis += 1) {
        projectedConnectorHalfSize[panelAxis] += Math.abs(localAxis[panelAxis]) * connectorHalfSize[connectorAxis];
      }
    });
    const surfaceAxes = [0, 1, 2].filter((axis) => axis !== thicknessAxis);
    const overlapsSurface = surfaceAxes.every((axis) =>
      Math.abs(localCenter[axis]) < panelHalfSize[axis] + projectedConnectorHalfSize[axis] - 1e-8,
    );
    if (!overlapsSurface) continue;

    const contactDistance = panelHalfSize[thicknessAxis] + projectedConnectorHalfSize[thicknessAxis];
    const currentDistance = Math.abs(localCenter[thicknessAxis]);
    const penetration = currentDistance < contactDistance - 1e-8;
    if (!penetration && currentDistance - contactDistance > snapDistance) continue;
    const side = localCenter[thicknessAxis] < 0 ? -1 : 1;
    const localCorrection = side * contactDistance - localCenter[thicknessAxis];
    const localNormal: Vec3 = [0, 0, 0];
    localNormal[thicknessAxis] = 1;
    const worldNormal = normalize(rotateVector(localNormal, panel.rotation));
    const correctedPosition = add(position, scale(worldNormal, localCorrection));
    const travel = Math.abs(localCorrection);
    if (!best || travel < best.travel) {
      best = {
        position: correctedPosition,
        panelId: panel.partId,
        distanceMm: Math.round(travel * 1000) / 10,
        correctedPenetration: penetration,
        travel,
      };
    }
  }

  if (!best) return null;
  const { travel: _travel, ...contact } = best;
  return contact;
}

/**
 * Places one oriented connector envelope against another connector face. Near
 * faces snap together, overlapping volumes are separated by the minimum local
 * translation, and an explicit pair operation may also align the face centers.
 */
export function snapConnectorToConnectorSurface({
  position,
  rotation,
  size,
  connectors,
  snapDistanceMm = 3,
  alignSurfaceCenters = false,
}: {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
  connectors: readonly ConnectorContactTarget[];
  snapDistanceMm?: number;
  alignSurfaceCenters?: boolean;
}): ConnectorSurfaceContact | null {
  const movingHalfSize = size.map((value) => Math.max(0.0001, Math.abs(value) / 2)) as Vec3;
  const movingWorldAxes = [
    normalize(rotateVector([1, 0, 0], rotation)),
    normalize(rotateVector([0, 1, 0], rotation)),
    normalize(rotateVector([0, 0, 1], rotation)),
  ] as const;
  const snapDistance = Math.max(0, snapDistanceMm) / 100;
  let best: (ConnectorSurfaceContact & { travel: number }) | null = null;

  for (const connector of connectors) {
    const targetHalfSize = connector.size.map((value) => Math.max(0.0001, Math.abs(value) / 2)) as Vec3;
    const localCenter = worldToLocalVector(subtract(position, connector.center), connector.rotation);
    const projectedMovingHalfSize: Vec3 = [0, 0, 0];
    movingWorldAxes.forEach((worldAxis, movingAxis) => {
      const localAxis = worldToLocalVector(worldAxis, connector.rotation);
      for (let targetAxis = 0; targetAxis < 3; targetAxis += 1) {
        projectedMovingHalfSize[targetAxis] += Math.abs(localAxis[targetAxis]) * movingHalfSize[movingAxis];
      }
    });
    const contactDistances = targetHalfSize.map(
      (halfSize, axis) => halfSize + projectedMovingHalfSize[axis],
    ) as Vec3;
    const separations = localCenter.map(
      (value, axis) => Math.abs(value) - contactDistances[axis],
    ) as Vec3;
    const penetrating = separations.every((value) => value < -1e-8);
    const candidateAxes = ([0, 1, 2] as const).filter((axis) => {
      if (alignSurfaceCenters) return true;
      const otherAxesOverlap = ([0, 1, 2] as const)
        .filter((otherAxis) => otherAxis !== axis)
        .every((otherAxis) => separations[otherAxis] < -1e-8);
      if (!otherAxesOverlap) return false;
      if (penetrating) return separations[axis] === Math.max(...separations);
      return separations[axis] >= -1e-8 && separations[axis] <= snapDistance;
    });

    for (const axis of candidateAxes) {
      const side = localCenter[axis] < 0 ? -1 : 1;
      const correctedLocalCenter = alignSurfaceCenters
        ? ([0, 0, 0] as Vec3)
        : ([...localCenter] as Vec3);
      correctedLocalCenter[axis] = side * contactDistances[axis];
      const localCorrection = subtract(correctedLocalCenter, localCenter);
      const worldCorrection = rotateVector(localCorrection, connector.rotation);
      const correctedPosition = add(position, worldCorrection);
      const travel = length(worldCorrection);
      if (!alignSurfaceCenters && travel > snapDistance && !penetrating) continue;
      if (!best || travel < best.travel) {
        best = {
          position: correctedPosition,
          connectorId: connector.partId,
          distanceMm: Math.round(travel * 1000) / 10,
          correctedPenetration: penetrating,
          travel,
        };
      }
    }
  }

  if (!best) return null;
  const { travel: _travel, ...contact } = best;
  return contact;
}

function lineBoxBoundaryParameters(origin: Vec3, direction: Vec3, halfSize: Vec3): [number, number] | null {
  let entry = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (Math.abs(origin[axis]) > halfSize[axis]) return null;
      continue;
    }
    const first = (-halfSize[axis] - origin[axis]) / direction[axis];
    const second = (halfSize[axis] - origin[axis]) / direction[axis];
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return null;
  }
  return Number.isFinite(entry) && Number.isFinite(exit) ? [entry, exit] : null;
}

/**
 * Keeps an axial stop on its shaft and places its axial face against the nearest
 * panel boundary. Scene distances use the same 0.01 scene-unit/mm convention as
 * the editor; the helper itself remains independent from the renderer.
 */
export function snapAxialStopToPanelSurface({
  position,
  shaft,
  panels,
  stopHalfThickness,
  maxDistanceMm = 35,
}: {
  position: Vec3;
  shaft: ShaftSegment;
  panels: readonly PanelContactTarget[];
  stopHalfThickness: number;
  maxDistanceMm?: number;
}): { position: Vec3; panelId: string; distanceMm: number } | null {
  const shaftDirection = normalize(subtract(shaft.end, shaft.start));
  if (length(shaftDirection) < 1e-8) return null;
  const shaftLength = distance(shaft.start, shaft.end);
  const maxDistance = maxDistanceMm / 100;
  let best: { position: Vec3; panelId: string; distanceMm: number; distance: number } | null = null;

  for (const panel of panels) {
    const localOrigin = worldToLocalVector(subtract(position, panel.center), panel.rotation);
    const localDirection = normalize(worldToLocalVector(shaftDirection, panel.rotation));
    const halfSize = panel.size.map((value) => Math.max(0.0001, Math.abs(value) / 2)) as Vec3;
    const boundaries = lineBoxBoundaryParameters(localOrigin, localDirection, halfSize);
    if (!boundaries) continue;
    const candidates = [
      add(position, scale(shaftDirection, boundaries[0] - stopHalfThickness)),
      add(position, scale(shaftDirection, boundaries[1] + stopHalfThickness)),
    ];
    for (const candidate of candidates) {
      const travel = distance(position, candidate);
      if (travel > maxDistance) continue;
      const positionOnShaft = shaftLength > 1e-8
        ? dot(subtract(candidate, shaft.start), shaftDirection) / shaftLength
        : -1;
      if (positionOnShaft < -1e-6 || positionOnShaft > 1 + 1e-6) continue;
      if (!best || travel < best.distance) {
        best = {
          position: candidate,
          panelId: panel.partId,
          distanceMm: Math.round(travel * 1000) / 10,
          distance: travel,
        };
      }
    }
  }

  if (!best) return null;
  return { position: best.position, panelId: best.panelId, distanceMm: best.distanceMm };
}
