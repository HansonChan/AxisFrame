export type OrderPartKind = "joint" | "rod" | "panel";
export type OrderPart = {
  id: string;
  kind: OrderPartKind;
  libraryPart?: { model: string; source?: string; name?: string };
};
export type OrderDimensions = { width: number; height: number; depth: number };
export type OrderTransform = {
  x: number; y: number; z: number;
  sizeX: number; sizeY: number; sizeZ: number;
  rotX: number; rotY: number; rotZ: number;
};

export type OrderDataInput = {
  projectName: string;
  dimensions: OrderDimensions;
  parts: OrderPart[];
  transforms: Record<string, OrderTransform>;
  materials: Record<string, string>;
  deletedIds: ReadonlySet<string>;
  unresolvedRiskIds: string[];
};

export type RodLine = { id: string; diameter: number; length: number; material: string };
export type PanelLine = { id: string; length: number; width: number; thickness: number; material: string };
export type HardwareLine = { id: string; sku: string; material: string; fastener: string; source: string };
export type SummaryLine = {
  category: string;
  sku: string;
  specification: string;
  material: string;
  quantity: number;
  unit: string;
  note: string;
  partIds: string[];
  source: string;
  inventoryStatus: "ready" | "custom" | "unverified";
};

const materialNames: Record<string, string> = {
  oak: "原木纹",
  walnut: "胡桃木纹",
  acrylic: "透明亚克力",
  stainless: "不锈钢色",
  matteBlack: "哑黑色",
  whiteMetal: "白色",
};

const baseRodAxis: Record<string, keyof OrderDimensions> = {
  "R-001": "width", "R-002": "depth", "R-003": "width", "R-004": "depth",
  "R-005": "width", "R-006": "depth", "R-007": "width", "R-008": "depth",
  "R-009": "width", "R-010": "depth", "R-011": "width", "R-012": "depth",
  "R-013": "height", "R-014": "height", "R-015": "height", "R-016": "height",
};

const baseTransforms: Record<OrderPartKind, OrderTransform> = {
  joint: { x: 0, y: 0, z: 0, sizeX: 50, sizeY: 20, sizeZ: 20, rotX: 0, rotY: 0, rotZ: 0 },
  rod: { x: 0, y: 0, z: 0, sizeX: 100, sizeY: 10, sizeZ: 10, rotX: 0, rotY: 0, rotZ: 0 },
  panel: { x: 0, y: 0, z: 0, sizeX: 880, sizeY: 8, sizeZ: 335, rotX: 0, rotY: 0, rotZ: 0 },
};

const roundMm = (value: number) => Math.round(value * 10) / 10;

function partMaterial(input: OrderDataInput, part: OrderPart) {
  return materialNames[input.materials[part.id] ?? (part.kind === "panel" ? "acrylic" : "stainless")]
    ?? input.materials[part.id]
    ?? "未指定";
}

function sourceFor(part: OrderPart) {
  if (part.libraryPart?.source === "three-view") return "三视图导入";
  if (part.libraryPart?.source === "manual") return "手工组件";
  return part.libraryPart ? "组件库" : "内置模板";
}

export function buildOrderData(input: OrderDataInput) {
  const visibleParts = input.parts.filter(({ id }) => !input.deletedIds.has(id));
  const rods: RodLine[] = [];
  const panels: PanelLine[] = [];
  const hardware: HardwareLine[] = [];

  visibleParts.forEach((part) => {
    const transform = input.transforms[part.id] ?? baseTransforms[part.kind];
    const material = partMaterial(input, part);
    if (part.kind === "rod") {
      const baseLength = baseRodAxis[part.id] ? input.dimensions[baseRodAxis[part.id]] : 1000;
      rods.push({ id: part.id, diameter: roundMm(transform.sizeY), length: roundMm(baseLength * transform.sizeX / 100), material });
    } else if (part.kind === "panel") {
      const hasCustomTransform = Boolean(input.transforms[part.id]);
      panels.push({
        id: part.id,
        length: roundMm(hasCustomTransform ? transform.sizeX : Math.max(100, input.dimensions.width - 20)),
        width: roundMm(hasCustomTransform ? transform.sizeZ : Math.max(100, input.dimensions.depth - 15)),
        thickness: roundMm(transform.sizeY),
        material,
      });
    } else {
      hardware.push({
        id: part.id,
        sku: part.libraryPart?.model ?? "CROSS-SPLIT-10-10",
        material,
        fastener: "按组件规格",
        source: sourceFor(part),
      });
    }
  });

  const partById = new Map(visibleParts.map((part) => [part.id, part]));
  const summaryMap = new Map<string, SummaryLine>();
  const addSummary = (line: Omit<SummaryLine, "quantity" | "partIds">, partId: string) => {
    const key = [line.category, line.sku, line.specification, line.material].join("|");
    const current = summaryMap.get(key);
    if (current) {
      current.quantity += 1;
      current.partIds.push(partId);
    } else {
      summaryMap.set(key, { ...line, quantity: 1, partIds: [partId] });
    }
  };
  rods.forEach((rod) => addSummary({
    category: "光轴杆件",
    sku: `SHAFT-${rod.diameter}-CUT`,
    specification: `Ø${rod.diameter} × ${rod.length} mm`,
    material: rod.material,
    unit: "根",
    note: "按切割明细加工，端面去毛刺",
    source: sourceFor(partById.get(rod.id)!),
    inventoryStatus: "custom",
  }, rod.id));
  panels.forEach((panel) => addSummary({
    category: "层板定制",
    sku: "PANEL-CUSTOM",
    specification: `${panel.length} × ${panel.width} × ${panel.thickness} mm`,
    material: panel.material,
    unit: "块",
    note: panel.material.includes("亚克力") ? "边缘抛光，双面保护膜" : "纹理沿长度方向，四边精修",
    source: sourceFor(partById.get(panel.id)!),
    inventoryStatus: "custom",
  }, panel.id));
  hardware.forEach((item) => addSummary({
    category: "连接五金",
    sku: item.sku,
    specification: "按组件端口规格",
    material: item.material,
    unit: "个",
    note: `含 ${item.fastener} 紧固件`,
    source: item.source,
    inventoryStatus: input.unresolvedRiskIds.includes(item.id) ? "unverified" : "ready",
  }, item.id));

  return { visibleParts, rods, panels, hardware, summary: [...summaryMap.values()] };
}
