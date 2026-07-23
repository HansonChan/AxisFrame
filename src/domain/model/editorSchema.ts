import type { PortBehavior } from "../assembly/assembly";
import type { ComponentUsageTag } from "../components/componentUsage";

export const COMPONENT_DEFINITION_SCHEMA_VERSION = 1 as const;
export const COMPONENT_INSTANCE_SCHEMA_VERSION = 1 as const;
export const ASSEMBLY_CONSTRAINT_SCHEMA_VERSION = 1 as const;

export type ComponentKind = "joint" | "rod" | "panel";

export type ComponentTransform = {
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

export type ComponentDefinition<TGeometry> = {
  schemaVersion?: typeof COMPONENT_DEFINITION_SCHEMA_VERSION;
  id: string;
  model: string;
  name: string;
  kind: ComponentKind;
  status: "ready" | "draft" | "review";
  material: string;
  dimensions: { width: number; length: number; height: number };
  compatibleRod: string;
  connector: string;
  usageTags: ComponentUsageTag[];
  source: "preset" | "three-view" | "manual";
  updatedAt: string;
  geometry: TGeometry;
};

export type ComponentInstance<TDefinition> = {
  schemaVersion?: typeof COMPONENT_INSTANCE_SCHEMA_VERSION;
  id: string;
  kind: ComponentKind;
  libraryPart?: TDefinition;
};

export type AssemblyConstraint = {
  schemaVersion?: typeof ASSEMBLY_CONSTRAINT_SCHEMA_VERSION;
  connectorId: string;
  portId: string;
  shaftId: string;
  positionOnShaft: number;
  behavior: PortBehavior;
};
