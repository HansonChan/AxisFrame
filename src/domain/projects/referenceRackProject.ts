export const PHOTO_RACK_PROJECT_ID = "project-photo-coffee-rack-v1";
export const PHOTO_RACK_PROJECT_SEED_KEY = "axisframe-photo-coffee-rack-seeded-v5";
export const PHOTO_RACK_PROJECT_NAME = "参考图｜三层光轴咖啡置物架";

type PartKind = "joint" | "rod" | "panel";

type ProjectLibraryParts<TLibraryPart> = {
  shaft: TLibraryPart;
  panel: TLibraryPart;
  openRingClamp: TLibraryPart;
  crossConnector: TLibraryPart;
};

type PartTransform = {
  x: number;
  y: number;
  z: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
};

const defaultTransform: PartTransform = {
  x: 0,
  y: 0,
  z: 0,
  sizeX: 100,
  sizeY: 10,
  sizeZ: 10,
  rotX: 0,
  rotY: 0,
  rotZ: 0,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
};

function transform(overrides: Partial<PartTransform>): PartTransform {
  return { ...defaultTransform, ...overrides };
}

function addedPart<TLibraryPart>(
  id: string,
  kind: PartKind,
  libraryPart: TLibraryPart,
) {
  return { id, kind, libraryPart };
}

function cloneLibraryPart<TLibraryPart>(
  part: TLibraryPart,
  overrides: Record<string, unknown>,
): TLibraryPart {
  return { ...(part as Record<string, unknown>), ...overrides } as TLibraryPart;
}

function cloneGeometryWithShaftDiameter<TLibraryPart>(part: TLibraryPart, diameter: number) {
  const geometry = (part as { geometry?: { ports?: Array<{ kind?: string; id: string; diameter: number }> } }).geometry;
  if (!geometry?.ports) return (part as Record<string, unknown>).geometry;
  return {
    ...geometry,
    ports: geometry.ports.map((port) =>
      port.kind === "shaft-bore" || port.id.toUpperCase().includes("SHAFT")
        ? { ...port, diameter }
        : port,
    ),
  };
}

function createOffsetCrossConnectorGeometry(diameter: number) {
  return {
    primitives: [
      { shape: "box", size: [1.8, 1.2, 3.2], position: [0, 0, 0] },
      { shape: "cylinder", size: [0.64, 1.22, 0.64], position: [0, 0, -1.25], appearance: "cutout" },
      { shape: "cylinder", size: [0.64, 1.22, 0.64], position: [0, 0, 1.25], rotation: [90, 0, 0], appearance: "cutout" },
      { shape: "box", size: [0.12, 1.22, 1.02], position: [0.9, 0, 1.25], appearance: "cutout" },
    ],
    ports: [
      { id: "SHAFT-Y", axis: "y", position: [0, 0, -1.25], diameter, kind: "shaft-bore", behavior: "fixed", toleranceMm: 0.25, capacity: 1 },
      { id: "SHAFT-Z", axis: "z", position: [0, 0, 1.25], diameter, kind: "shaft-bore", behavior: "fixed", toleranceMm: 0.25, capacity: 1 },
    ],
  };
}

function connection(
  connectorId: string,
  portId: "SHAFT-Y" | "SHAFT-Z",
  shaftId: string,
  positionOnShaft: number,
) {
  return { connectorId, portId, shaftId, positionOnShaft, behavior: "fixed" as const };
}

const hiddenTemplatePartIds = [
  "R-001", "R-002", "R-003", "R-004",
  "R-005", "R-006", "R-007", "R-008",
  "R-009", "R-010", "R-011", "R-012",
  "R-013", "R-014", "R-015", "R-016",
  "P-001", "P-002", "P-003",
  "J-001", "J-002", "J-003", "J-004",
  "J-005", "J-006", "J-007", "J-008",
  "J-009", "J-010", "J-011", "J-012",
];

const projectDimensions = { width: 500, height: 500, depth: 170 };
const rodBaseY = projectDimensions.height / 2 + 55;
const panelBaseY = (panelIndex: number) => projectDimensions.height / 2 + 48 + panelIndex * 32;
const jointBaseY = (jointIndex: number) => projectDimensions.height / 2 + 40 + jointIndex * 35;

function rodTransformAtWorld(
  rodIndex: number,
  worldX: number,
  worldY: number,
  worldZ: number,
  overrides: Partial<PartTransform> = {},
) {
  return transform({
    x: worldX,
    y: worldY - rodBaseY,
    z: worldZ - rodIndex * 25,
    sizeX: 100,
    sizeY: 6,
    sizeZ: 6,
    ...overrides,
  });
}

function panelTransformAtWorld(panelIndex: number, worldY: number) {
  return transform({
    y: worldY - panelBaseY(panelIndex),
    sizeX: 500,
    sizeY: 8,
    sizeZ: 170,
  });
}

function jointTransformAtWorld(
  jointIndex: number,
  worldX: number,
  worldY: number,
  worldZ: number,
  overrides: Partial<PartTransform> = {},
) {
  return transform({
    x: worldX,
    y: worldY - jointBaseY(jointIndex),
    z: worldZ,
    sizeX: 18,
    sizeY: 12,
    sizeZ: 12,
    ...overrides,
  });
}

export function createPhotoCoffeeRackProject<TLibraryPart>(
  libraryParts: ProjectLibraryParts<TLibraryPart>,
  timestamp = new Date().toISOString(),
) {
  const shaft6x500 = cloneLibraryPart(libraryParts.shaft, {
    id: "lib-shaft-6-500",
    model: "SHAFT-6-500",
    name: "6mm 光轴（硬轴）500mm",
    dimensions: { width: 6, length: 500, height: 6 },
    shaftParameters: { diameter: 6, length: 500 },
    compatibleRod: "Ø6 mm",
    geometry: cloneGeometryWithShaftDiameter(libraryParts.shaft, 6),
  });
  const shaft6x420 = cloneLibraryPart(shaft6x500, {
    id: "lib-shaft-6-420",
    model: "SHAFT-6-420",
    name: "6mm 光轴（硬轴）420mm",
    dimensions: { width: 6, length: 420, height: 6 },
    shaftParameters: { diameter: 6, length: 420 },
  });
  const shaft6x150 = cloneLibraryPart(shaft6x500, {
    id: "lib-shaft-6-150",
    model: "SHAFT-6-150",
    name: "6mm 光轴（硬轴）150mm",
    dimensions: { width: 6, length: 150, height: 6 },
    shaftParameters: { diameter: 6, length: 150 },
  });
  const acrylicPanel = cloneLibraryPart(libraryParts.panel, {
    id: "lib-acrylic-panel-500-170-8-h7",
    model: "ACRYLIC-PANEL-500-170-8-H7",
    name: "蓝色亚克力层板（四角孔）",
    material: "蓝色透明亚克力",
    defaultPanelMaterial: "acrylic",
    dimensions: { width: 500, length: 170, height: 8 },
    compatibleRod: "四角 Ø7 mm 孔穿 Ø6 mm 光轴",
    connector: "四角圆孔 / 圆角板 / 轴环限位",
    cornerHolePanelParameters: {
      holeDiameter: 7,
      holeInsetX: 15,
      holeInsetZ: 15,
      cornerRadius: 12,
    },
  });
  const openRingClamp = cloneLibraryPart(libraryParts.openRingClamp, {
    id: "lib-open-ring-6",
    model: "OPEN-RING-6",
    name: "开口圆环夹",
    dimensions: { width: 16, length: 16, height: 6 },
    parameters: { innerDiameter: 6, outerDiameter: 16, thickness: 6 },
    compatibleRod: "Ø6 mm",
    connector: "轴向限位 / 开口锁紧",
    geometry: cloneGeometryWithShaftDiameter(libraryParts.openRingClamp, 6),
  });
  const crossConnector6 = cloneLibraryPart(libraryParts.crossConnector, {
    id: "lib-cross-split-6",
    model: "CROSS-SPLIT-6-6",
    name: "十字支柱固定夹",
    dimensions: { width: 18, length: 32, height: 12 },
    compatibleRod: "Ø6 mm × Ø6 mm",
    connector: "6×6 mm 正交双孔 / 分体夹紧",
    geometry: createOffsetCrossConnectorGeometry(6),
  });

  const verticalRods = ["R-017", "R-018", "R-019", "R-020"];
  const longRods = ["R-021", "R-022", "R-023", "R-024"];
  const shortRods = ["R-025", "R-026", "R-027", "R-028"];
  const panelIds = ["P-004", "P-005", "P-006"];
  const ringIds = Array.from({ length: 8 }, (_, index) => `J-${String(index + 13).padStart(3, "0")}`);
  const crossIds = Array.from({ length: 16 }, (_, index) => `J-${String(index + 21).padStart(3, "0")}`);

  const addedParts = [
    ...verticalRods.map((id) => addedPart(id, "rod", shaft6x500)),
    ...longRods.map((id) => addedPart(id, "rod", shaft6x420)),
    ...shortRods.map((id) => addedPart(id, "rod", shaft6x150)),
    ...panelIds.map((id) => addedPart(id, "panel", acrylicPanel)),
    ...ringIds.map((id) => addedPart(id, "joint", openRingClamp)),
    ...crossIds.map((id) => addedPart(id, "joint", crossConnector6)),
  ];

  return {
    id: PHOTO_RACK_PROJECT_ID,
    name: PHOTO_RACK_PROJECT_NAME,
    version: 1 as const,
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshot: {
      dimensions: projectDimensions,
      background: "room" as const,
      transforms: {
        // Four Ø6 × 500 mm vertical hard shafts pass through the acrylic panel corner holes.
        "R-017": rodTransformAtWorld(0, -235, 250, -70, { rotX: 90 }),
        "R-018": rodTransformAtWorld(1, 235, 250, -70, { rotX: 90 }),
        "R-019": rodTransformAtWorld(2, 235, 250, 70, { rotX: 90 }),
        "R-020": rodTransformAtWorld(3, -235, 250, 70, { rotX: 90 }),

        // Four Ø6 × 420 mm long guard rails along the shelf length.
        "R-021": rodTransformAtWorld(4, 0, 250, -70, { rotY: 90 }),
        "R-022": rodTransformAtWorld(5, 0, 250, 70, { rotY: 90 }),
        "R-023": rodTransformAtWorld(6, 0, 455, -70, { rotY: 90 }),
        "R-024": rodTransformAtWorld(7, 0, 455, 70, { rotY: 90 }),

        // Four Ø6 × 150 mm side rails across the shelf depth.
        "R-025": rodTransformAtWorld(8, -235, 250, 0),
        "R-026": rodTransformAtWorld(9, 235, 250, 0),
        "R-027": rodTransformAtWorld(10, -235, 455, 0),
        "R-028": rodTransformAtWorld(11, 235, 455, 0),

        // Three 500 × 170 × 8 mm blue transparent acrylic plates with four Ø7 mm rounded-corner holes.
        "P-004": panelTransformAtWorld(0, 8),
        "P-005": panelTransformAtWorld(1, 235),
        "P-006": panelTransformAtWorld(2, 430),

        // Eight Ø6 open ring clamps stop/support the lower and middle acrylic panels.
        "J-013": jointTransformAtWorld(0, -235, 24, -70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-014": jointTransformAtWorld(1, 235, 24, -70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-015": jointTransformAtWorld(2, 235, 24, 70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-016": jointTransformAtWorld(3, -235, 24, 70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-017": jointTransformAtWorld(4, -235, 248, -70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-018": jointTransformAtWorld(5, 235, 248, -70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-019": jointTransformAtWorld(6, 235, 248, 70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),
        "J-020": jointTransformAtWorld(7, -235, 248, 70, { sizeX: 16, sizeY: 6, sizeZ: 16, rotX: 90 }),

        // Sixteen 6×6 mm cross pillar clamps, one at each horizontal rod endpoint.
        "J-021": jointTransformAtWorld(8, -222.5, 250, -70, { sizeY: 32, rotY: 90 }),
        "J-022": jointTransformAtWorld(9, 222.5, 250, -70, { sizeY: 32, rotY: 270 }),
        "J-023": jointTransformAtWorld(10, -222.5, 250, 70, { sizeY: 32, rotY: 90 }),
        "J-024": jointTransformAtWorld(11, 222.5, 250, 70, { sizeY: 32, rotY: 270 }),
        "J-025": jointTransformAtWorld(12, -222.5, 455, -70, { sizeY: 32, rotY: 90 }),
        "J-026": jointTransformAtWorld(13, 222.5, 455, -70, { sizeY: 32, rotY: 270 }),
        "J-027": jointTransformAtWorld(14, -222.5, 455, 70, { sizeY: 32, rotY: 90 }),
        "J-028": jointTransformAtWorld(15, 222.5, 455, 70, { sizeY: 32, rotY: 270 }),
        "J-029": jointTransformAtWorld(16, -235, 250, -57.5, { sizeY: 32 }),
        "J-030": jointTransformAtWorld(17, -235, 250, 57.5, { sizeY: 32, rotY: 180 }),
        "J-031": jointTransformAtWorld(18, 235, 250, -57.5, { sizeY: 32 }),
        "J-032": jointTransformAtWorld(19, 235, 250, 57.5, { sizeY: 32, rotY: 180 }),
        "J-033": jointTransformAtWorld(20, -235, 455, -57.5, { sizeY: 32 }),
        "J-034": jointTransformAtWorld(21, -235, 455, 57.5, { sizeY: 32, rotY: 180 }),
        "J-035": jointTransformAtWorld(22, 235, 455, -57.5, { sizeY: 32 }),
        "J-036": jointTransformAtWorld(23, 235, 455, 57.5, { sizeY: 32, rotY: 180 }),
      },
      materials: {
        "P-004": "acrylic",
        "P-005": "acrylic",
        "P-006": "acrylic",
        ...Object.fromEntries(
          addedParts.filter(({ kind }) => kind !== "panel").map(({ id }) => [id, "stainless"]),
        ),
      },
      resolvedRiskIds: [],
      deletedIds: hiddenTemplatePartIds,
      addedParts,
      userGroups: [
        { id: "photo-rack-panels", name: "8mm 蓝色亚克力板", partIds: panelIds },
        { id: "photo-rack-vertical-shafts", name: "6mm × 50cm 立柱光轴", partIds: verticalRods },
        { id: "photo-rack-long-rails", name: "6mm × 42cm 长向光轴", partIds: longRods },
        { id: "photo-rack-short-rails", name: "6mm × 15cm 侧向光轴", partIds: shortRods },
        { id: "photo-rack-ring-clamps", name: "开口圆环夹", partIds: ringIds },
        { id: "photo-rack-cross-clamps", name: "十字支柱固定夹", partIds: crossIds },
      ],
      hiddenIds: [],
      lockedIds: [],
      isolatedIds: [],
      assemblyConnections: [
        connection("J-021", "SHAFT-Y", "R-017", 0.5), connection("J-021", "SHAFT-Z", "R-021", 0),
        connection("J-022", "SHAFT-Y", "R-018", 0.5), connection("J-022", "SHAFT-Z", "R-021", 1),
        connection("J-023", "SHAFT-Y", "R-020", 0.5), connection("J-023", "SHAFT-Z", "R-022", 0),
        connection("J-024", "SHAFT-Y", "R-019", 0.5), connection("J-024", "SHAFT-Z", "R-022", 1),
        connection("J-025", "SHAFT-Y", "R-017", 0.91), connection("J-025", "SHAFT-Z", "R-023", 0),
        connection("J-026", "SHAFT-Y", "R-018", 0.91), connection("J-026", "SHAFT-Z", "R-023", 1),
        connection("J-027", "SHAFT-Y", "R-020", 0.91), connection("J-027", "SHAFT-Z", "R-024", 0),
        connection("J-028", "SHAFT-Y", "R-019", 0.91), connection("J-028", "SHAFT-Z", "R-024", 1),
        connection("J-029", "SHAFT-Y", "R-017", 0.5), connection("J-029", "SHAFT-Z", "R-025", 0.2),
        connection("J-030", "SHAFT-Y", "R-020", 0.5), connection("J-030", "SHAFT-Z", "R-025", 0.8),
        connection("J-031", "SHAFT-Y", "R-018", 0.5), connection("J-031", "SHAFT-Z", "R-026", 0.2),
        connection("J-032", "SHAFT-Y", "R-019", 0.5), connection("J-032", "SHAFT-Z", "R-026", 0.8),
        connection("J-033", "SHAFT-Y", "R-017", 0.91), connection("J-033", "SHAFT-Z", "R-027", 0.2),
        connection("J-034", "SHAFT-Y", "R-020", 0.91), connection("J-034", "SHAFT-Z", "R-027", 0.8),
        connection("J-035", "SHAFT-Y", "R-018", 0.91), connection("J-035", "SHAFT-Z", "R-028", 0.2),
        connection("J-036", "SHAFT-Y", "R-019", 0.91), connection("J-036", "SHAFT-Z", "R-028", 0.8),
      ],
    },
  };
}
