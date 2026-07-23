import type { AssemblyConnection } from "../assembly/assembly";
import { PROJECT_SCHEMA_VERSION } from "./projectSchema";

export const FURNITURE_PROJECTS_SEED_KEY = "axisframe-gravity-furniture-projects-seeded-v3";

export const FURNITURE_PROJECT_DEFINITIONS = [
  {
    id: "project-dahon-folding-bike-rack-v1",
    name: "家具方案｜大行折叠车单层收纳架",
    dimensions: { width: 1100, height: 520, depth: 620 },
    frameWidth: 1000,
    frameDepth: 480,
    footDepth: 620,
    uprightHeight: 430,
    metalMaterial: "matteBlack",
    panels: [
      { name: "折叠车承载层", y: 140, width: 1060, depth: 520, thickness: 18, material: "walnut" },
    ],
    railLevels: [
      { name: "车轮与车架防滑围杆", y: 310 },
    ],
  },
  {
    id: "project-coffee-machine-storage-rack-v1",
    name: "家具方案｜咖啡机收纳架",
    dimensions: { width: 820, height: 1100, depth: 560 },
    frameWidth: 740,
    frameDepth: 440,
    footDepth: 560,
    uprightHeight: 1020,
    metalMaterial: "stainless",
    panels: [
      { name: "底部器具层", y: 135, width: 790, depth: 480, thickness: 18, material: "oak" },
      { name: "咖啡机主承载层", y: 520, width: 790, depth: 480, thickness: 18, material: "walnut" },
      { name: "杯具与耗材层", y: 930, width: 790, depth: 480, thickness: 18, material: "oak" },
    ],
    railLevels: [
      { name: "顶部防落围杆", y: 1015 },
    ],
  },
  {
    id: "project-floor-coat-rack-v1",
    name: "家具方案｜落地衣架",
    dimensions: { width: 900, height: 1780, depth: 560 },
    frameWidth: 820,
    frameDepth: 360,
    footDepth: 560,
    uprightHeight: 1700,
    metalMaterial: "matteBlack",
    panels: [
      { name: "低重心鞋包层", y: 150, width: 860, depth: 420, thickness: 18, material: "walnut" },
    ],
    railLevels: [
      { name: "中部抗侧摆横撑", y: 900 },
      { name: "双向挂衣横杆", y: 1680 },
    ],
  },
  {
    id: "project-floating-monitor-riser-v1",
    name: "家具方案｜悬浮双层显示器增高架",
    dimensions: { width: 1120, height: 260, depth: 380 },
    frameWidth: 1000,
    frameDepth: 260,
    footDepth: 360,
    uprightHeight: 220,
    metalMaterial: "whiteMetal",
    panels: [
      { name: "透明悬浮键盘层", y: 85, width: 900, depth: 280, thickness: 12, material: "acrylic" },
      { name: "显示器主承载层", y: 185, width: 1080, depth: 320, thickness: 18, material: "oak" },
    ],
    railLevels: [],
  },
] as const;

type PartKind = "joint" | "rod" | "panel";
type MetalMaterial = "stainless" | "matteBlack" | "whiteMetal";
type PanelMaterial = "oak" | "walnut" | "acrylic";

type ProjectLibraryParts<TLibraryPart> = {
  shaft: TLibraryPart;
  panel: TLibraryPart;
  crossConnector: TLibraryPart;
  panelSupport: TLibraryPart;
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

type FurnitureProjectDefinition = {
  id: string;
  name: string;
  dimensions: { width: number; height: number; depth: number };
  frameWidth: number;
  frameDepth: number;
  footDepth: number;
  uprightHeight: number;
  metalMaterial: MetalMaterial;
  panels: readonly {
    name: string;
    y: number;
    width: number;
    depth: number;
    thickness: number;
    material: PanelMaterial;
  }[];
  railLevels: readonly { name: string; y: number }[];
};

type RodSpec = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  length: number;
  axis: "x" | "y" | "z";
};

type JointSpec = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  firstRodId: string;
  firstRodPosition: number;
  secondRodId: string;
  secondRodPosition: number;
};

type PanelSupportSpec = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rodId: string;
  positionOnRod: number;
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

const builtInPartIds = [
  "P-001", "P-002", "P-003",
  ...Array.from({ length: 16 }, (_, index) => `R-${String(index + 1).padStart(3, "0")}`),
  ...Array.from({ length: 12 }, (_, index) => `J-${String(index + 1).padStart(3, "0")}`),
];

function transform(overrides: Partial<PartTransform>): PartTransform {
  return { ...defaultTransform, ...overrides };
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function partId(prefix: "R" | "P" | "J", index: number) {
  return `${prefix}-${String(index + 101).padStart(3, "0")}`;
}

function addedPart<TLibraryPart>(id: string, kind: PartKind, libraryPart: TLibraryPart) {
  return { id, kind, libraryPart };
}

function rodTransformAtWorld(
  index: number,
  dimensions: FurnitureProjectDefinition["dimensions"],
  spec: RodSpec,
): PartTransform {
  const baseY = dimensions.height / 2 + 55;
  const baseZ = index * 25;
  return transform({
    x: spec.x,
    y: spec.y - baseY,
    z: spec.z - baseZ,
    sizeX: spec.length / 10,
    sizeY: 10,
    rotX: spec.axis === "y" ? -90 : 0,
    rotY: spec.axis === "x" ? 90 : 0,
  });
}

function panelTransformAtWorld(
  index: number,
  dimensions: FurnitureProjectDefinition["dimensions"],
  panel: FurnitureProjectDefinition["panels"][number],
): PartTransform {
  const baseY = dimensions.height / 2 + 48 + index * 32;
  return transform({
    y: panel.y - baseY,
    sizeX: panel.width,
    sizeY: panel.thickness,
    sizeZ: panel.depth,
  });
}

function jointTransformAtWorld(
  index: number,
  dimensions: FurnitureProjectDefinition["dimensions"],
  joint: JointSpec,
): PartTransform {
  const baseY = dimensions.height / 2 + 40 + index * 35;
  return transform({
    x: joint.x,
    y: joint.y - baseY,
    z: joint.z,
    sizeX: 50,
    sizeY: 20,
    sizeZ: 20,
    rotY: 90,
  });
}

function panelSupportTransformAtWorld(
  index: number,
  dimensions: FurnitureProjectDefinition["dimensions"],
  support: PanelSupportSpec,
): PartTransform {
  const baseY = dimensions.height / 2 + 40 + index * 35;
  return transform({
    x: support.x,
    y: support.y - baseY,
    z: support.z,
    sizeX: 42,
    sizeY: 32.8,
    sizeZ: 14,
    rotY: 90,
    rotZ: 180,
  });
}

function connection(connectorId: string, portId: string, shaftId: string, positionOnShaft: number): AssemblyConnection {
  return { connectorId, portId, shaftId, positionOnShaft: clamp01(positionOnShaft), behavior: "fixed" };
}

function createFurnitureProject<TLibraryPart>(
  definition: FurnitureProjectDefinition,
  libraryParts: ProjectLibraryParts<TLibraryPart>,
  timestamp: string,
) {
  const halfWidth = definition.frameWidth / 2;
  const halfDepth = definition.frameDepth / 2;
  const floorY = 5;
  const rods: RodSpec[] = [];
  const joints: JointSpec[] = [];
  const panelSupports: PanelSupportSpec[] = [];
  const groups: Array<{ id: string; name: string; partIds: string[] }> = [];

  const addRod = (name: string, x: number, y: number, z: number, length: number, axis: RodSpec["axis"]) => {
    const rod = { id: partId("R", rods.length), name, x, y, z, length, axis };
    rods.push(rod);
    return rod;
  };
  const addJoint = (
    name: string,
    x: number,
    y: number,
    z: number,
    firstRod: RodSpec,
    firstRodPosition: number,
    secondRod: RodSpec,
    secondRodPosition: number,
  ) => {
    const joint = {
      id: partId("J", joints.length),
      name,
      x,
      y,
      z,
      firstRodId: firstRod.id,
      firstRodPosition,
      secondRodId: secondRod.id,
      secondRodPosition,
    };
    joints.push(joint);
    return joint;
  };

  const uprightPositions = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ];
  const uprights = uprightPositions.map(({ x, z }, index) =>
    addRod(`立柱 ${index + 1}`, x, floorY + definition.uprightHeight / 2, z, definition.uprightHeight, "y"),
  );
  const feet = [
    addRod("左侧防倾倒脚杆", -halfWidth, floorY, 0, definition.footDepth, "z"),
    addRod("右侧防倾倒脚杆", halfWidth, floorY, 0, definition.footDepth, "z"),
  ];
  const baseJointIds = uprightPositions.map(({ x, z }, index) => {
    const foot = index === 0 || index === 3 ? feet[0] : feet[1];
    return addJoint(
      "底部受力节点",
      x,
      floorY,
      z,
      uprights[index],
      0,
      foot,
      (z + definition.footDepth / 2) / definition.footDepth,
    ).id;
  });
  groups.push({
    id: `${definition.id}-base`,
    name: `${definition.footDepth} MM 防倾倒落地脚框`,
    partIds: [...feet.map(({ id }) => id), ...baseJointIds],
  });
  groups.push({
    id: `${definition.id}-uprights`,
    name: "四角连续承载立柱",
    partIds: uprights.map(({ id }) => id),
  });

  const panelSpecs = definition.panels.map((panel, panelIndex) => {
    const panelBottomY = panel.y - panel.thickness / 2;
    const supportY = panelBottomY - 18;
    const front = addRod(`${panel.name}前承托`, 0, supportY, -halfDepth, definition.frameWidth, "x");
    const rear = addRod(`${panel.name}后承托`, 0, supportY, halfDepth, definition.frameWidth, "x");
    const supportRods = [front, rear];
    const supportJointIds: string[] = [];
    uprightPositions.forEach(({ x, z }, cornerIndex) => {
      const supportRod = z < 0 ? front : rear;
      supportJointIds.push(addJoint(
        `${panel.name}承托节点`,
        x,
        supportY,
        z,
        uprights[cornerIndex],
        (supportY - floorY) / definition.uprightHeight,
        supportRod,
        (x + halfWidth) / definition.frameWidth,
      ).id);
    });
    const panelId = partId("P", panelIndex);
    const surfaceSupportX = Math.min(halfWidth - 70, panel.width * 0.32);
    const surfaceSupportIds = [
      { x: -surfaceSupportX, z: -halfDepth, rod: front },
      { x: surfaceSupportX, z: -halfDepth, rod: front },
      { x: surfaceSupportX, z: halfDepth, rod: rear },
      { x: -surfaceSupportX, z: halfDepth, rod: rear },
    ].map(({ x, z, rod }) => {
      const support: PanelSupportSpec = {
        id: partId("J", 200 + panelSupports.length),
        name: `${panel.name}表面承托座`,
        x,
        y: panelBottomY - 16.4,
        z,
        rodId: rod.id,
        positionOnRod: (x + halfWidth) / definition.frameWidth,
      };
      panelSupports.push(support);
      return support.id;
    });
    groups.push({
      id: `${definition.id}-panel-${panelIndex + 1}`,
      name: `${panel.name}｜四点表面承托`,
      partIds: [panelId, ...supportRods.map(({ id }) => id), ...supportJointIds, ...surfaceSupportIds],
    });
    return { ...panel, id: panelId };
  });

  definition.railLevels.forEach((level, levelIndex) => {
    const front = addRod(`${level.name}前杆`, 0, level.y, -halfDepth, definition.frameWidth, "x");
    const rear = addRod(`${level.name}后杆`, 0, level.y, halfDepth, definition.frameWidth, "x");
    const railJointIds: string[] = [];
    uprightPositions.forEach(({ x, z }, cornerIndex) => {
      const rail = z < 0 ? front : rear;
      railJointIds.push(addJoint(
        `${level.name}节点`,
        x,
        level.y,
        z,
        uprights[cornerIndex],
        (level.y - floorY) / definition.uprightHeight,
        rail,
        (x + halfWidth) / definition.frameWidth,
      ).id);
    });
    groups.push({
      id: `${definition.id}-rail-${levelIndex + 1}`,
      name: level.name,
      partIds: [front.id, rear.id, ...railJointIds],
    });
  });

  const addedParts = [
    ...rods.map(({ id }) => addedPart(id, "rod", libraryParts.shaft)),
    ...panelSpecs.map(({ id }) => addedPart(id, "panel", libraryParts.panel)),
    ...joints.map(({ id }) => addedPart(id, "joint", libraryParts.crossConnector)),
    ...panelSupports.map(({ id }) => addedPart(id, "joint", libraryParts.panelSupport)),
  ];
  const transforms = {
    ...Object.fromEntries(rods.map((rod, index) => [rod.id, rodTransformAtWorld(index, definition.dimensions, rod)])),
    ...Object.fromEntries(panelSpecs.map((panel, index) => [panel.id, panelTransformAtWorld(index, definition.dimensions, panel)])),
    ...Object.fromEntries(joints.map((joint, index) => [joint.id, jointTransformAtWorld(index, definition.dimensions, joint)])),
    ...Object.fromEntries(panelSupports.map((support, index) => [
      support.id,
      panelSupportTransformAtWorld(joints.length + index, definition.dimensions, support),
    ])),
  };
  const assemblyConnections = [
    ...joints.flatMap((joint) => [
      connection(joint.id, "SHAFT-Y", joint.firstRodId, joint.firstRodPosition),
      connection(joint.id, "SHAFT-Z", joint.secondRodId, joint.secondRodPosition),
    ]),
    ...panelSupports.map((support) =>
      connection(support.id, "SHAFT", support.rodId, support.positionOnRod),
    ),
  ];

  return {
    id: definition.id,
    name: definition.name,
    version: PROJECT_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshot: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      dimensions: definition.dimensions,
      background: "room" as const,
      transforms,
      materials: {
        ...Object.fromEntries(rods.map(({ id }) => [id, definition.metalMaterial])),
        ...Object.fromEntries(joints.map(({ id }) => [id, definition.metalMaterial])),
        ...Object.fromEntries(panelSupports.map(({ id }) => [id, definition.metalMaterial])),
        ...Object.fromEntries(panelSpecs.map(({ id, material }) => [id, material])),
      },
      resolvedRiskIds: [],
      deletedIds: builtInPartIds,
      addedParts,
      userGroups: groups,
      hiddenIds: [],
      lockedIds: [],
      isolatedIds: [],
      assemblyConnections,
    },
  };
}

export function createGravityValidatedFurnitureProjects<TLibraryPart>(
  libraryParts: ProjectLibraryParts<TLibraryPart>,
  timestamp = new Date().toISOString(),
) {
  return FURNITURE_PROJECT_DEFINITIONS.map((definition) =>
    createFurnitureProject(definition, libraryParts, timestamp),
  );
}
