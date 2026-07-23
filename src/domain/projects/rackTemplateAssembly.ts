import type { AssemblyConstraint, ComponentTransform } from "../model/editorSchema";
import type { PanelCutout } from "../components/panelCutouts";

export type RackTemplateDimensions = {
  width: number;
  height: number;
  depth: number;
};

export type OptimizedRackTemplateState = {
  transforms: Record<string, ComponentTransform>;
  panelCutouts: Record<string, PanelCutout[]>;
  assemblyConnections: AssemblyConstraint[];
};

const horizontalRodIdsByLevel = [
  ["R-001", "R-002", "R-003", "R-004"],
  ["R-005", "R-006", "R-007", "R-008"],
  ["R-009", "R-010", "R-011", "R-012"],
] as const;
const verticalRodIds = ["R-013", "R-014", "R-015", "R-016"] as const;
const jointIdsByLevel = [
  ["J-001", "J-002", "J-003", "J-004"],
  ["J-005", "J-006", "J-007", "J-008"],
  ["J-009", "J-010", "J-011", "J-012"],
] as const;
const panelIdsByLevel = ["P-001", "P-002", "P-003"] as const;

const baseTransform: ComponentTransform = {
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

function fixedConnection(connectorId: string, shaftId: string, positionOnShaft: number): AssemblyConstraint {
  return {
    connectorId,
    portId: `TEMPLATE-${shaftId}`,
    shaftId,
    positionOnShaft,
    behavior: "fixed",
  };
}

function panelHoleConnection(panelId: string, shaftId: string, cornerIndex: number, positionOnShaft: number): AssemblyConstraint {
  return {
    connectorId: panelId,
    portId: `PANEL-HOLE-${cornerIndex + 1}`,
    shaftId,
    positionOnShaft,
    behavior: "slide",
  };
}

/**
 * Adds explicit, editable assembly semantics to the original rack templates:
 * every corner node is connected to its three shared shafts and every visible
 * shelf receives four aligned Ø11 mm holes for the Ø10 mm uprights.
 */
export function createOptimizedRackTemplateState(
  dimensions: RackTemplateDimensions,
  deletedPartIds: readonly string[],
): OptimizedRackTemplateState {
  const deleted = new Set(deletedPartIds);
  const transforms: Record<string, ComponentTransform> = {};
  const panelCutouts: Record<string, PanelCutout[]> = {};
  const assemblyConnections: AssemblyConstraint[] = [];

  for (let level = 0; level < 3; level += 1) {
    const horizontalRods = horizontalRodIdsByLevel[level];
    const joints = jointIdsByLevel[level];
    const panelId = panelIdsByLevel[level];
    const verticalPosition = level / 2;

    for (let corner = 0; corner < 4; corner += 1) {
      const jointId = joints[corner];
      if (deleted.has(jointId)) continue;
      const previousHorizontal = horizontalRods[(corner + 3) % 4];
      const nextHorizontal = horizontalRods[corner];
      const verticalRod = verticalRodIds[corner];
      if (!deleted.has(previousHorizontal)) assemblyConnections.push(fixedConnection(jointId, previousHorizontal, 1));
      if (!deleted.has(nextHorizontal)) assemblyConnections.push(fixedConnection(jointId, nextHorizontal, 0));
      if (!deleted.has(verticalRod)) assemblyConnections.push(fixedConnection(jointId, verticalRod, verticalPosition));
    }

    if (deleted.has(panelId)) continue;
    const panelWidth = dimensions.width + 20;
    const panelDepth = dimensions.depth + 20;
    transforms[panelId] = {
      ...baseTransform,
      sizeX: panelWidth,
      sizeY: 8,
      sizeZ: panelDepth,
    };
    panelCutouts[panelId] = [
      { id: `${panelId}-HOLE-1`, xMm: 10, zMm: 10, diameterMm: 11 },
      { id: `${panelId}-HOLE-2`, xMm: panelWidth - 10, zMm: 10, diameterMm: 11 },
      { id: `${panelId}-HOLE-3`, xMm: panelWidth - 10, zMm: panelDepth - 10, diameterMm: 11 },
      { id: `${panelId}-HOLE-4`, xMm: 10, zMm: panelDepth - 10, diameterMm: 11 },
    ];
    verticalRodIds.forEach((shaftId, corner) => {
      if (!deleted.has(shaftId)) assemblyConnections.push(panelHoleConnection(panelId, shaftId, corner, verticalPosition));
    });
  }

  return { transforms, panelCutouts, assemblyConnections };
}
