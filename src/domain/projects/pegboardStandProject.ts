import type { AssemblyConnection } from "../assembly/assembly";
import { PROJECT_SCHEMA_VERSION } from "./projectSchema";

export const PEGBOARD_STAND_PROJECT_ID = "project-stable-pegboard-stand-v2";
export const PEGBOARD_STAND_PROJECT_SEED_KEY = "axisframe-stable-pegboard-stand-seeded-v3";
export const PEGBOARD_STAND_PROJECT_NAME = "重设计｜稳定型洞洞板支架 600×450";

type PartKind = "joint" | "rod" | "panel";

type ProjectLibraryParts<TLibraryPart> = {
  shaft: TLibraryPart;
  pegboard: TLibraryPart;
  crossConnector: TLibraryPart;
  panelClamp: TLibraryPart;
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

const dimensions = { width: 620, height: 760, depth: 520 };

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

function addedPart<TLibraryPart>(id: string, kind: PartKind, libraryPart: TLibraryPart) {
  return { id, kind, libraryPart };
}

function rodTransformAtWorld(index: number, x: number, y: number, z: number, lengthMm: number, rotation: Partial<Pick<PartTransform, "rotX" | "rotY" | "rotZ">> = {}) {
  const baseY = dimensions.height / 2 + 55;
  const baseZ = index * 25;
  return transform({
    x,
    y: y - baseY,
    z: z - baseZ,
    sizeX: lengthMm / 10,
    sizeY: 10,
    sizeZ: 10,
    ...rotation,
  });
}

function jointTransformAtWorld(index: number, x: number, y: number, z: number, rotation: Partial<Pick<PartTransform, "rotX" | "rotY" | "rotZ">> = {}, size: [number, number, number] = [50, 20, 20]) {
  const baseY = dimensions.height / 2 + 40 + index * 35;
  return transform({
    x,
    y: y - baseY,
    z,
    sizeX: size[0],
    sizeY: size[1],
    sizeZ: size[2],
    ...rotation,
  });
}

function connection(connectorId: string, portId: string, shaftId: string, positionOnShaft: number): AssemblyConnection {
  return { connectorId, portId, shaftId, positionOnShaft, behavior: "fixed" };
}

export function createStablePegboardStandProject<TLibraryPart>(
  libraryParts: ProjectLibraryParts<TLibraryPart>,
  timestamp = new Date().toISOString(),
) {
  const rods = Array.from({ length: 10 }, (_, index) =>
    addedPart(`R-${String(index + 17).padStart(3, "0")}`, "rod", libraryParts.shaft),
  );
  const panel = addedPart("P-004", "panel", libraryParts.pegboard);
  const frameConnectors = Array.from({ length: 12 }, (_, index) =>
    addedPart(`J-${String(index + 13).padStart(3, "0")}`, "joint", libraryParts.crossConnector),
  );
  const panelClamps = Array.from({ length: 4 }, (_, index) =>
    addedPart(`J-${String(index + 25).padStart(3, "0")}`, "joint", libraryParts.panelClamp),
  );
  const addedParts = [...rods, panel, ...frameConnectors, ...panelClamps];

  const assemblyConnections: AssemblyConnection[] = [
    connection("J-013", "SHAFT-Y", "R-017", 220 / 760),
    connection("J-013", "SHAFT-Z", "R-019", 0),
    connection("J-014", "SHAFT-Y", "R-018", 220 / 760),
    connection("J-014", "SHAFT-Z", "R-019", 1),
    connection("J-015", "SHAFT-Y", "R-017", 720 / 760),
    connection("J-015", "SHAFT-Z", "R-020", 0),
    connection("J-016", "SHAFT-Y", "R-018", 720 / 760),
    connection("J-016", "SHAFT-Z", "R-020", 1),
    connection("J-017", "SHAFT-Y", "R-017", 5 / 760),
    connection("J-017", "SHAFT-Z", "R-021", 0.5),
    connection("J-018", "SHAFT-Y", "R-018", 5 / 760),
    connection("J-018", "SHAFT-Z", "R-022", 0.5),
    connection("J-019", "SHAFT-Y", "R-023", 0),
    connection("J-019", "SHAFT-Z", "R-021", 1),
    connection("J-020", "SHAFT-Y", "R-024", 0),
    connection("J-020", "SHAFT-Z", "R-022", 1),
    connection("J-021", "SHAFT-Y", "R-017", 450 / 760),
    connection("J-021", "SHAFT-Z", "R-025", 0),
    connection("J-022", "SHAFT-Y", "R-018", 450 / 760),
    connection("J-022", "SHAFT-Z", "R-026", 0),
    connection("J-023", "SHAFT-Y", "R-023", 445 / 450),
    connection("J-023", "SHAFT-Z", "R-025", 1),
    connection("J-024", "SHAFT-Y", "R-024", 445 / 450),
    connection("J-024", "SHAFT-Z", "R-026", 1),
    connection("J-025", "SHAFT", "R-017", 310 / 760),
    connection("J-026", "SHAFT", "R-018", 310 / 760),
    connection("J-027", "SHAFT", "R-017", 620 / 760),
    connection("J-028", "SHAFT", "R-018", 620 / 760),
  ];

  return {
    id: PEGBOARD_STAND_PROJECT_ID,
    name: PEGBOARD_STAND_PROJECT_NAME,
    version: PROJECT_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    snapshot: {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      dimensions,
      background: "room" as const,
      transforms: {
        "R-017": rodTransformAtWorld(0, -300, 380, -100, 760, { rotX: -90 }),
        "R-018": rodTransformAtWorld(1, 300, 380, -100, 760, { rotX: -90 }),
        "R-019": rodTransformAtWorld(2, 0, 220, -100, 600, { rotY: 90 }),
        "R-020": rodTransformAtWorld(3, 0, 720, -100, 600, { rotY: 90 }),
        "R-021": rodTransformAtWorld(4, -300, 5, -100, 520),
        "R-022": rodTransformAtWorld(5, 300, 5, -100, 520),
        "R-023": rodTransformAtWorld(6, -300, 230, 160, 450, { rotX: -90 }),
        "R-024": rodTransformAtWorld(7, 300, 230, 160, 450, { rotX: -90 }),
        "R-025": rodTransformAtWorld(8, -300, 450, 30, 260),
        "R-026": rodTransformAtWorld(9, 300, 450, 30, 260),
        "P-004": transform({ y: 42, z: -110, sizeX: 600, sizeY: 12, sizeZ: 450, rotX: 90 }),
        "J-013": jointTransformAtWorld(0, -300, 220, -100, { rotY: 90 }),
        "J-014": jointTransformAtWorld(1, 300, 220, -100, { rotY: 90 }),
        "J-015": jointTransformAtWorld(2, -300, 720, -100, { rotY: 90 }),
        "J-016": jointTransformAtWorld(3, 300, 720, -100, { rotY: 90 }),
        "J-017": jointTransformAtWorld(4, -300, 5, -100),
        "J-018": jointTransformAtWorld(5, 300, 5, -100),
        "J-019": jointTransformAtWorld(6, -300, 5, 160),
        "J-020": jointTransformAtWorld(7, 300, 5, 160),
        "J-021": jointTransformAtWorld(8, -300, 450, -100),
        "J-022": jointTransformAtWorld(9, 300, 450, -100),
        "J-023": jointTransformAtWorld(10, -300, 450, 160),
        "J-024": jointTransformAtWorld(11, 300, 450, 160),
        "J-025": jointTransformAtWorld(12, -300, 310, -105, { rotX: -90 }, [30, 40, 20]),
        "J-026": jointTransformAtWorld(13, 300, 310, -105, { rotX: -90 }, [30, 40, 20]),
        "J-027": jointTransformAtWorld(14, -300, 620, -105, { rotX: -90 }, [30, 40, 20]),
        "J-028": jointTransformAtWorld(15, 300, 620, -105, { rotX: -90 }, [30, 40, 20]),
      },
      materials: {
        "P-004": "oak",
        ...Object.fromEntries(addedParts.filter(({ kind }) => kind !== "panel").map(({ id }) => [id, "stainless"])),
      },
      resolvedRiskIds: [],
      deletedIds: [
        "P-001", "P-002", "P-003",
        "R-001", "R-002", "R-003", "R-004", "R-005", "R-006", "R-007", "R-008", "R-009", "R-010", "R-011", "R-012", "R-013", "R-014", "R-015", "R-016",
        "J-001", "J-002", "J-003", "J-004", "J-005", "J-006", "J-007", "J-008", "J-009", "J-010", "J-011", "J-012",
      ],
      addedParts,
      userGroups: [
        { id: "pegboard-panel", name: "600×450 孔阵洞洞板", partIds: ["P-004", "J-025", "J-026", "J-027", "J-028"] },
        { id: "pegboard-front-frame", name: "前部承载框", partIds: ["R-017", "R-018", "R-019", "R-020", "J-013", "J-014", "J-015", "J-016"] },
        { id: "pegboard-base", name: "520 MM 防倾倒底架", partIds: ["R-021", "R-022", "J-017", "J-018", "J-019", "J-020"] },
        { id: "pegboard-rear-support", name: "后部抗侧倾支撑", partIds: ["R-023", "R-024", "R-025", "R-026", "J-021", "J-022", "J-023", "J-024"] },
      ],
      hiddenIds: [],
      lockedIds: [],
      isolatedIds: [],
      assemblyConnections,
    },
  };
}
