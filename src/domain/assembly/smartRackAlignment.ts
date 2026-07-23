import { hasComponentUsage, type ComponentUsageTag } from "../components/componentUsage";

export type SmartAlignAxis = "x" | "y" | "z";
export type SmartAlignPartKind = "joint" | "rod" | "panel";
export type SmartAlignVec3 = [number, number, number];

export type SmartAlignPart = {
  id: string;
  kind: SmartAlignPartKind;
  positionMm: SmartAlignVec3;
  rotationDeg: SmartAlignVec3;
  movable: boolean;
  axis?: SmartAlignAxis;
  localAxis?: "x" | "z";
  lengthMm?: number;
  thicknessMm?: number;
  usageTags?: ComponentUsageTag[];
};

export type SmartAlignPlacement = {
  id: string;
  positionMm: SmartAlignVec3;
  rotationDeg: SmartAlignVec3;
  role: "frame-edge" | "connection-node" | "support-plane" | "grid";
};

export type SmartRackAlignmentResult = {
  placements: SmartAlignPlacement[];
  movedCount: number;
  connectionCandidateCount: number;
};

type RackSlot = {
  id: string;
  axis: SmartAlignAxis;
  center: SmartAlignVec3;
  start: SmartAlignVec3;
  end: SmartAlignVec3;
  lengthMm: number;
};

const distance = (a: SmartAlignVec3, b: SmartAlignVec3) => Math.hypot(
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
);

const roundToGrid = (value: number, gridMm: number) => {
  const rounded = Math.round(value / gridMm) * gridMm;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const positionKey = (position: SmartAlignVec3) => position.map((value) => Math.round(value * 10) / 10).join(":");

const uniqueNumbers = (values: number[]) => [...new Set(values.map((value) => Math.round(value * 10) / 10))];

function canonicalRodRotation(localAxis: SmartAlignPart["localAxis"], axis: SmartAlignAxis): SmartAlignVec3 {
  if (localAxis === "z") {
    if (axis === "x") return [0, 90, 0];
    if (axis === "y") return [90, 0, 0];
    return [0, 0, 0];
  }
  if (axis === "y") return [0, 0, 90];
  if (axis === "z") return [0, -90, 0];
  return [0, 0, 0];
}

function rackSlots(width: number, height: number, depth: number): { slots: RackSlot[]; levels: number[] } {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const levels = uniqueNumbers([0, height / 4, height / 2, height * 3 / 4, height]);
  const slots: RackSlot[] = [];
  const addSlot = (id: string, axis: SmartAlignAxis, start: SmartAlignVec3, end: SmartAlignVec3) => {
    slots.push({
      id,
      axis,
      start,
      end,
      center: [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2],
      lengthMm: distance(start, end),
    });
  };

  levels.forEach((level, levelIndex) => {
    [-halfDepth, halfDepth].forEach((z, sideIndex) => {
      addSlot(`x-${levelIndex}-${sideIndex}`, "x", [-halfWidth, level, z], [halfWidth, level, z]);
    });
    [-halfWidth, halfWidth].forEach((x, sideIndex) => {
      addSlot(`z-${levelIndex}-${sideIndex}`, "z", [x, level, -halfDepth], [x, level, halfDepth]);
    });
  });

  const verticalRanges: Array<[number, number]> = [[0, height / 2], [height / 2, height], [0, height]];
  [-halfWidth, halfWidth].forEach((x, xIndex) => {
    [-halfDepth, halfDepth].forEach((z, zIndex) => {
      verticalRanges.forEach(([startY, endY], rangeIndex) => {
        addSlot(`y-${xIndex}-${zIndex}-${rangeIndex}`, "y", [x, startY, z], [x, endY, z]);
      });
    });
  });
  return { slots, levels };
}

function occupiesRodSlot(part: SmartAlignPart, slot: RackSlot) {
  if (part.kind !== "rod" || part.movable || part.axis !== slot.axis) return false;
  const lengthTolerance = Math.max(80, slot.lengthMm * 0.18);
  return distance(part.positionMm, slot.center) <= 45 && Math.abs((part.lengthMm ?? slot.lengthMm) - slot.lengthMm) <= lengthTolerance;
}

function changed(part: SmartAlignPart, placement: SmartAlignPlacement) {
  return distance(part.positionMm, placement.positionMm) > 0.5 ||
    placement.rotationDeg.some((value, index) => Math.abs(value - part.rotationDeg[index]) > 0.5);
}

export function planSmartRackAlignment({
  parts,
  frame,
  gridMm = 10,
}: {
  parts: SmartAlignPart[];
  frame: { width: number; height: number; depth: number };
  gridMm?: number;
}): SmartRackAlignmentResult {
  const targets = parts.filter((part) => part.movable);
  if (targets.length === 0) return { placements: [], movedCount: 0, connectionCandidateCount: 0 };

  const width = Math.max(100, roundToGrid(frame.width, gridMm));
  const height = Math.max(100, roundToGrid(frame.height, gridMm));
  const depth = Math.max(100, roundToGrid(frame.depth, gridMm));
  const { slots, levels } = rackSlots(width, height, depth);
  const fixedRodSlots = slots.filter((slot) => parts.some((part) => occupiesRodSlot(part, slot)));
  const occupiedSlotIds = new Set(fixedRodSlots.map((slot) => slot.id));
  const placements: SmartAlignPlacement[] = [];
  const plannedRodSlots: RackSlot[] = [...fixedRodSlots];
  const desiredSupportLevels = uniqueNumbers([
    ...targets.filter((part) => part.kind === "panel" || hasComponentUsage(part.usageTags, "panel-support"))
      .map((part) => levels.slice().sort((a, b) => Math.abs(part.positionMm[1] - a) - Math.abs(part.positionMm[1] - b))[0])
      .filter((level) => level !== undefined),
  ]);
  const isDesiredSupportLevel = (level: number) => desiredSupportLevels.length === 0 || desiredSupportLevels.includes(Math.round(level * 10) / 10);

  targets.filter((part) => part.kind === "rod").forEach((part, index) => {
    const available = slots.filter((slot) => !occupiedSlotIds.has(slot.id));
    const slot = available.sort((a, b) => {
      const score = (candidate: RackSlot) => {
        const supportLevelBonus = candidate.axis !== "y" && isDesiredSupportLevel(candidate.center[1]) ? 220 : 0;
        const verticalGroundBonus = candidate.axis === "y" && candidate.start[1] === 0 ? 140 : 0;
        return distance(part.positionMm, candidate.center) +
          Math.abs((part.lengthMm ?? candidate.lengthMm) - candidate.lengthMm) * 0.7 +
          (part.axis && part.axis !== candidate.axis ? 100 : 0) -
          supportLevelBonus -
          verticalGroundBonus;
      };
      return score(a) - score(b);
    })[0];
    if (!slot) {
      placements.push({
        id: part.id,
        positionMm: part.positionMm.map((value) => roundToGrid(value, gridMm)) as SmartAlignVec3,
        rotationDeg: part.rotationDeg.map((value) => roundToGrid(value, 90)) as SmartAlignVec3,
        role: "grid",
      });
      return;
    }
    occupiedSlotIds.add(slot.id);
    plannedRodSlots.push(slot);
    placements.push({
      id: part.id,
      positionMm: slot.center.map((value) => roundToGrid(value, gridMm)) as SmartAlignVec3,
      rotationDeg: canonicalRodRotation(part.localAxis, slot.axis),
      role: "frame-edge",
    });
  });

  const endpointFrequency = new Map<string, { position: SmartAlignVec3; count: number }>();
  plannedRodSlots.forEach((slot) => {
    [slot.start, slot.end].forEach((position) => {
      const key = positionKey(position);
      const previous = endpointFrequency.get(key);
      endpointFrequency.set(key, { position, count: (previous?.count ?? 0) + 1 });
    });
  });
  levels.forEach((y) => {
    [-width / 2, width / 2].forEach((x) => {
      [-depth / 2, depth / 2].forEach((z) => {
        const position: SmartAlignVec3 = [x, y, z];
        const key = positionKey(position);
        if (!endpointFrequency.has(key)) endpointFrequency.set(key, { position, count: 0 });
      });
    });
  });

  const occupiedJointNodes = new Set<string>();
  parts.filter((part) => part.kind === "joint" && !part.movable).forEach((part) => {
    const nearest = [...endpointFrequency.values()]
      .sort((a, b) => distance(part.positionMm, a.position) - distance(part.positionMm, b.position))[0];
    if (nearest && distance(part.positionMm, nearest.position) < 45) occupiedJointNodes.add(positionKey(nearest.position));
  });
  let connectionCandidateCount = 0;
  targets.filter((part) => part.kind === "joint").forEach((part, index) => {
    if (hasComponentUsage(part.usageTags, "panel-support")) return;
    const candidates = [...endpointFrequency.values()].filter(({ position }) => !occupiedJointNodes.has(positionKey(position)));
    const candidate = candidates.sort((a, b) => {
      const score = (item: { position: SmartAlignVec3; count: number }) => distance(part.positionMm, item.position) - item.count * 140;
      return score(a) - score(b);
    })[0];
    const fallback: SmartAlignVec3 = [
      roundToGrid((index % 4 - 1.5) * gridMm * 4, gridMm),
      roundToGrid(height / 2 + Math.floor(index / 4) * gridMm * 4, gridMm),
      roundToGrid(depth / 2, gridMm),
    ];
    const position = candidate?.position ?? fallback;
    occupiedJointNodes.add(positionKey(position));
    connectionCandidateCount += candidate?.count ?? 0;
    placements.push({
      id: part.id,
      positionMm: position.map((value) => roundToGrid(value, gridMm)) as SmartAlignVec3,
      rotationDeg: part.rotationDeg.map((value) => roundToGrid(value, 90)) as SmartAlignVec3,
      role: candidate ? "connection-node" : "grid",
    });
  });

  const supportLevelCounts = new Map<number, number>();
  plannedRodSlots.filter((slot) => slot.axis !== "y").forEach((slot) => {
    supportLevelCounts.set(slot.center[1], (supportLevelCounts.get(slot.center[1]) ?? 0) + 1);
  });
  const occupiedPanelLevels = new Set(
    parts.filter((part) => part.kind === "panel" && !part.movable)
      .map((part) => levels.slice().sort((a, b) => Math.abs(part.positionMm[1] - a) - Math.abs(part.positionMm[1] - b))[0])
      .filter((level) => level !== undefined),
  );
  const plannedPanelLevels: number[] = [];
  targets.filter((part) => part.kind === "panel").forEach((part, index) => {
    const level = levels.filter((candidate) => !occupiedPanelLevels.has(candidate)).sort((a, b) => {
      const centerY = (candidate: number) => candidate + (part.thicknessMm ?? 12) / 2 + 5;
      const supportBonus = hasComponentUsage(part.usageTags, "load-bearing-surface") ? 125 : 80;
      const score = (candidate: number) => Math.abs(part.positionMm[1] - centerY(candidate)) - (supportLevelCounts.get(candidate) ?? 0) * supportBonus;
      return score(a) - score(b);
    })[0] ?? height + (index + 1) * Math.max(100, height / 4);
    occupiedPanelLevels.add(level);
    plannedPanelLevels.push(level);
    placements.push({
      id: part.id,
      positionMm: [0, roundToGrid(level + (part.thicknessMm ?? 12) / 2 + 5, gridMm), 0],
      rotationDeg: [0, roundToGrid(part.rotationDeg[1], 90), 0],
      role: "support-plane",
    });
  });

  const supportLevels = uniqueNumbers([
    ...levels.filter((level) => (supportLevelCounts.get(level) ?? 0) >= 2),
    ...plannedPanelLevels,
    ...parts.filter((part) => part.kind === "panel" && !part.movable)
      .map((part) => levels.slice().sort((a, b) => Math.abs(part.positionMm[1] - a) - Math.abs(part.positionMm[1] - b))[0])
      .filter((level) => level !== undefined),
  ]);
  const occupiedSupportKeys = new Set<string>();
  parts.filter((part) => part.kind === "joint" && !part.movable && hasComponentUsage(part.usageTags, "panel-support")).forEach((part) => {
    const nearestLevel = supportLevels.slice().sort((a, b) => Math.abs(part.positionMm[1] - a) - Math.abs(part.positionMm[1] - b))[0] ?? 0;
    const x = part.positionMm[0] < 0 ? -width / 2 : width / 2;
    const z = part.positionMm[2] < 0 ? -depth / 2 : depth / 2;
    occupiedSupportKeys.add(positionKey([x, nearestLevel, z]));
  });
  targets.filter((part) => part.kind === "joint" && hasComponentUsage(part.usageTags, "panel-support")).forEach((part, index) => {
    const level = supportLevels.slice().sort((a, b) => Math.abs(part.positionMm[1] - a) - Math.abs(part.positionMm[1] - b))[0] ?? levels[index % levels.length] ?? 0;
    const corners: SmartAlignVec3[] = [
      [-width / 2, level, -depth / 2],
      [width / 2, level, -depth / 2],
      [width / 2, level, depth / 2],
      [-width / 2, level, depth / 2],
    ];
    const corner = corners
      .filter((candidate) => !occupiedSupportKeys.has(positionKey(candidate)))
      .sort((a, b) => distance(part.positionMm, a) - distance(part.positionMm, b))[0] ??
      [roundToGrid((index % 2 ? 1 : -1) * width / 2, gridMm), level, roundToGrid((index % 4 >= 2 ? 1 : -1) * depth / 2, gridMm)] as SmartAlignVec3;
    occupiedSupportKeys.add(positionKey(corner));
    placements.push({
      id: part.id,
      positionMm: corner.map((value) => roundToGrid(value, gridMm)) as SmartAlignVec3,
      rotationDeg: part.rotationDeg.map((value) => roundToGrid(value, 90)) as SmartAlignVec3,
      role: "support-plane",
    });
  });

  const partById = new Map(parts.map((part) => [part.id, part]));
  return {
    placements,
    movedCount: placements.filter((placement) => changed(partById.get(placement.id)!, placement)).length,
    connectionCandidateCount,
  };
}
