import type { AssemblyConnection, Vec3 } from "./assembly";

export type StructuralPartKind = "joint" | "rod" | "panel";
export type StructuralMaterial = "steel" | "wood" | "acrylic";
export type StructuralSeverity = "error" | "warning";
export const STRUCTURAL_MATERIAL_SPECS: Record<StructuralMaterial, {
  densityKgPerM3: number;
  labelZh: string;
  labelEn: string;
}> = {
  // AISI 304 stainless steel: 7.9 kg/dm³.
  // https://otke-cdn.outokumpu.com/-/media/files/products/core/outokumpu-core-range-datasheet.pdf
  steel: { densityKgPerM3: 7_900, labelZh: "304 不锈钢", labelEn: "304 STAINLESS STEEL" },
  // Generic marine plywood assumption: midpoint of the published 580–620 kg/m³ range.
  // https://www.devonhardwoods.co.uk/products/sheet-materials/marine-plywood/
  wood: { densityKgPerM3: 600, labelZh: "普通海洋板", labelEn: "MARINE PLYWOOD" },
  // PLEXIGLAS PMMA: 1.19 g/cm³.
  // https://www.plexiglas.de/files/plexiglas-content/pdf/technische-informationen/234-32-EN-environmental-product-declaration-PLEXIGLAS-multi-skin-sheets.pdf
  acrylic: { densityKgPerM3: 1_190, labelZh: "亚克力", labelEn: "ACRYLIC" },
};
export type StructuralIssueCode =
  | "NO_GROUND_CONTACT"
  | "CONNECTOR_INCOMPLETE"
  | "ROD_UNCONNECTED"
  | "PART_UNSUPPORTED"
  | "PANEL_UNSUPPORTED"
  | "TIP_RISK"
  | "TIP_MARGIN_LOW";

export type StructuralPart = {
  id: string;
  kind: StructuralPartKind;
  centerMm: Vec3;
  minMm: Vec3;
  maxMm: Vec3;
  sizeMm: Vec3;
  massKg: number;
  material?: StructuralMaterial;
  requiredConnectionCount?: number;
};

export type PanelMountConnection = {
  panelId: string;
  mountId: string;
};

export type StructuralIssue = {
  id: string;
  code: StructuralIssueCode;
  severity: StructuralSeverity;
  partIds: string[];
  messageZh: string;
  messageEn: string;
};

export type SupportFootprint = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type StructuralAnalysis = {
  mode: "self-weight";
  issues: StructuralIssue[];
  errorCount: number;
  warningCount: number;
  totalMassKg: number;
  massByMaterialKg: Record<StructuralMaterial, number>;
  centerOfMassMm: Vec3 | null;
  supportFootprint: SupportFootprint | null;
  groundedPartIds: string[];
  supportedPartIds: string[];
  connectionCountByPart: Record<string, number>;
  panelSupportCountByPart: Record<string, number>;
};

type AnalyzeStructureInput = {
  parts: StructuralPart[];
  connections: AssemblyConnection[];
  panelMounts?: PanelMountConnection[];
  groundY?: number;
  groundToleranceMm?: number;
  supportToleranceMm?: number;
  connectorSurfaceToleranceMm?: number;
};

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function addEdge(graph: Map<string, Set<string>>, a: string, b: string) {
  if (!graph.has(a)) graph.set(a, new Set());
  if (!graph.has(b)) graph.set(b, new Set());
  graph.get(a)!.add(b);
  graph.get(b)!.add(a);
}

function rangesOverlap(minA: number, maxA: number, minB: number, maxB: number, tolerance = 0) {
  return Math.min(maxA, maxB) - Math.max(minA, minB) >= -tolerance;
}

function isHorizontalRod(part: StructuralPart) {
  const [x, y, z] = part.sizeMm;
  return part.kind === "rod" && y <= Math.max(x, z) * 0.25;
}

function supportedByRod(panel: StructuralPart, rod: StructuralPart, toleranceMm: number) {
  if (!isHorizontalRod(rod)) return false;
  const verticalGap = panel.minMm[1] - rod.maxMm[1];
  if (verticalGap < -toleranceMm || verticalGap > toleranceMm) return false;
  return rangesOverlap(panel.minMm[0], panel.maxMm[0], rod.minMm[0], rod.maxMm[0], toleranceMm)
    && rangesOverlap(panel.minMm[2], panel.maxMm[2], rod.minMm[2], rod.maxMm[2], toleranceMm);
}

export function supportedByConnectorSurface(panel: StructuralPart, connector: StructuralPart, toleranceMm = 3) {
  if (panel.kind !== "panel" || connector.kind !== "joint") return false;
  const thicknessAxis = panel.sizeMm.reduce(
    (smallestAxis, size, axis) => size < panel.sizeMm[smallestAxis] ? axis : smallestAxis,
    0,
  );
  const surfaceAxes = [0, 1, 2].filter((axis) => axis !== thicknessAxis);
  const hasSurfaceOverlap = surfaceAxes.every((axis) =>
    Math.min(panel.maxMm[axis], connector.maxMm[axis]) - Math.max(panel.minMm[axis], connector.minMm[axis]) > 0,
  );
  if (!hasSurfaceOverlap) return false;
  const normalGap = Math.max(
    panel.minMm[thicknessAxis] - connector.maxMm[thicknessAxis],
    connector.minMm[thicknessAxis] - panel.maxMm[thicknessAxis],
    0,
  );
  const normalPenetration = Math.min(panel.maxMm[thicknessAxis], connector.maxMm[thicknessAxis])
    - Math.max(panel.minMm[thicknessAxis], connector.minMm[thicknessAxis]);
  return normalGap <= toleranceMm && normalPenetration <= toleranceMm;
}

export function estimatePartMassKg({
  kind,
  sizeMm,
  material = kind === "panel" ? "wood" : "steel",
}: {
  kind: StructuralPartKind;
  sizeMm: Vec3;
  material?: StructuralMaterial;
}) {
  const densityKgPerM3 = STRUCTURAL_MATERIAL_SPECS[material].densityKgPerM3;
  const [width, height, depth] = sizeMm.map((value) => Math.max(0, value));
  let volumeMm3 = width * height * depth;
  if (kind === "rod") {
    const length = Math.max(width, height, depth);
    const diameter = Math.max(1, Math.min(width, height, depth));
    volumeMm3 = Math.PI * (diameter / 2) ** 2 * length;
  } else if (kind === "joint") {
    // Connectors contain bores, slots and fastener cavities. The envelope is intentionally
    // discounted so self-weight is not overstated before exact CAD mass properties exist.
    volumeMm3 *= 0.42;
  }
  return Math.max(0.001, round(volumeMm3 / 1_000_000_000 * densityKgPerM3, 3));
}

export function analyzeStructure({
  parts,
  connections,
  panelMounts = [],
  groundY = 0,
  groundToleranceMm = 20,
  supportToleranceMm = 25,
  connectorSurfaceToleranceMm = 3,
}: AnalyzeStructureInput): StructuralAnalysis {
  const partById = new Map(parts.map((part) => [part.id, part]));
  const graph = new Map(parts.map((part) => [part.id, new Set<string>()]));
  const connectionCountByPart = Object.fromEntries(parts.map((part) => [part.id, 0]));
  const panelSupportCountByPart = Object.fromEntries(parts.filter(({ kind }) => kind === "panel").map((part) => [part.id, 0]));

  connections.forEach((connection) => {
    if (!partById.has(connection.connectorId) || !partById.has(connection.shaftId)) return;
    addEdge(graph, connection.connectorId, connection.shaftId);
    connectionCountByPart[connection.connectorId] += 1;
    connectionCountByPart[connection.shaftId] += 1;
  });

  const rods = parts.filter(({ kind }) => kind === "rod");
  const connectors = parts.filter(({ kind }) => kind === "joint");
  parts.filter(({ kind }) => kind === "panel").forEach((panel) => {
    const supportRods = rods.filter((rod) => supportedByRod(panel, rod, supportToleranceMm));
    const surfaceSupports = connectors.filter((connector) =>
      supportedByConnectorSurface(panel, connector, connectorSurfaceToleranceMm),
    );
    const mountedSupports = panelMounts
      .filter(({ panelId, mountId }) => panelId === panel.id && partById.has(mountId))
      .map(({ mountId }) => mountId);
    panelSupportCountByPart[panel.id] = new Set([
      ...supportRods.map(({ id }) => id),
      ...surfaceSupports.map(({ id }) => id),
      ...mountedSupports,
    ]).size;
    supportRods.forEach((rod) => addEdge(graph, panel.id, rod.id));
    surfaceSupports.forEach((connector) => addEdge(graph, panel.id, connector.id));
    mountedSupports.forEach((mountId) => addEdge(graph, panel.id, mountId));
  });

  const groundedParts = parts.filter((part) => part.minMm[1] <= groundY + groundToleranceMm);
  const groundedPartIds = groundedParts.map(({ id }) => id);
  const supported = new Set(groundedPartIds);
  const queue = [...groundedPartIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    graph.get(id)?.forEach((neighbor) => {
      if (supported.has(neighbor)) return;
      supported.add(neighbor);
      queue.push(neighbor);
    });
  }

  const issues: StructuralIssue[] = [];
  const addIssue = (issue: Omit<StructuralIssue, "id">) => issues.push({
    ...issue,
    id: `${issue.code}:${issue.partIds.join(",") || "design"}`,
  });

  if (parts.length > 0 && groundedParts.length === 0) {
    addIssue({
      code: "NO_GROUND_CONTACT",
      severity: "error",
      partIds: [],
      messageZh: "当前设计没有零件接触地面，整体处于悬空状态。",
      messageEn: "NO PART TOUCHES THE GROUND; THE DESIGN IS FLOATING.",
    });
  }

  parts.filter(({ kind }) => kind === "joint").forEach((part) => {
    const required = Math.max(1, part.requiredConnectionCount ?? 2);
    const actual = connectionCountByPart[part.id] ?? 0;
    if (actual >= required) return;
    addIssue({
      code: "CONNECTOR_INCOMPLETE",
      severity: "error",
      partIds: [part.id],
      messageZh: `${part.id} 仅连接 ${actual}/${required} 根光轴，连接件未形成完整受力节点。`,
      messageEn: `${part.id} CONNECTS ${actual}/${required} SHAFTS; THE LOAD NODE IS INCOMPLETE.`,
    });
  });

  rods.forEach((part) => {
    if ((connectionCountByPart[part.id] ?? 0) > 0) return;
    addIssue({
      code: "ROD_UNCONNECTED",
      severity: supported.has(part.id) ? "warning" : "error",
      partIds: [part.id],
      messageZh: `${part.id} 没有连接件约束，受重力或侧向扰动后可能移位。`,
      messageEn: `${part.id} HAS NO CONNECTOR RESTRAINT AND MAY MOVE UNDER GRAVITY OR SIDE LOAD.`,
    });
  });

  parts.filter(({ kind }) => kind === "panel").forEach((part) => {
    const count = panelSupportCountByPart[part.id] ?? 0;
    if (count >= 2) return;
    addIssue({
      code: "PANEL_UNSUPPORTED",
      severity: "error",
      partIds: [part.id],
      messageZh: `${part.id} 仅识别到 ${count} 个有效支撑或安装点，板件至少需要两个受力连接点。`,
      messageEn: `${part.id} HAS ${count} VALID SUPPORT OR MOUNT POINTS; A PANEL NEEDS AT LEAST TWO LOAD-BEARING CONNECTIONS.`,
    });
  });

  parts.forEach((part) => {
    if (groundedPartIds.includes(part.id) || supported.has(part.id)) return;
    if (issues.some((issue) => issue.partIds.includes(part.id) && issue.severity === "error")) return;
    addIssue({
      code: "PART_UNSUPPORTED",
      severity: "error",
      partIds: [part.id],
      messageZh: `${part.id} 没有连接到落地支撑路径。`,
      messageEn: `${part.id} HAS NO LOAD PATH TO A GROUNDED SUPPORT.`,
    });
  });

  const massByMaterialKg = parts.reduce<Record<StructuralMaterial, number>>((totals, part) => {
    const material = part.material ?? (part.kind === "panel" ? "wood" : "steel");
    totals[material] += part.massKg;
    return totals;
  }, { steel: 0, wood: 0, acrylic: 0 });
  const totalMassKg = Object.values(massByMaterialKg).reduce((sum, massKg) => sum + massKg, 0);
  const centerOfMassMm: Vec3 | null = totalMassKg > 0
    ? [0, 1, 2].map((axis) => parts.reduce((sum, part) => sum + part.centerMm[axis] * part.massKg, 0) / totalMassKg) as Vec3
    : null;
  const supportFootprint = groundedParts.length > 0 ? {
    minX: Math.min(...groundedParts.map((part) => part.minMm[0])),
    maxX: Math.max(...groundedParts.map((part) => part.maxMm[0])),
    minZ: Math.min(...groundedParts.map((part) => part.minMm[2])),
    maxZ: Math.max(...groundedParts.map((part) => part.maxMm[2])),
  } : null;

  if (centerOfMassMm && supportFootprint) {
    const outside = centerOfMassMm[0] < supportFootprint.minX || centerOfMassMm[0] > supportFootprint.maxX
      || centerOfMassMm[2] < supportFootprint.minZ || centerOfMassMm[2] > supportFootprint.maxZ;
    const margin = Math.min(
      centerOfMassMm[0] - supportFootprint.minX,
      supportFootprint.maxX - centerOfMassMm[0],
      centerOfMassMm[2] - supportFootprint.minZ,
      supportFootprint.maxZ - centerOfMassMm[2],
    );
    const footprintWidth = supportFootprint.maxX - supportFootprint.minX;
    const footprintDepth = supportFootprint.maxZ - supportFootprint.minZ;
    const lowMarginThreshold = Math.max(10, Math.min(footprintWidth, footprintDepth) * 0.1);
    if (outside) {
      addIssue({
        code: "TIP_RISK",
        severity: "error",
        partIds: [],
        messageZh: "设计重心投影超出落地支撑面，存在自重倾覆风险。",
        messageEn: "THE CENTER OF MASS FALLS OUTSIDE THE SUPPORT FOOTPRINT, CREATING A TIP RISK.",
      });
    } else if (margin < lowMarginThreshold) {
      addIssue({
        code: "TIP_MARGIN_LOW",
        severity: "warning",
        partIds: [],
        messageZh: `重心距支撑边缘仅 ${Math.max(0, Math.round(margin))} mm，建议扩大底座或降低重心。`,
        messageEn: `THE CENTER OF MASS IS ONLY ${Math.max(0, Math.round(margin))} MM FROM A SUPPORT EDGE.`,
      });
    }
  }

  return {
    mode: "self-weight",
    issues,
    errorCount: issues.filter(({ severity }) => severity === "error").length,
    warningCount: issues.filter(({ severity }) => severity === "warning").length,
    totalMassKg: round(totalMassKg, 2),
    massByMaterialKg: Object.fromEntries(
      Object.entries(massByMaterialKg).map(([material, massKg]) => [material, round(massKg, 2)]),
    ) as Record<StructuralMaterial, number>,
    centerOfMassMm: centerOfMassMm?.map((value) => round(value, 1)) as Vec3 | null,
    supportFootprint,
    groundedPartIds,
    supportedPartIds: [...supported],
    connectionCountByPart,
    panelSupportCountByPart,
  };
}
