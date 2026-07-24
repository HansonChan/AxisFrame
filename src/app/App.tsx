import { GizmoHelper, Html, Line, OrbitControls, TransformControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { findBestShaftPanelHoleSnap, findBestSmartSnap, isShaftAssemblyPort, snapAxialStopToPanelSurface, snapConnectorToConnectorSurface, snapConnectorToPanelSurface, type AssemblyConnection, type AssemblyPort, type ConnectorContactTarget, type ConnectorPanelSurfaceContact, type PanelContactTarget, type PanelHoleTarget, type PortBehavior, type PortKind, type SmartSnapResult, type ShaftSegment } from "../domain/assembly/assembly";
import { alignPairPosition, findReferenceAlignment, retargetMovingPartForFixedAnchor, type AlignmentAxis, type ReferenceAlignment } from "../domain/assembly/pairConstraints";
import {
  copyPreciseRelationsForPartMap,
  createShaftBoreRelation,
  createSurfaceRelation,
  preciseRelationFailureMessage,
  replacePairRelation,
  solveSurfaceRelation,
  type BoxAssemblyPart,
  type PreciseAssemblyRelation,
} from "../domain/assembly/preciseRelations";
import { planSmartRackAlignment, type SmartAlignAxis, type SmartAlignPart } from "../domain/assembly/smartRackAlignment";
import { analyzeStructure, estimatePartMassKg, type PanelMountConnection, type StructuralAnalysis, type StructuralIssue, type StructuralPart } from "../domain/assembly/structuralAnalysis";
import { componentSceneSize, mmToScene, normalizedComponentSelectionSize } from "../domain/components/componentBounds";
import { getCachedHollowComponentGeometry, hasBooleanCutouts } from "../domain/components/componentBooleanGeometry";
import { resolveShaftInstanceParameters } from "../domain/components/shaftInstance";
import { shaftPlacementRotation, type ShaftPlacementOrientation } from "../domain/components/shaftPlacement";
import { calculateGroupPivot, transformGroupMembers } from "../domain/geometry/groupTransform";
import {
  createParallelClampDefinition,
  defaultParallelClampParameters,
  parallelClampCenterDistanceOptions,
  parallelClampDiameterOptions,
  parallelClampDimensions,
  parallelClampModel,
  resolveParallelClampParameters,
  resolveParallelClampVariant,
  parallelClampVariants,
  type ParallelClampParameterKey,
  type ParallelClampParameters,
} from "../domain/components/parallelClamp";
import {
  createEqualBoreCrossClampDefinition,
  defaultEqualBoreCrossClampVariant,
  equalBoreCrossClampDimensions,
  equalBoreCrossClampModel,
  equalBoreCrossClampVariants,
  resolveEqualBoreCrossClampVariant,
} from "../domain/components/equalBoreCrossClamp";
import {
  createEqualBoreTClampDefinition,
  defaultEqualBoreTClampVariant,
  equalBoreTClampDimensions,
  equalBoreTClampModel,
  equalBoreTClampVariants,
  resolveEqualBoreTClampVariant,
} from "../domain/components/equalBoreTClamp";
import {
  createRoundFixedBaseDefinition,
  defaultRoundFixedBaseVariant,
  resolveRoundFixedBaseVariant,
  roundFixedBaseDimensions,
  roundFixedBaseModel,
  roundFixedBaseVariants,
} from "../domain/components/roundFixedBase";
import {
  createVerticalFixedBaseDefinition,
  defaultVerticalFixedBaseVariant,
  resolveVerticalFixedBaseVariant,
  verticalFixedBaseDimensions,
  verticalFixedBaseVariants,
} from "../domain/components/verticalFixedBase";
import {
  createShaftStopDefinition,
  defaultShaftStopParameters,
  resolveShaftStopParameters,
  resolveShaftStopVariant,
  shaftStopDimensions,
  shaftStopInnerDiameterOptions,
  shaftStopModel,
  shaftStopThicknessOptions,
  shaftStopVariants,
  type ShaftStopParameterKey,
  type ShaftStopParameters,
} from "../domain/components/shaftStop";
import { resizeShaftFromEndpoint } from "../domain/geometry/shaftEndpointResize";
import { resizePanelFromEdge, type PanelResizeAxis } from "../domain/geometry/panelEdgeResize";
import { flipPartTransform, type FlipDirection } from "../domain/geometry/partFlip";
import { rotatePartTransform90, type QuickRotateAxis, type QuickRotateDirection } from "../domain/geometry/quickRotate";
import { mirrorDuplicatePlacement } from "../domain/geometry/mirrorDuplicate";
import { createPairDistanceGuides, type PairDistanceAxis } from "../domain/geometry/pairDistance";
import { generateExplodedView } from "../domain/geometry/explodedView";
import { roundFreePositionMm, sceneDeltaToFreePositionMm } from "../domain/geometry/freeMovement";
import {
  createOverallResizePlan,
  dominantDirectionScale,
  OVERALL_DIMENSION_MAX_MM,
  OVERALL_DIMENSION_MIN_MM,
  resizePanelEnvelope,
  scaleWorldPointMm,
} from "../domain/geometry/overallResize";
import { applySnapshotPatch, createHistoryEntry, type EditorCommandName, type EditorHistoryEntry } from "../domain/editor/editorHistory";
import type { AssemblyConstraint, ComponentDefinition, ComponentInstance, ComponentKind, ComponentTransform } from "../domain/model/editorSchema";
import {
  BUILT_IN_CONNECTOR_HEIGHT_MM,
  DESIGN_GROUND_Y_MM,
  builtInLevelYsMm,
  builtInPanelYsMm,
} from "../domain/model/designCoordinates";
import { exportComponentGlb, type ComponentGlbExportResult } from "../features/components/exportComponentGlb";
import { BomPage } from "../features/bom/BomPage";
import { DevServerHealthNotice } from "./DevServerHealthNotice";
import { createProjectBackup, downloadJsonFile, parseProjectBackup, PROJECT_SCHEMA_VERSION } from "../domain/projects/projectSchema";
import {
  mergeDesignBounds,
  orientedBoxBounds,
  shaftBounds,
  type BoundsTransform,
  type OverallDesignBounds,
} from "../domain/geometry/designBounds";
import { acrylicLiquidGlassMaterial } from "../domain/components/acrylicMaterial";
import { inferPanelMaterial, panelMaterialCatalogLabel, type PanelMaterial } from "../domain/components/panelMaterials";
import { componentUsageLabels, componentUsageOptions, normalizeUsageTags, type ComponentUsageTag } from "../domain/components/componentUsage";
import {
  createCenteredPanelCutout,
  movePanelCutoutFromReference,
  normalizePanelCutout,
  normalizePanelCutouts,
  panelCutoutReferenceDistances,
  panelCutoutReferenceOffset,
  type PanelCutout,
  type PanelCutoutReference,
} from "../domain/components/panelCutouts";
import { addCircularCutoutPrimitive, circularHoleClearances, clampCircularHolePoint, describeCircularCutouts, moveCircularCutoutPrimitive, normalizeCircularCutoutPrimitives, projectThreeViewOutlines, removePrimitiveAtIndex, updateCircularCutoutDiameter, type ThreeViewHoleDraft, type ThreeViewPlane } from "../domain/components/threeViewGeometry";
import { calculatePegboardHoles, defaultPegboardParameters, resolvePegboardParameters, type PegboardParameters } from "../domain/components/pegboard";
import {
  createPhotoCoffeeRackProject,
  PHOTO_RACK_PROJECT_ID,
  PHOTO_RACK_PROJECT_SEED_KEY,
} from "../domain/projects/referenceRackProject";
import {
  createStablePegboardStandProject,
  PEGBOARD_STAND_PROJECT_ID,
  PEGBOARD_STAND_PROJECT_SEED_KEY,
} from "../domain/projects/pegboardStandProject";
import {
  createGravityValidatedFurnitureProjects,
  FURNITURE_PROJECTS_SEED_KEY,
} from "../domain/projects/furnitureProjects";
import { createOptimizedRackTemplateState } from "../domain/projects/rackTemplateAssembly";
import { shaftDiameterOptions } from "../domain/components/componentFamilies";
import {
  AlertTriangle,
  Box,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardPaste,
  CircleHelp,
  Copy,
  Download,
  FileJson,
  FileOutput,
  Focus,
  FolderKanban,
  Gauge,
  Grid3X3,
  Group,
  ImageUp,
  Keyboard,
  Languages,
  Layers3,
  Lock,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
  MousePointer2,
  PackageSearch,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Search,
  ScanSearch,
  Settings2,
  Target,
  Trash2,
  TriangleAlert,
  Ungroup,
  Unlock,
  WandSparkles,
  Wrench,
  Eye,
  EyeOff,
  ExternalLink,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Clock3,
  Moon,
  Sun,
  X,
} from "lucide-react";

type StatusTone = "neutral" | "success" | "warning" | "danger";
type Lang = "en" | "zh";
type Theme = "dark" | "light";
type ViewMode = "perspective" | "top" | "front" | "side";
type RenderMode = "wireframe" | "solid" | "tags";
type SelectionMode = "click" | "box";
type PartKind = ComponentKind;
type AddedPart = ComponentInstance<LibraryPart>;
type UserGroup = { id: string; name: string; partIds: string[] };
type CanvasBg = "black" | "gray" | "white" | "room" | "custom";
type TransformMode = "translate" | "rotate" | "scale";
type MirrorAxis = "x" | "z";
type MetalMaterial = "stainless" | "matteBlack" | "whiteMetal";
type PartMaterial = PanelMaterial | MetalMaterial;
type AppPage = "design" | "parts" | "projects" | "bom";
const libraryKindOrder = ["rod", "panel", "joint"] as const satisfies readonly PartKind[];
const libraryKindFilterOrder = ["all", ...libraryKindOrder] as const;
const libraryKindPriority = Object.fromEntries(libraryKindOrder.map((kind, index) => [kind, index])) as Record<PartKind, number>;

function orderLibraryParts<T extends { kind: PartKind }>(parts: readonly T[]) {
  return [...parts].sort((left, right) => libraryKindPriority[left.kind] - libraryKindPriority[right.kind]);
}

function uniqueDerivedGroupName(groups: readonly UserGroup[], sourceName: string, suffix: string) {
  const base = `${sourceName} ${suffix}`;
  const names = new Set(groups.map(({ name }) => name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

type LibraryPart = ComponentDefinition<ComponentGeometry> & {
  referenceLabel?: string;
  referenceUrl?: string;
  modelAssetUrl?: string;
  modelAssetName?: string;
  modelRotation?: Vec3Tuple;
  parameters?: ShaftStopParameters;
  shaftParameters?: { diameter: number; length: number };
  variantCount?: number;
  defaultPanelMaterial?: PanelMaterial;
  parallelClampParameters?: ParallelClampParameters;
  equalBoreCrossClampDiameter?: number;
  equalBoreTClampDiameter?: number;
  roundFixedBaseInnerDiameter?: number;
  verticalFixedBaseShaftDiameter?: number;
  pegboardParameters?: PegboardParameters;
  cornerHolePanelParameters?: {
    holeDiameter: number;
    holeInsetX: number;
    holeInsetZ: number;
    cornerRadius: number;
  };
};
type ComponentPrimitive = { shape: "box" | "cylinder" | "ring"; size: Vec3Tuple; position: Vec3Tuple; rotation?: Vec3Tuple; appearance?: "solid" | "cutout"; feature?: "drilled-hole" };
type ComponentPort = AssemblyPort & {
  kind: PortKind;
  behavior: PortBehavior;
  toleranceMm: number;
  capacity: number;
};
type ComponentGeometry = { primitives: ComponentPrimitive[]; ports: ComponentPort[] };
type RawComponentGeometry = { primitives: ComponentPrimitive[]; ports: Array<Pick<AssemblyPort, "id" | "axis" | "position" | "diameter">> };

type PartTransform = ComponentTransform;
type EditorSnapshot = {
  schemaVersion?: typeof PROJECT_SCHEMA_VERSION;
  dimensions: FrameDimensions;
  background?: CanvasBg;
  referenceImageDataUrl?: string | null;
  referenceImageVisible?: boolean;
  transforms: Record<string, PartTransform>;
  materials: Record<string, PartMaterial>;
  resolvedRiskIds: string[];
  deletedIds: string[];
  addedParts: AddedPart[];
  userGroups: UserGroup[];
  hiddenIds: string[];
  lockedIds: string[];
  isolatedIds: string[];
  assemblyConnections?: AssemblyConstraint[];
  preciseAssemblyRelations?: PreciseAssemblyRelation[];
  panelCutouts?: Record<string, PanelCutout[]>;
};

const REFERENCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const REFERENCE_IMAGE_MAX_EDGE_PX = 1400;

async function prepareReferenceImage(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("请选择 PNG、JPG 或 WebP 图片");
  }
  if (file.size > REFERENCE_IMAGE_MAX_BYTES) {
    throw new Error("图片不能超过 15 MB");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const candidate = new Image();
      candidate.onload = () => resolve(candidate);
      candidate.onerror = () => reject(new Error("图片读取失败，请更换文件后重试"));
      candidate.src = objectUrl;
    });
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("图片尺寸无效");

    const scale = Math.min(1, REFERENCE_IMAGE_MAX_EDGE_PX / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器无法处理图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
type SavedProject = {
  id: string;
  name: string;
  version: 1 | typeof PROJECT_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  snapshot: EditorSnapshot;
};
type SmartPlacement = { worldPoint: Vec3Tuple; anchorId?: string };
type PartClipboardItem = {
  sourceId: string;
  kind: PartKind;
  libraryPart?: LibraryPart;
  transform: PartTransform;
  material: PartMaterial;
  worldPoint: Vec3Tuple;
  panelCutouts?: PanelCutout[];
};
type FrameDimensions = {
  width: number;
  height: number;
  depth: number;
};
type RackTemplateId = string;
type RackTemplateDefinition = {
  id: RackTemplateId;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  dimensions: FrameDimensions;
  deletedPartIds: string[];
  previewImage?: string;
  snapshot?: EditorSnapshot;
  custom?: boolean;
  updatedAt?: string;
};
type SavedTemplate = {
  id: string;
  name: string;
  version: 1;
  createdAt: string;
  updatedAt: string;
  snapshot: EditorSnapshot;
};
type LocalizedText = string | Record<Lang, string>;

type PartInfo = {
  id: string;
  kind: PartKind;
  title: string;
  status: string;
  componentId: string;
  sku: string;
  orientation: string;
  compatibleRod: string;
  centerOffset: string;
  linkedRods: string;
  fastener: string;
  rule: string;
  warning?: boolean;
};

type Vec3Tuple = [number, number, number];
type TransformChangeHandler = (id: string, transform: PartTransform, connections?: AssemblyConnection[]) => void;
type GroupTransformChangeHandler = (transforms: Record<string, PartTransform>) => void;
type ShaftLengthPreviewHandler = (id: string, transform: PartTransform) => void;
type PanelEdgePreviewHandler = (id: string, transform: PartTransform) => void;
type PartContextMenuHandler = (id: string, clientX: number, clientY: number, worldPoint: Vec3Tuple) => void;
type SelectionRect = { left: number; top: number; right: number; bottom: number };
type ReferenceDrag = { id: string; position: Vec3Tuple };
type ReferenceGuideContextValue = {
  report: (id: string, position: Vec3Tuple | null) => void;
  resolve: (id: string, position: Vec3Tuple) => ReferenceAlignment;
};

const ReferenceGuideContext = createContext<ReferenceGuideContextValue | null>(null);

const navItems = [
  { id: "projects", label: { en: "PROJECTS", zh: "项目" }, icon: FolderKanban },
  { id: "create", label: { en: "CREATE", zh: "创建" }, icon: Copy },
  { id: "design", label: { en: "DESIGN", zh: "设计" }, icon: Box },
  { id: "bom", label: { en: "LIST", zh: "清单" }, icon: ClipboardList },
  { id: "parts", label: { en: "PARTS", zh: "组件" }, icon: PackageSearch },
];

const copy = {
  en: {
    appName: "AXISFRAME STUDIO",
    projectName: "THREE-TIER OPEN RACK",
    templateName: "OPEN SHELF TEMPLATE",
    blankProjectName: "BLANK DESIGN",
    blankTemplateName: "START FROM A TEMPLATE OR COMPONENTS",
    saved: "SAVED",
    autoSaved: "AUTO SAVED",
    autoSaving: "AUTO SAVING...",
    bomSynced: "BOM SYNCED",
    warningStatus: "0 ERRORS / 2 WARNINGS",
    undo: "UNDO",
    redo: "REDO",
    export: "EXPORT LIST",
    exportJson: "EXPORT JSON",
    exporting: "EXPORTING LIST...",
    model: "MODEL",
    structure: "STRUCTURE",
    nodes: "31 PARTS",
    search: "SEARCH PART / NODE",
    noTreeResults: "NO MATCHING PARTS",
    addPart: "ADD PART",
    addRod: "SHAFT ROD",
    addPanel: "SHELF PANEL",
    addJoint: "SPLIT CROSS CONNECTOR",
    groupSelection: "GROUP SELECTION",
    ungroup: "UNGROUP",
    duplicate: "DUPLICATE",
    copyParts: "COPY",
    pasteParts: "PASTE",
    mirrorDuplicate: "MIRROR DUPLICATE",
    flipHorizontal: "FLIP LEFT / RIGHT",
    flipVertical: "FLIP UP / DOWN",
    modifierDuplicate: "ALT/OPTION + DRAG TO DUPLICATE",
    hide: "HIDE",
    show: "SHOW",
    lock: "LOCK",
    unlock: "UNLOCK",
    isolate: "ISOLATE",
    clearIsolation: "SHOW ALL",
    focus: "FOCUS",
    selectedCount: "SELECTED",
    customGroups: "MY GROUPS",
    unsaved: "UNSAVED",
    saving: "SAVING",
    saveFailed: "SAVE FAILED",
    snapActive: "FREE MOVE / SMART GUIDES & CONNECTION SNAP",
    selection: "SELECT",
    clickSelect: "CLICK",
    boxSelect: "BOX",
    boxSelectHint: "DRAG TO SELECT PARTS",
    canvasActions: "CANVAS ACTIONS",
    selectAllVisible: "SELECT ALL VISIBLE",
    clearSelection: "CLEAR SELECTION",
    showAllParts: "SHOW ALL PARTS",
    resetView: "RESET VIEW",
    saveProject: "SAVE PROJECT",
    collapseStructure: "COLLAPSE STRUCTURE",
    expandStructure: "EXPAND STRUCTURE",
    collapseInspector: "COLLAPSE INSPECTOR",
    expandInspector: "EXPAND INSPECTOR",
    deleteTitle: "DELETE PARTS?",
    deleteImpact: "The selected parts will be removed and related groups will be updated.",
    noSelection: "NO PART SELECTED",
    cancel: "CANCEL",
    confirmDelete: "DELETE",
    view: "VIEW",
    mode: "MODE",
    views: { perspective: "PERSPECTIVE", top: "TOP", front: "FRONT", side: "SIDE" },
    modes: { wireframe: "WIREFRAME", solid: "SOLID", tags: "TAGS" },
    selected: "SELECTED",
    control: "CONTROL",
    orbitEnabled: "ORBIT ENABLED",
    risk: "RISK",
    object: "OBJECT",
    inspector: "INSPECTOR",
    fields: {
      componentId: "COMPONENT ID",
      sku: "SKU",
      orientation: "ORIENTATION",
      compatibleRod: "COMPATIBLE ROD",
      centerOffset: "CENTER OFFSET",
      linkedRods: "RELATED PARTS",
      fastener: "FASTENER",
    },
    ruleCheck: "RULE CHECK",
    rotate: "ROTATE 90°",
    quickRotate: "QUICK ROTATE",
    rotateClockwise90: "CLOCKWISE 90°",
    rotateCounterClockwise90: "COUNTERCLOCKWISE 90°",
    replace: "REPLACE CLAMP",
    locateBom: "LOCATE IN BOM",
    shareView: "SHARE VIEW",
    language: "中文",
    background: "BG",
    backgrounds: { black: "BLACK", gray: "GRAY", white: "WHITE", room: "ROOM" },
    uploadBackground: "UPLOAD PHOTO",
    quickFix: "QUICK FIX",
    autoFix: "AUTO-FIX CONNECTION",
    resetTransform: "RESET TRANSFORM",
    deletePart: "DELETE PART",
    contextActions: "PART ACTIONS",
    addComponentHere: "ADD COMPONENT HERE",
    material: "MATERIAL",
    materials: {
      oak: "NATURAL OAK",
      walnut: "WALNUT",
      acrylic: "ACRYLIC",
      stainless: "STAINLESS",
      matteBlack: "MATTE BLACK",
      whiteMetal: "WHITE",
    },
    values3d: "3D VALUES",
    position: "POSITION OFFSET",
    size: "SIZE",
    shaftParameters: "SHAFT PARAMETERS",
    diameter: "DIAMETER",
    rotation: "ROTATION",
    move: "MOVE",
    rotateMode: "ROTATE",
    scaleMode: "SCALE",
    scale: "SCALE FACTOR",
    width: "WIDTH",
    length: "LENGTH",
    height: "HEIGHT",
    panelLength: "LENGTH",
    panelWidth: "WIDTH",
    thickness: "THICKNESS",
    x: "X",
    y: "Y",
    z: "Z",
  },
  zh: {
    appName: "AXISFRAME STUDIO",
    projectName: "三层开放式置物架",
    templateName: "开放式置物架模板",
    blankProjectName: "空白设计",
    blankTemplateName: "从模板或组件开始创建",
    saved: "已保存",
    autoSaved: "已自动保存",
    autoSaving: "自动保存中...",
    bomSynced: "BOM 已同步",
    warningStatus: "0 错误 / 2 警告",
    undo: "撤销",
    redo: "重做",
    export: "导出清单",
    exportJson: "导出json",
    exporting: "正在生成...",
    model: "模型",
    structure: "结构树",
    nodes: "31 零件",
    search: "搜索零件 / 节点",
    noTreeResults: "没有匹配的零件",
    addPart: "添加零件",
    addRod: "光轴杆件",
    addPanel: "层板",
    addJoint: "十字型连接件",
    groupSelection: "编组选中项",
    ungroup: "取消编组",
    duplicate: "复制",
    copyParts: "复制",
    pasteParts: "粘贴",
    mirrorDuplicate: "镜像复制",
    flipHorizontal: "左右翻转",
    flipVertical: "上下翻转",
    modifierDuplicate: "按住 ALT/OPTION 拖拽复制",
    hide: "隐藏",
    show: "显示",
    lock: "锁定",
    unlock: "解锁",
    isolate: "隔离",
    clearIsolation: "显示全部",
    focus: "聚焦",
    selectedCount: "已选",
    customGroups: "我的编组",
    unsaved: "未保存",
    saving: "保存中",
    saveFailed: "保存失败",
    snapActive: "自由移动 / 智能参考线与连接吸附",
    selection: "选择",
    clickSelect: "点击",
    boxSelect: "框选",
    boxSelectHint: "拖动框选零件",
    canvasActions: "画布操作",
    selectAllVisible: "全选可见零件",
    clearSelection: "清除选择",
    showAllParts: "显示全部零件",
    resetView: "恢复透视视图",
    saveProject: "保存项目",
    collapseStructure: "收起结构树",
    expandStructure: "展开结构树",
    collapseInspector: "收起属性面板",
    expandInspector: "展开属性面板",
    deleteTitle: "删除零件？",
    deleteImpact: "选中的零件将被移除，关联编组会同步更新。",
    noSelection: "未选择零件",
    cancel: "取消",
    confirmDelete: "删除",
    view: "视图",
    mode: "模式",
    views: { perspective: "透视", top: "顶视", front: "正视", side: "侧视" },
    modes: { wireframe: "线框", solid: "实体", tags: "标签" },
    selected: "选中",
    control: "操作",
    orbitEnabled: "3D 操作已启用",
    risk: "风险",
    object: "对象",
    inspector: "属性面板",
    fields: {
      componentId: "组件 ID",
      sku: "SKU",
      orientation: "连接方向",
      compatibleRod: "适配光轴",
      centerOffset: "孔中心偏移",
      linkedRods: "关联组件",
      fastener: "紧固件",
    },
    ruleCheck: "规则校验",
    rotate: "旋转 90°",
    quickRotate: "快捷旋转",
    rotateClockwise90: "顺时针 90°",
    rotateCounterClockwise90: "逆时针 90°",
    replace: "替换夹具",
    locateBom: "定位 BOM",
    shareView: "分享视图",
    language: "EN",
    background: "背景",
    backgrounds: { black: "黑", gray: "灰", white: "白", room: "客厅" },
    uploadBackground: "上传照片",
    quickFix: "一键修复",
    autoFix: "自动修复连接",
    resetTransform: "重置变换",
    deletePart: "删除组件",
    contextActions: "组件操作",
    addComponentHere: "在此添加组件",
    material: "材质",
    materials: {
      oak: "原木纹",
      walnut: "胡桃木纹",
      acrylic: "亚克力",
      stainless: "不锈钢色",
      matteBlack: "哑黑色",
      whiteMetal: "白色",
    },
    values3d: "三维数值",
    position: "位置偏移",
    size: "尺寸",
    shaftParameters: "光轴参数",
    diameter: "直径",
    rotation: "旋转",
    move: "移动",
    rotateMode: "旋转",
    scaleMode: "缩放",
    scale: "缩放比例",
    width: "宽度",
    length: "长度",
    height: "高度",
    panelLength: "长",
    panelWidth: "宽",
    thickness: "厚度",
    x: "X",
    y: "Y",
    z: "Z",
  },
} satisfies Record<Lang, Record<string, any>>;

const defaultTransforms: Record<string, PartTransform> = {
  J: { x: 0, y: 0, z: 0, sizeX: 50, sizeY: BUILT_IN_CONNECTOR_HEIGHT_MM, sizeZ: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  R: { x: 0, y: 0, z: 0, sizeX: 100, sizeY: 10, sizeZ: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  P: { x: 0, y: 0, z: 0, sizeX: 880, sizeY: 8, sizeZ: 335, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
};

function builtInLevelYs(dimensions: FrameDimensions): [number, number, number] {
  return builtInLevelYsMm(dimensions.height).map(mmToScene) as [number, number, number];
}

function builtInPanelYs(dimensions: FrameDimensions): [number, number, number] {
  return builtInPanelYsMm(dimensions.height).map(mmToScene) as [number, number, number];
}

function getDefaultTransform(id: string): PartTransform {
  if (id.startsWith("R-")) return defaultTransforms.R;
  if (id.startsWith("P-")) return defaultTransforms.P;
  return defaultTransforms.J;
}

function getPartTransform(
  transforms: Record<string, PartTransform>,
  id: string,
): PartTransform {
  return { ...getDefaultTransform(id), ...transforms[id] };
}

function sceneOffset(transform: PartTransform): Vec3Tuple {
  return [mmToScene(transform.x), mmToScene(transform.y), mmToScene(transform.z)];
}

function addVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function degToRad(value: number) {
  return (value * Math.PI) / 180;
}

function radToDeg(value: number) {
  return (value * 180) / Math.PI;
}

const rods = [
  ["R-001", "N01", "N02"],
  ["R-002", "N02", "N03"],
  ["R-003", "N03", "N04"],
  ["R-004", "N04", "N01"],
  ["R-005", "N05", "N06"],
  ["R-006", "N06", "N07"],
  ["R-007", "N07", "N08"],
  ["R-008", "N08", "N05"],
  ["R-009", "N09", "N10"],
  ["R-010", "N10", "N11"],
  ["R-011", "N11", "N12"],
  ["R-012", "N12", "N09"],
  ["R-013", "N01", "N09"],
  ["R-014", "N02", "N10"],
  ["R-015", "N03", "N11"],
  ["R-016", "N04", "N12"],
] as const;

const builtInRodDimensionAxis: Record<string, keyof FrameDimensions> = {
  "R-001": "width", "R-002": "depth", "R-003": "width", "R-004": "depth",
  "R-005": "width", "R-006": "depth", "R-007": "width", "R-008": "depth",
  "R-009": "width", "R-010": "depth", "R-011": "width", "R-012": "depth",
  "R-013": "height", "R-014": "height", "R-015": "height", "R-016": "height",
};

function getRodBaseLengthMm(id: string, dimensions: FrameDimensions, addedParts: AddedPart[]): number {
  const dimensionAxis = builtInRodDimensionAxis[id];
  if (dimensionAxis) return dimensions[dimensionAxis];
  return addedParts.find((part) => part.id === id)?.libraryPart?.shaftParameters?.length ?? 1000;
}

const joints = [
  { id: "J-001", nodeId: "N01" },
  { id: "J-002", nodeId: "N02" },
  { id: "J-003", nodeId: "N03" },
  { id: "J-004", nodeId: "N04" },
  { id: "J-005", nodeId: "N05" },
  { id: "J-006", nodeId: "N06" },
  { id: "J-007", nodeId: "N07" },
  { id: "J-008", nodeId: "N08" },
  { id: "J-009", nodeId: "N09" },
  { id: "J-010", nodeId: "N10", warning: true },
  { id: "J-011", nodeId: "N11", warning: true },
  { id: "J-012", nodeId: "N12" },
];

const panels = [
  { id: "P-001" },
  { id: "P-002" },
  { id: "P-003" },
];

const allPartIds = [
  ...rods.map(([id]) => id),
  ...panels.map(({ id }) => id),
  ...joints.map(({ id }) => id),
];

function optimizedRackSnapshot(dimensions: FrameDimensions, deletedPartIds: string[]): EditorSnapshot {
  const optimized = createOptimizedRackTemplateState(dimensions, deletedPartIds);
  const deleted = new Set(deletedPartIds);
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    dimensions,
    background: "room",
    transforms: optimized.transforms,
    materials: Object.fromEntries(allPartIds.filter((id) => !deleted.has(id)).map((id) => [id, id.startsWith("P-") ? "acrylic" : "stainless"])),
    panelCutouts: optimized.panelCutouts,
    resolvedRiskIds: joints.filter(({ id, warning }) => warning && !deleted.has(id)).map(({ id }) => id),
    deletedIds: deletedPartIds,
    addedParts: [],
    userGroups: [],
    hiddenIds: [],
    lockedIds: [],
    isolatedIds: [],
    assemblyConnections: optimized.assemblyConnections,
  };
}

const rackTemplates: RackTemplateDefinition[] = [
  {
    id: "blank",
    name: { zh: "空白项目", en: "BLANK PROJECT" },
    description: { zh: "从空白画布开始，自由添加组件并搭建设计。", en: "Start with an empty canvas and build freely from the component library." },
    dimensions: { width: 900, height: 900, depth: 350 },
    deletedPartIds: [...allPartIds],
    previewImage: "/assets/template-previews/blank-empty-state.png",
  },
  {
    id: "three-tier",
    name: { zh: "三层开放式置物架", en: "THREE-TIER OPEN RACK" },
    description: { zh: "三层板四角穿轴；共享立柱、横杆承托与节点接触共同形成落地受力路径。", en: "Three corner-drilled shelves share four uprights with rail and node-surface support to ground." },
    dimensions: { width: 900, height: 900, depth: 350 },
    deletedPartIds: [],
    previewImage: "/assets/template-previews/three-tier.png",
    snapshot: optimizedRackSnapshot({ width: 900, height: 900, depth: 350 }, []),
  },
  {
    id: "two-tier",
    name: { zh: "双层开放式置物架", en: "TWO-TIER OPEN RACK" },
    description: { zh: "上下层板共用四根穿孔立柱，中部留空；每层保持横杆与节点双重支撑。", en: "Top and bottom shelves share four through-hole uprights with dual rail and node support." },
    dimensions: { width: 900, height: 720, depth: 350 },
    deletedPartIds: ["R-005", "R-006", "R-007", "R-008", "P-002", "J-005", "J-006", "J-007", "J-008"],
    previewImage: "/assets/template-previews/two-tier.png",
    snapshot: optimizedRackSnapshot(
      { width: 900, height: 720, depth: 350 },
      ["R-005", "R-006", "R-007", "R-008", "P-002", "J-005", "J-006", "J-007", "J-008"],
    ),
  },
  {
    id: "shaft-frame",
    name: { zh: "基础光轴框架", en: "BASIC SHAFT FRAME" },
    description: { zh: "共享立柱与三向节点组成完整落地骨架，预留后续层板打孔和表面支撑。", en: "Shared uprights and three-axis nodes form a grounded frame ready for drilled shelves." },
    dimensions: { width: 900, height: 900, depth: 350 },
    deletedPartIds: ["P-001", "P-002", "P-003"],
    previewImage: "/assets/template-previews/shaft-frame.png",
    snapshot: optimizedRackSnapshot({ width: 900, height: 900, depth: 350 }, ["P-001", "P-002", "P-003"]),
  },
];

const PROJECTS_STORAGE_KEY = "axisframe-projects-v1";
const CURRENT_PROJECT_STORAGE_KEY = "axisframe-current-project-id";
const TEMPLATES_STORAGE_KEY = "axisframe-templates-v1";

function readSavedProjects(): SavedProject[] {
  try {
    const value = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    const parsed = value ? JSON.parse(value) as SavedProject[] : [];
    let projects = Array.isArray(parsed)
      ? parsed.filter((project) => (project?.version === 1 || project?.version === PROJECT_SCHEMA_VERSION) && project.snapshot)
        .map((project) => ({ ...project, snapshot: migrateRetiredCrossClampSnapshot(project.snapshot) }))
      : [];
    if (!window.localStorage.getItem(PHOTO_RACK_PROJECT_SEED_KEY)) {
      const referenceProject = createSeededPhotoRackProject();
      if (referenceProject) {
        projects = [referenceProject, ...projects.filter(({ id }) => id !== PHOTO_RACK_PROJECT_ID)];
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      }
      window.localStorage.setItem(PHOTO_RACK_PROJECT_SEED_KEY, "1");
    }
    if (!window.localStorage.getItem(PEGBOARD_STAND_PROJECT_SEED_KEY)) {
      const pegboardProject = createSeededPegboardStandProject();
      if (pegboardProject) {
        projects = [pegboardProject, ...projects.filter(({ id }) => id !== PEGBOARD_STAND_PROJECT_ID)];
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      }
      window.localStorage.setItem(PEGBOARD_STAND_PROJECT_SEED_KEY, "1");
    }
    if (!window.localStorage.getItem(FURNITURE_PROJECTS_SEED_KEY)) {
      const furnitureProjects = createSeededFurnitureProjects();
      const furnitureProjectIds = new Set(furnitureProjects.map(({ id }) => id));
      projects = [...furnitureProjects, ...projects.filter(({ id }) => !furnitureProjectIds.has(id))];
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
      window.localStorage.setItem(FURNITURE_PROJECTS_SEED_KEY, "1");
    }
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return projects;
  } catch {
    return [];
  }
}

function readSavedTemplates(): SavedTemplate[] {
  try {
    const value = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value) as SavedTemplate[];
    const templates = Array.isArray(parsed)
      ? parsed.filter((template) => template?.version === 1 && template.snapshot)
        .map((template) => ({ ...template, snapshot: migrateRetiredCrossClampSnapshot(template.snapshot) }))
      : [];
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    return templates;
  } catch {
    return [];
  }
}

function savedTemplateDefinition(template: SavedTemplate): RackTemplateDefinition {
  const visiblePartCount = allPartIds.length + template.snapshot.addedParts.length - template.snapshot.deletedIds.length;
  return {
    id: template.id,
    name: { zh: template.name, en: template.name },
    description: {
      zh: `我的模板 · 保存于 ${new Date(template.updatedAt).toLocaleDateString("zh-CN")} · ${visiblePartCount} 个组件`,
      en: `MY TEMPLATE · SAVED ${new Date(template.updatedAt).toLocaleDateString("en-US")} · ${visiblePartCount} PARTS`,
    },
    dimensions: template.snapshot.dimensions,
    deletedPartIds: template.snapshot.deletedIds,
    snapshot: template.snapshot,
    custom: true,
    updatedAt: template.updatedAt,
  };
}

function sceneNodesForDimensions(dimensions: FrameDimensions): Record<string, Vec3Tuple> {
  const halfWidth = mmToScene(dimensions.width) / 2;
  const halfDepth = mmToScene(dimensions.depth) / 2;
  const levels = builtInLevelYs(dimensions);
  const result: Record<string, Vec3Tuple> = {};
  levels.forEach((y, levelIndex) => {
    const offset = levelIndex * 4 + 1;
    result[`N${String(offset).padStart(2, "0")}`] = [-halfWidth, y, -halfDepth];
    result[`N${String(offset + 1).padStart(2, "0")}`] = [halfWidth, y, -halfDepth];
    result[`N${String(offset + 2).padStart(2, "0")}`] = [halfWidth, y, halfDepth];
    result[`N${String(offset + 3).padStart(2, "0")}`] = [-halfWidth, y, halfDepth];
  });
  return result;
}

function getPartBasePosition(id: string, dimensions: FrameDimensions, addedParts: AddedPart[]): Vec3Tuple {
  const sceneHeight = mmToScene(dimensions.height);
  const sceneNodes = sceneNodesForDimensions(dimensions);
  const panelIndex = panels.findIndex((panel) => panel.id === id);
  if (panelIndex >= 0) return [0, builtInPanelYs(dimensions)[panelIndex], 0];
  const rod = rods.find(([rodId]) => rodId === id);
  if (rod) {
    const start = sceneNodes[rod[1]];
    const end = sceneNodes[rod[2]];
    return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
  }
  const joint = joints.find((candidate) => candidate.id === id);
  if (joint) return sceneNodes[joint.nodeId];
  const part = addedParts.find((candidate) => candidate.id === id);
  if (!part) return [0, sceneHeight / 2, 0];
  const index = addedParts.filter((candidate) => candidate.kind === part.kind).findIndex((candidate) => candidate.id === id);
  if (part.kind === "panel") return [0, sceneHeight / 2 + 0.48 + index * 0.32, 0];
  if (part.kind === "rod") return [0, sceneHeight / 2 + 0.55, index * 0.25];
  return [0, sceneHeight / 2 + 0.4 + index * 0.35, 0];
}

function getPartWorldPosition(id: string, dimensions: FrameDimensions, addedParts: AddedPart[], transforms: Record<string, PartTransform>): Vec3Tuple {
  return addVec3(getPartBasePosition(id, dimensions, addedParts), sceneOffset(getPartTransform(transforms, id)));
}

function transformAtWorldPoint(id: string, worldPoint: Vec3Tuple, dimensions: FrameDimensions, addedParts: AddedPart[], baseTransform: PartTransform): PartTransform {
  const basePosition = getPartBasePosition(id, dimensions, addedParts);
  return {
    ...baseTransform,
    x: sceneDeltaToFreePositionMm(worldPoint[0] - basePosition[0]),
    y: sceneDeltaToFreePositionMm(worldPoint[1] - basePosition[1]),
    z: sceneDeltaToFreePositionMm(worldPoint[2] - basePosition[2]),
  };
}

function buildPanelContactTargets({
  dimensions,
  addedParts,
  transforms,
  deletedIds = new Set<string>(),
  hiddenIds = new Set<string>(),
  isolatedIds = new Set<string>(),
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  deletedIds?: ReadonlySet<string>;
  hiddenIds?: ReadonlySet<string>;
  isolatedIds?: ReadonlySet<string>;
}): PanelContactTarget[] {
  const isVisible = (id: string) =>
    !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id));
  const targetFromTransform = (partId: string, transform: PartTransform): PanelContactTarget => ({
    partId,
    center: getPartWorldPosition(partId, dimensions, addedParts, transforms),
    size: [
      mmToScene(transform.sizeX) * Math.abs(transform.scaleX),
      mmToScene(transform.sizeY) * Math.abs(transform.scaleY),
      mmToScene(transform.sizeZ) * Math.abs(transform.scaleZ),
    ],
    rotation: [transform.rotX, transform.rotY, transform.rotZ],
  });
  const builtIn = panels
    .filter(({ id }) => isVisible(id))
    .map(({ id }) => targetFromTransform(id, transforms[id] ?? {
      ...getDefaultTransform(id),
      sizeX: Math.max(100, dimensions.width - 20),
      sizeZ: Math.max(100, dimensions.depth - 15),
    }));
  const added = addedParts
    .filter(({ id, kind }) => kind === "panel" && isVisible(id))
    .map(({ id }) => targetFromTransform(id, getPartTransform(transforms, id)));
  return [...builtIn, ...added];
}

function buildPanelHoleTargets({
  dimensions,
  addedParts,
  transforms,
  panelCutouts,
  deletedIds = new Set<string>(),
  hiddenIds = new Set<string>(),
  isolatedIds = new Set<string>(),
  onlyPartId,
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  panelCutouts: Record<string, PanelCutout[]>;
  deletedIds?: ReadonlySet<string>;
  hiddenIds?: ReadonlySet<string>;
  isolatedIds?: ReadonlySet<string>;
  onlyPartId?: string;
}): PanelHoleTarget[] {
  const isVisible = (id: string) =>
    (!onlyPartId || id === onlyPartId)
    && !deletedIds.has(id)
    && !hiddenIds.has(id)
    && (isolatedIds.size === 0 || isolatedIds.has(id));
  const targetsForPanel = (partId: string, transform: PartTransform, libraryPart?: LibraryPart) => {
    const widthMm = transform.sizeX;
    const lengthMm = transform.sizeZ;
    const instanceHoles = normalizePanelCutouts(panelCutouts[partId], {
      widthMm,
      lengthMm,
      thicknessMm: transform.sizeY,
    }).map((hole) => ({
      id: hole.id,
      xFromCenterMm: hole.xMm - widthMm / 2,
      zFromCenterMm: hole.zMm - lengthMm / 2,
      diameterMm: hole.diameterMm,
    }));
    const cornerHoles = libraryPart?.cornerHolePanelParameters
      ? [
          [-widthMm / 2 + libraryPart.cornerHolePanelParameters.holeInsetX, -lengthMm / 2 + libraryPart.cornerHolePanelParameters.holeInsetZ],
          [widthMm / 2 - libraryPart.cornerHolePanelParameters.holeInsetX, -lengthMm / 2 + libraryPart.cornerHolePanelParameters.holeInsetZ],
          [widthMm / 2 - libraryPart.cornerHolePanelParameters.holeInsetX, lengthMm / 2 - libraryPart.cornerHolePanelParameters.holeInsetZ],
          [-widthMm / 2 + libraryPart.cornerHolePanelParameters.holeInsetX, lengthMm / 2 - libraryPart.cornerHolePanelParameters.holeInsetZ],
        ].map(([xFromCenterMm, zFromCenterMm], index) => ({
          id: `CORNER-${index + 1}`,
          xFromCenterMm,
          zFromCenterMm,
          diameterMm: libraryPart.cornerHolePanelParameters!.holeDiameter,
        }))
      : [];
    const pegboardParameters = libraryPart?.pegboardParameters
      ? resolvePegboardParameters(widthMm, lengthMm, libraryPart.pegboardParameters)
      : null;
    const pegboardHoles = pegboardParameters
      ? calculatePegboardHoles(widthMm, lengthMm, pegboardParameters).map((hole, index) => ({
          id: `PEG-${index + 1}`,
          xFromCenterMm: hole.xMm,
          zFromCenterMm: hole.zMm,
          diameterMm: pegboardParameters.holeDiameter,
        }))
      : [];
    const rotation = new THREE.Euler(
      degToRad(transform.rotX),
      degToRad(transform.rotY),
      degToRad(transform.rotZ),
      "XYZ",
    );
    const panelCenter = new THREE.Vector3(...getPartWorldPosition(partId, dimensions, addedParts, transforms));
    const holeAxis = new THREE.Vector3(0, Math.sign(transform.scaleY || 1), 0).applyEuler(rotation).normalize();
    return [...instanceHoles, ...cornerHoles, ...pegboardHoles].map((hole) => {
      const localOffset = new THREE.Vector3(
        mmToScene(hole.xFromCenterMm) * transform.scaleX,
        0,
        mmToScene(hole.zFromCenterMm) * transform.scaleZ,
      ).applyEuler(rotation);
      return {
        panelId: partId,
        holeId: hole.id,
        center: panelCenter.clone().add(localOffset).toArray() as Vec3Tuple,
        axis: holeAxis.toArray() as Vec3Tuple,
        diameter: hole.diameterMm * Math.min(Math.abs(transform.scaleX), Math.abs(transform.scaleZ)),
      } satisfies PanelHoleTarget;
    });
  };
  const builtIn = panels
    .filter(({ id }) => isVisible(id))
    .flatMap(({ id }) => targetsForPanel(id, transforms[id] ?? {
      ...getDefaultTransform(id),
      sizeX: Math.max(100, dimensions.width - 20),
      sizeZ: Math.max(100, dimensions.depth - 15),
    }));
  const added = addedParts
    .filter(({ id, kind }) => kind === "panel" && isVisible(id))
    .flatMap((part) => targetsForPanel(part.id, getPartTransform(transforms, part.id), part.libraryPart));
  return [...builtIn, ...added];
}

function buildConnectorContactTargets({
  dimensions,
  addedParts,
  transforms,
  deletedIds = new Set<string>(),
  excludeId,
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  deletedIds?: ReadonlySet<string>;
  excludeId?: string;
}): ConnectorContactTarget[] {
  const connectorIds = [
    ...joints.map(({ id }) => id),
    ...addedParts.filter((part) => part.kind === "joint").map(({ id }) => id),
  ].filter((id) => id !== excludeId && !deletedIds.has(id));
  return connectorIds.map((partId) => {
    const transform = getPartTransform(transforms, partId);
    return {
      partId,
      center: getPartWorldPosition(partId, dimensions, addedParts, transforms),
      size: [
        mmToScene(transform.sizeX) * Math.abs(transform.scaleX),
        mmToScene(transform.sizeY) * Math.abs(transform.scaleY),
        mmToScene(transform.sizeZ) * Math.abs(transform.scaleZ),
      ],
      rotation: [transform.rotX, transform.rotY, transform.rotZ],
    };
  });
}

function constrainPartTransformToContactSurfaces({
  id,
  transform,
  dimensions,
  addedParts,
  transforms,
  deletedIds,
}: {
  id: string;
  transform: PartTransform;
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  deletedIds: ReadonlySet<string>;
}): PartTransform {
  const kind = addedParts.find((part) => part.id === id)?.kind
    ?? (id.startsWith("P-") ? "panel" : id.startsWith("R-") ? "rod" : "joint");
  if (kind === "rod") return transform;
  const mergedTransforms = { ...transforms, [id]: transform };
  if (kind === "panel") {
    let acceptedTransform = transform;
    const connectorIds = [
      ...joints.map(({ id: connectorId }) => connectorId),
      ...addedParts.filter((part) => part.kind === "joint").map(({ id: connectorId }) => connectorId),
    ].filter((connectorId) => !deletedIds.has(connectorId));
    for (const connectorId of connectorIds) {
      const currentTransforms = { ...mergedTransforms, [id]: acceptedTransform };
      const panelTarget = buildPanelContactTargets({
        dimensions,
        addedParts,
        transforms: currentTransforms,
        deletedIds,
      }).find((panel) => panel.partId === id);
      if (!panelTarget) continue;
      const connectorTransform = getPartTransform(currentTransforms, connectorId);
      const connectorPosition = getPartWorldPosition(connectorId, dimensions, addedParts, currentTransforms);
      const contact = snapConnectorToPanelSurface({
        position: connectorPosition,
        rotation: [connectorTransform.rotX, connectorTransform.rotY, connectorTransform.rotZ],
        size: [
          mmToScene(connectorTransform.sizeX) * Math.abs(connectorTransform.scaleX),
          mmToScene(connectorTransform.sizeY) * Math.abs(connectorTransform.scaleY),
          mmToScene(connectorTransform.sizeZ) * Math.abs(connectorTransform.scaleZ),
        ],
        panels: [panelTarget],
      });
      if (!contact) continue;
      const correctedPanelCenter = panelTarget.center.map(
        (value, axis) => value - (contact.position[axis] - connectorPosition[axis]),
      ) as Vec3Tuple;
      acceptedTransform = transformAtWorldPoint(id, correctedPanelCenter, dimensions, addedParts, acceptedTransform);
    }
    return acceptedTransform;
  }
  let acceptedTransform = transform;
  const contactSize: Vec3Tuple = [
    mmToScene(transform.sizeX) * Math.abs(transform.scaleX),
    mmToScene(transform.sizeY) * Math.abs(transform.scaleY),
    mmToScene(transform.sizeZ) * Math.abs(transform.scaleZ),
  ];
  const applyPanelContact = () => {
    const currentTransforms = { ...transforms, [id]: acceptedTransform };
    const contact = snapConnectorToPanelSurface({
      position: getPartWorldPosition(id, dimensions, addedParts, currentTransforms),
      rotation: [acceptedTransform.rotX, acceptedTransform.rotY, acceptedTransform.rotZ],
      size: contactSize,
      panels: buildPanelContactTargets({ dimensions, addedParts, transforms: currentTransforms, deletedIds }),
    });
    if (contact) acceptedTransform = transformAtWorldPoint(id, contact.position, dimensions, addedParts, acceptedTransform);
  };
  applyPanelContact();
  const connectorTransforms = { ...transforms, [id]: acceptedTransform };
  const connectorContact = snapConnectorToConnectorSurface({
    position: getPartWorldPosition(id, dimensions, addedParts, connectorTransforms),
    rotation: [acceptedTransform.rotX, acceptedTransform.rotY, acceptedTransform.rotZ],
    size: contactSize,
    connectors: buildConnectorContactTargets({
      dimensions,
      addedParts,
      transforms: connectorTransforms,
      deletedIds,
      excludeId: id,
    }),
  });
  if (connectorContact) {
    acceptedTransform = transformAtWorldPoint(id, connectorContact.position, dimensions, addedParts, acceptedTransform);
    applyPanelContact();
  }
  return acceptedTransform;
}

function buildVisibleShaftSegments({
  dimensions,
  addedParts,
  transforms,
  deletedIds,
  hiddenIds,
  isolatedIds,
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  deletedIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  isolatedIds: ReadonlySet<string>;
}): ShaftSegment[] {
  const sceneNodes = sceneNodesForDimensions(dimensions);
  const isVisible = (id: string) =>
    !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id));
  const rotate = (vector: THREE.Vector3, transform: PartTransform) => vector.applyEuler(new THREE.Euler(
    degToRad(transform.rotX),
    degToRad(transform.rotY),
    degToRad(transform.rotZ),
    "XYZ",
  ));
  const segmentFromEndpoints = (id: string, start: Vec3Tuple, end: Vec3Tuple, transform: PartTransform, diameter = transform.sizeY): ShaftSegment => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const center = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(...sceneOffset(transform)));
    const halfDirection = b.clone().sub(a).multiplyScalar(0.5 * Math.max(0.15, transform.sizeX / 100));
    rotate(halfDirection, transform);
    return {
      partId: id,
      start: center.clone().sub(halfDirection).toArray() as Vec3Tuple,
      end: center.clone().add(halfDirection).toArray() as Vec3Tuple,
      diameter,
    };
  };

  const result = rods
    .filter(([id]) => isVisible(id))
    .map(([id, startNode, endNode]) => segmentFromEndpoints(id, sceneNodes[startNode], sceneNodes[endNode], getPartTransform(transforms, id)));

  addedParts.filter(({ kind, libraryPart, id }) => kind === "rod" && !libraryPart && isVisible(id)).forEach((part) => {
    const basePosition = getPartBasePosition(part.id, dimensions, addedParts);
    result.push(segmentFromEndpoints(
      part.id,
      addVec3(basePosition, [-1.5, 0, 0]),
      addVec3(basePosition, [1.5, 0, 0]),
      getPartTransform(transforms, part.id),
    ));
  });

  addedParts.filter(({ kind, libraryPart, id }) => kind === "rod" && Boolean(libraryPart) && isVisible(id)).forEach((part) => {
    if (!part.libraryPart) return;
    const transform = getPartTransform(transforms, part.id);
    const parameters = resolveShaftInstanceParameters({
      baseDiameterMm: part.libraryPart.shaftParameters?.diameter ?? 10,
      baseLengthMm: part.libraryPart.shaftParameters?.length ?? part.libraryPart.dimensions.length,
      diameterMm: transform.sizeY,
      lengthScalePercent: transform.sizeX,
    });
    const center = new THREE.Vector3(...getPartWorldPosition(part.id, dimensions, addedParts, transforms));
    const sceneLength = mmToScene(parameters.lengthMm);
    const localStart = rotate(new THREE.Vector3(0, 0, -sceneLength / 2), transform);
    const localEnd = rotate(new THREE.Vector3(0, 0, sceneLength / 2), transform);
    result.push({
      partId: part.id,
      start: center.clone().add(localStart).toArray() as Vec3Tuple,
      end: center.clone().add(localEnd).toArray() as Vec3Tuple,
      diameter: parameters.diameterMm,
    });
  });
  return result;
}

function shaftSegmentAxis(segment: ShaftSegment): SmartAlignAxis {
  const differences = segment.end.map((value, index) => Math.abs(value - segment.start[index]));
  const largest = Math.max(...differences);
  return differences[0] === largest ? "x" : differences[1] === largest ? "y" : "z";
}

const metalMaterialSpecs: Record<
  MetalMaterial,
  { color: string; metalness: number; roughness: number }
> = {
  stainless: { color: "#aeb5b8", metalness: 0.78, roughness: 0.24 },
  matteBlack: { color: "#171717", metalness: 0.46, roughness: 0.62 },
  whiteMetal: { color: "#f1f1ee", metalness: 0.38, roughness: 0.3 },
};

const metalMaterialCatalogLabel: Record<MetalMaterial, string> = {
  stainless: "不锈钢",
  matteBlack: "黑色金属",
  whiteMetal: "白色金属",
};

function inferMetalMaterial(part: Pick<LibraryPart, "material">): MetalMaterial {
  return part.material.includes("黑")
    ? "matteBlack"
    : part.material.includes("白")
      ? "whiteMetal"
      : "stainless";
}

function applyInstanceMaterial(part: LibraryPart, material: PartMaterial): LibraryPart {
  return {
    ...part,
    material: part.kind === "panel"
      ? panelMaterialCatalogLabel[material as PanelMaterial]
      : metalMaterialCatalogLabel[material as MetalMaterial],
  };
}

function getPartMaterial(
  materials: Record<string, PartMaterial>,
  id: string,
): PartMaterial {
  return materials[id] ?? (id.startsWith("P-") ? "acrylic" : "stainless");
}

function createWoodTexture(material: Exclude<PanelMaterial, "acrylic">) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const palette =
    material === "oak"
      ? { base: "#b98b57", light: "#d0aa78", dark: "#79522f" }
      : { base: "#5a3524", light: "#80513a", dark: "#2f1a12" };
  context.fillStyle = palette.base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let line = 0; line < 34; line += 1) {
    const y = (line / 34) * canvas.height;
    context.beginPath();
    context.strokeStyle = line % 3 === 0 ? palette.dark : palette.light;
    context.globalAlpha = line % 3 === 0 ? 0.34 : 0.22;
    context.lineWidth = line % 4 === 0 ? 1.5 : 0.8;
    for (let x = 0; x <= canvas.width; x += 8) {
      const wave = Math.sin(x * 0.032 + line * 1.7) * (2 + (line % 4));
      if (x === 0) context.moveTo(x, y + wave);
      else context.lineTo(x, y + wave);
    }
    context.stroke();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createAcrylicLiquidGlassTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, "#f8ffff");
  base.addColorStop(0.38, "#d7f1f7");
  base.addColorStop(0.72, "#ffffff");
  base.addColorStop(1, "#b7dce8");
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let wave = 0; wave < 18; wave += 1) {
    const y = 24 + wave * 28;
    context.beginPath();
    context.strokeStyle = wave % 3 === 0 ? "rgba(255,255,255,0.58)" : "rgba(74,153,178,0.18)";
    context.lineWidth = wave % 3 === 0 ? 2.6 : 1.2;
    for (let x = -24; x <= canvas.width + 24; x += 10) {
      const offset =
        Math.sin(x * 0.022 + wave * 0.9) * 10 +
        Math.sin(x * 0.047 + wave * 1.6) * 3.5;
      if (x === -24) context.moveTo(x, y + offset);
      else context.lineTo(x, y + offset);
    }
    context.stroke();
  }

  const highlight = context.createRadialGradient(128, 96, 8, 128, 96, 230);
  highlight.addColorStop(0, "rgba(255,255,255,0.92)");
  highlight.addColorStop(0.24, "rgba(255,255,255,0.34)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = highlight;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let speck = 0; speck < 120; speck += 1) {
    const alpha = 0.05 + ((speck * 37) % 13) / 240;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.fillRect((speck * 97) % canvas.width, (speck * 53) % canvas.height, 1.2, 1.2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.7, 1.25);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

const defaultPart: PartInfo = {
  id: "J-010",
  kind: "joint",
  title: "EQUAL-BORE CROSS CLAMP",
  status: "PENDING REVIEW",
  componentId: "EQUAL-CROSS-10-10",
  sku: "EQUAL-CROSS-10-10",
  orientation: "ORTHOGONAL EQUAL BORE",
  compatibleRod: "Ø10 MM",
  centerOffset: "UNMEASURED",
  linkedRods: "R-004, R-009",
  fastener: "PER COMPONENT SPEC",
  rule:
    "VALID CONNECTION. CENTER OFFSET IS UNMEASURED AND WILL BE FLAGGED BEFORE EXPORT.",
  warning: true,
};

function labelFor(
  value: LocalizedText,
  lang: Lang,
): string {
  return typeof value === "string" ? value : value[lang];
}

function usageLabel(tag: ComponentUsageTag, lang: Lang) {
  return componentUsageLabels[tag][lang];
}

function usageSummary(usageTags: readonly ComponentUsageTag[] | undefined, kind: PartKind, lang: Lang) {
  return normalizeUsageTags(kind, usageTags).map((tag) => usageLabel(tag, lang)).join(" / ");
}

function getPartInfo(
  id: string,
  lang: Lang,
  resolvedRiskIds?: ReadonlySet<string>,
  addedParts?: AddedPart[],
): PartInfo {
  const libraryPart = addedParts?.find((part) => part.id === id)?.libraryPart;
  if (libraryPart) {
    return {
      id,
      kind: libraryPart.kind,
      title: libraryPart.name,
      status: lang === "zh" ? "就绪" : "READY",
      componentId: libraryPart.model,
      sku: libraryPart.model,
      orientation: libraryPart.connector,
      compatibleRod: libraryPart.compatibleRod,
      centerOffset: "N/A",
      linkedRods: lang === "zh" ? "待装配" : "UNASSIGNED",
      fastener: lang === "zh" ? "按组件规格" : "PER COMPONENT SPEC",
      rule: lang === "zh" ? "组件来自组件库，可直接用于设计。" : "COMPONENT COMES FROM THE LIBRARY AND IS READY TO USE.",
      warning: false,
    };
  }
  if (id.startsWith("R-")) {
    return {
      id,
      kind: "rod",
      title: lang === "zh" ? "光轴杆件" : "SHAFT ROD",
      status: lang === "zh" ? "就绪" : "READY",
      componentId: "SHAFT-10-1000",
      sku: "SHAFT-10-1000",
      orientation: lang === "zh" ? "轴向杆段" : "AXIAL SEGMENT",
      compatibleRod: "Ø10 MM",
      centerOffset: "N/A",
      linkedRods: id,
      fastener: lang === "zh" ? "无" : "NONE",
      rule:
        lang === "zh"
          ? "杆件长度在当前库存杆可用范围内。"
          : "ROD LENGTH IS WITHIN AVAILABLE STOCK RANGE.",
    };
  }

  if (id.startsWith("P-")) {
    return {
      id,
      kind: "panel",
      title: lang === "zh" ? "层板" : "SHELF PANEL",
      status: lang === "zh" ? "就绪" : "READY",
      componentId: "PANEL-PLY-12",
      sku: "PANEL-PLY-12",
      orientation: lang === "zh" ? "水平" : "HORIZONTAL",
      compatibleRod: lang === "zh" ? "由框架支撑" : "SUPPORTED BY FRAME",
      centerOffset: "N/A",
      linkedRods: "R-005, R-006, R-007, R-008",
      fastener: lang === "zh" ? "可选" : "OPTIONAL",
      rule: lang === "zh" ? "层板由四边框架支撑。" : "PANEL IS SUPPORTED ON FOUR SIDES.",
    };
  }

  const warning = (id === "J-010" || id === "J-011") && !resolvedRiskIds?.has(id);
  return {
    ...defaultPart,
    id,
    title: lang === "zh" ? "十字型连接件" : "SPLIT CROSS CONNECTOR",
    warning,
    status: warning
      ? lang === "zh"
        ? "待复核"
        : "PENDING REVIEW"
      : lang === "zh"
        ? "就绪"
        : "READY",
    orientation: lang === "zh" ? "双孔正交 / 分体夹紧" : "ORTHOGONAL SPLIT BORE",
    centerOffset: warning
      ? lang === "zh"
        ? "未实测"
        : "UNMEASURED"
      : lang === "zh"
        ? "已验证"
        : "VERIFIED",
    rule: warning
      ? lang === "zh"
        ? "连接合法。孔中心偏移尚未实测，导出前会提示。"
        : "VALID CONNECTION. CENTER OFFSET IS UNMEASURED AND WILL BE FLAGGED BEFORE EXPORT."
      : lang === "zh"
        ? "连接已自动吸附到拼接节点，正交方向和标准尺寸已恢复。"
        : "CONNECTION SNAPPED TO ITS NODE; ORTHOGONAL ORIENTATION AND STANDARD SIZE RESTORED.",
  };
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function AppNav({ lang, activePage, onNavigate, onOpenTemplates }: { lang: Lang; activePage: AppPage; onNavigate: (page: AppPage) => void; onOpenTemplates: () => void }) {
  return (
    <aside className="app-nav" aria-label="Primary navigation">
      <div className="brand-mark" title="AxisFrame">
        <img src="/assets/brand/axisframe-official-logo.png" alt="AxisFrame" />
      </div>
      <nav className="nav-list">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`nav-item ${item.id === activePage ? "active" : ""}`}
              key={labelFor(item.label, "en")}
              type="button"
              onClick={() => {
                if (item.id === "design" || item.id === "parts" || item.id === "projects" || item.id === "bom") onNavigate(item.id);
                if (item.id === "create") onOpenTemplates();
              }}
            >
              <Icon size={19} strokeWidth={1.8} />
              <span>{labelFor(item.label, lang)}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

const defaultParallelClampDefinition = createParallelClampDefinition(defaultParallelClampParameters);
const defaultEqualBoreCrossClampDefinition = createEqualBoreCrossClampDefinition(defaultEqualBoreCrossClampVariant.diameter);
const defaultEqualBoreTClampDefinition = createEqualBoreTClampDefinition(defaultEqualBoreTClampVariant.diameter);
const defaultRoundFixedBaseDefinition = createRoundFixedBaseDefinition(defaultRoundFixedBaseVariant.innerDiameter);
const defaultVerticalFixedBaseDefinition = createVerticalFixedBaseDefinition(defaultVerticalFixedBaseVariant.model);
const defaultShaftStopDefinition = createShaftStopDefinition(defaultShaftStopParameters);

const rawComponentGeometries = {
  singleBoreFixedClamp: { primitives: [{ shape: "box", size: [1.7, 2.1, 1.25], position: [0, 0, 0] }, { shape: "cylinder", size: [0.72, 1.42, 0.72], position: [0, -0.2, 0], rotation: [90, 0, 0], appearance: "cutout" }, { shape: "box", size: [0.16, 1.08, 1.3], position: [0, 0.74, 0], appearance: "cutout" }, { shape: "cylinder", size: [0.25, 0.5, 0.25], position: [-0.43, 1.12, 0] }, { shape: "cylinder", size: [0.25, 0.5, 0.25], position: [0.43, 1.12, 0] }, { shape: "cylinder", size: [0.2, 1.78, 0.2], position: [0, 0.53, 0.35], rotation: [0, 0, 90], appearance: "cutout" }, { shape: "cylinder", size: [0.2, 1.78, 0.2], position: [0, -0.68, 0.35], rotation: [0, 0, 90], appearance: "cutout" }], ports: [{ id: "SHAFT", axis: "z", position: [0, -0.2, 0], diameter: 10 }, { id: "MOUNT-TOP", axis: "x", position: [0, 0.53, 0.35], diameter: 5 }, { id: "MOUNT-BOTTOM", axis: "x", position: [0, -0.68, 0.35], diameter: 5 }, { id: "CLAMP-L", axis: "y", position: [-0.43, 1.12, 0], diameter: 4 }, { id: "CLAMP-R", axis: "y", position: [0.43, 1.12, 0], diameter: 4 }] },
  parallelClamp: { primitives: defaultParallelClampDefinition.primitives, ports: defaultParallelClampDefinition.ports },
  equalBoreCrossClamp: { primitives: defaultEqualBoreCrossClampDefinition.primitives, ports: defaultEqualBoreCrossClampDefinition.ports },
  equalBoreTClamp: { primitives: defaultEqualBoreTClampDefinition.primitives, ports: defaultEqualBoreTClampDefinition.ports },
  rod: { primitives: [{ shape: "cylinder", size: [0.26, 3.5, 0.26], position: [0, 0, 0], rotation: [90, 0, 0] }], ports: [{ id: "START", axis: "z", position: [0, 0, -1.75], diameter: 10 }, { id: "END", axis: "z", position: [0, 0, 1.75], diameter: 10 }] },
  panel: { primitives: [{ shape: "box", size: [3.2, 0.16, 1.7], position: [0, 0, 0] }], ports: [{ id: "SUPPORT", axis: "y", position: [0, -0.08, 0], diameter: 0 }] },
  pegboard: { primitives: [{ shape: "box", size: [3.2, 0.16, 2.4], position: [0, 0, 0] }], ports: [{ id: "MOUNT-LB", axis: "y", position: [-1.52, -0.08, -0.83], diameter: 5 }, { id: "MOUNT-RB", axis: "y", position: [1.52, -0.08, -0.83], diameter: 5 }, { id: "MOUNT-LT", axis: "y", position: [-1.52, -0.08, 0.83], diameter: 5 }, { id: "MOUNT-RT", axis: "y", position: [1.52, -0.08, 0.83], diameter: 5 }] },
  base: { primitives: defaultRoundFixedBaseDefinition.primitives, ports: defaultRoundFixedBaseDefinition.ports },
  verticalFixedBase: { primitives: defaultVerticalFixedBaseDefinition.primitives, ports: defaultVerticalFixedBaseDefinition.ports },
  shaftSupport: { primitives: [{ shape: "box", size: [1.8, 0.28, 1.25], position: [0, -0.62, 0] }, { shape: "box", size: [1.05, 1.25, 0.78], position: [0, 0, 0] }, { shape: "cylinder", size: [0.42, 1.4, 0.42], position: [0, 0.12, 0], rotation: [90, 0, 0] }], ports: [{ id: "SHAFT", axis: "z", position: [0, 0.12, 0], diameter: 10 }, { id: "MOUNT", axis: "y", position: [0, -0.76, 0], diameter: 0 }] },
  linearBushing: { primitives: [{ shape: "cylinder", size: [0.9, 1.8, 0.9], position: [0, 0, 0], rotation: [90, 0, 0] }, { shape: "cylinder", size: [0.38, 2, 0.38], position: [0, 0, 0], rotation: [90, 0, 0] }], ports: [{ id: "SLIDE", axis: "z", position: [0, 0, 0], diameter: 10 }] },
  shaftCollar: { primitives: [{ shape: "cylinder", size: [1.5, 0.5, 1.5], position: [0, 0, 0], rotation: [90, 0, 0] }, { shape: "box", size: [0.48, 0.42, 0.34], position: [0, 0.58, 0] }], ports: [{ id: "SHAFT", axis: "z", position: [0, 0, 0], diameter: 10 }] },
  fixedRing: { primitives: defaultShaftStopDefinition.primitives, ports: defaultShaftStopDefinition.ports },
} satisfies Record<string, RawComponentGeometry>;

function upgradeComponentPort(geometryId: string, port: RawComponentGeometry["ports"][number]): ComponentPort {
  const id = port.id.toUpperCase();
  const shaftInterface = id.startsWith("P") || id.includes("SHAFT") || id.includes("SLIDE") || id === "BORE";
  const kind: PortKind = shaftInterface
    ? "shaft-bore"
    : id === "START" || id === "END"
      ? "shaft-end"
      : id.includes("MOUNT") || id.includes("FLANGE") || id.includes("TABLE")
        ? "mount"
        : id.includes("CLAMP") || id.includes("LOCK")
          ? "fastener"
          : "support";
  const behavior: PortBehavior = id.includes("SLIDE") || geometryId === "linearBushing"
    ? "slide"
    : ["shaftCollar", "fixedRing"].includes(geometryId)
      ? "stop"
      : "fixed";
  return {
    ...port,
    kind,
    behavior,
    toleranceMm: kind === "shaft-bore" ? 0.25 : 0.1,
    capacity: 1,
  };
}

function createParallelClampComponentGeometry(parameters: ParallelClampParameters): ComponentGeometry {
  const definition = createParallelClampDefinition(parameters);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("parallelClamp", port)),
  };
}

function createEqualBoreCrossClampComponentGeometry(diameter: number): ComponentGeometry {
  const definition = createEqualBoreCrossClampDefinition(diameter);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("equalBoreCrossClamp", port)),
  };
}

function createEqualBoreTClampComponentGeometry(diameter: number): ComponentGeometry {
  const definition = createEqualBoreTClampDefinition(diameter);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("equalBoreTClamp", port)),
  };
}

function createRoundFixedBaseComponentGeometry(innerDiameter: number): ComponentGeometry {
  const definition = createRoundFixedBaseDefinition(innerDiameter);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("base", port)),
  };
}

function createVerticalFixedBaseComponentGeometry(modelOrShaftDiameter: string | number): ComponentGeometry {
  const definition = createVerticalFixedBaseDefinition(modelOrShaftDiameter);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("verticalFixedBase", port)),
  };
}

function createShaftStopComponentGeometry(parameters: Pick<ShaftStopParameters, "innerDiameter" | "thickness">): ComponentGeometry {
  const definition = createShaftStopDefinition(parameters);
  return {
    primitives: definition.primitives,
    ports: definition.ports.map((port) => upgradeComponentPort("fixedRing", port)),
  };
}

function parameterizedEqualBoreCrossClampPart(part: LibraryPart, diameter: number, lang: Lang): LibraryPart {
  const variant = resolveEqualBoreCrossClampVariant(diameter);
  return {
    ...part,
    model: equalBoreCrossClampModel(variant.diameter),
    dimensions: equalBoreCrossClampDimensions(variant),
    equalBoreCrossClampDiameter: variant.diameter,
    variantCount: equalBoreCrossClampVariants.length,
    compatibleRod: `Ø${variant.diameter} mm × Ø${variant.diameter} mm`,
    connector: lang === "zh"
      ? `正交同径双孔 / 孔距 ${variant.holeCenterDistance} mm`
      : `PERPENDICULAR EQUAL BORES / PITCH ${variant.holeCenterDistance} MM`,
    geometry: createEqualBoreCrossClampComponentGeometry(variant.diameter),
  };
}

function parameterizedEqualBoreTClampPart(part: LibraryPart, diameter: number, lang: Lang): LibraryPart {
  const variant = resolveEqualBoreTClampVariant(diameter);
  return {
    ...part,
    model: equalBoreTClampModel(variant.diameter),
    dimensions: equalBoreTClampDimensions(variant),
    equalBoreTClampDiameter: variant.diameter,
    variantCount: equalBoreTClampVariants.length,
    compatibleRod: `Ø${variant.diameter} mm × Ø${variant.diameter} mm`,
    connector: lang === "zh"
      ? `T 型正交同径双孔 / E ${variant.e} mm / F ${variant.f} mm / ${variant.lockingBolt}`
      : `EQUAL-BORE T JOINT / E ${variant.e} MM / F ${variant.f} MM / ${variant.lockingBolt}`,
    geometry: createEqualBoreTClampComponentGeometry(variant.diameter),
  };
}

function parameterizedRoundFixedBasePart(part: LibraryPart, innerDiameter: number, lang: Lang): LibraryPart {
  const variant = resolveRoundFixedBaseVariant(innerDiameter);
  return {
    ...part,
    model: roundFixedBaseModel(variant.innerDiameter),
    dimensions: roundFixedBaseDimensions(variant),
    roundFixedBaseInnerDiameter: variant.innerDiameter,
    variantCount: roundFixedBaseVariants.length,
    compatibleRod: `Ø${variant.innerDiameter} mm`,
    connector: lang === "zh"
      ? `垂直单孔 / 4 × Ø${variant.mountingHoleDiameter} / PCD ${variant.mountingHolePcd} mm`
      : `VERTICAL BORE / 4 × Ø${variant.mountingHoleDiameter} / PCD ${variant.mountingHolePcd} MM`,
    geometry: createRoundFixedBaseComponentGeometry(variant.innerDiameter),
  };
}

function parameterizedVerticalFixedBasePart(part: LibraryPart, modelOrShaftDiameter: string | number, lang: Lang): LibraryPart {
  const variant = resolveVerticalFixedBaseVariant(modelOrShaftDiameter);
  return {
    ...part,
    model: variant.model,
    dimensions: verticalFixedBaseDimensions(variant),
    verticalFixedBaseShaftDiameter: variant.shaftDiameter,
    variantCount: verticalFixedBaseVariants.length,
    compatibleRod: `Ø${variant.shaftDiameter} mm`,
    connector: lang === "zh"
      ? `夹紧支撑 / 2 × Ø${variant.s} 底面安装 / 孔距 ${variant.b} mm`
      : `CLAMP SUPPORT / 2 × Ø${variant.s} BASE MOUNT / PITCH ${variant.b} MM`,
    geometry: createVerticalFixedBaseComponentGeometry(variant.model),
    modelAssetUrl: undefined,
    modelAssetName: undefined,
    modelRotation: undefined,
  };
}

const componentGeometries = Object.fromEntries(
  Object.entries(rawComponentGeometries).map(([id, geometry]) => [
    id,
    { ...geometry, ports: geometry.ports.map((port) => upgradeComponentPort(id, port)) },
  ]),
) as Record<keyof typeof rawComponentGeometries, ComponentGeometry>;

const initialLibraryParts: LibraryPart[] = [
  { id: "lib-single-bore-fixed-clamp-10", model: "SINGLE-BORE-CLAMP-10", name: "单孔固定夹", kind: "joint", status: "review", material: "不锈钢", dimensions: { width: 30, length: 20, height: 40 }, compatibleRod: "Ø10 mm（图片推测）", connector: "单孔夹紧 / 侧面安装", usageTags: ["panel-support", "wall-mount"], source: "manual", updatedAt: "2026-07-13", geometry: componentGeometries.singleBoreFixedClamp, referenceLabel: "用户提供实物参考图（尺寸待复核）", referenceUrl: "/assets/images/single-bore-fixed-clamp-reference.png" },
  { id: "lib-para-10", model: parallelClampModel(defaultParallelClampParameters), name: "平行夹", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 45, length: 20, height: 20 }, parallelClampParameters: defaultParallelClampParameters, variantCount: parallelClampVariants.length, compatibleRod: "Ø10 mm × Ø10 mm", connector: "同径平行双孔 / 中心距 15 mm / M5", usageTags: ["parallel-connection", "frame-structure"], source: "three-view", updatedAt: "2026-07-22", geometry: componentGeometries.parallelClamp, referenceLabel: "用户提供结构图及 16 个库存尺寸组合", referenceUrl: "/assets/references/parallel-clamp/size-table.png" },
  { id: "lib-equal-cross-10", model: equalBoreCrossClampModel(defaultEqualBoreCrossClampVariant.diameter), name: "同径双孔十字夹", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 45, length: 20, height: 20 }, equalBoreCrossClampDiameter: defaultEqualBoreCrossClampVariant.diameter, variantCount: equalBoreCrossClampVariants.length, compatibleRod: `Ø${defaultEqualBoreCrossClampVariant.diameter} mm × Ø${defaultEqualBoreCrossClampVariant.diameter} mm`, connector: `正交同径双孔 / 孔距 ${defaultEqualBoreCrossClampVariant.holeCenterDistance} mm`, usageTags: ["corner-connection", "frame-structure"], source: "manual", updatedAt: "2026-07-22", geometry: componentGeometries.equalBoreCrossClamp, referenceLabel: "用户提供顶视图、侧视图及 11 个型号尺寸表", referenceUrl: "/assets/references/equal-bore-cross-clamp-views.png" },
  { id: "lib-equal-t-10", model: equalBoreTClampModel(defaultEqualBoreTClampVariant.diameter), name: "同径 T 型夹", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 45, length: 20, height: 20 }, equalBoreTClampDiameter: defaultEqualBoreTClampVariant.diameter, variantCount: equalBoreTClampVariants.length, compatibleRod: `Ø${defaultEqualBoreTClampVariant.diameter} mm × Ø${defaultEqualBoreTClampVariant.diameter} mm`, connector: `T 型正交同径双孔 / E ${defaultEqualBoreTClampVariant.e} mm / F ${defaultEqualBoreTClampVariant.f} mm / ${defaultEqualBoreTClampVariant.lockingBolt}`, usageTags: ["corner-connection", "frame-structure"], source: "three-view", updatedAt: "2026-07-22", geometry: componentGeometries.equalBoreTClamp, referenceLabel: "用户提供结构图及 4 个库存尺寸组合", referenceUrl: "/assets/references/equal-bore-t-clamp/size-table.png" },
  { id: "lib-shaft-10", model: "SHAFT-10-1000", name: "精密光轴", kind: "rod", status: "ready", material: "不锈钢", dimensions: { width: 10, length: 1000, height: 10 }, shaftParameters: { diameter: 10, length: 1000 }, variantCount: 14, compatibleRod: "Ø10 mm", connector: "轴向", usageTags: ["frame-structure"], source: "preset", updatedAt: "2026-07-14", geometry: componentGeometries.rod },
  { id: "lib-panel", model: "PANEL-001", name: "层板", kind: "panel", status: "ready", material: "可切换：原木纹 / 胡桃木纹 / 透明亚克力", defaultPanelMaterial: "acrylic", dimensions: { width: 880, length: 335, height: 12 }, compatibleRod: "框架支撑", connector: "四边承托", usageTags: ["load-bearing-surface"], source: "preset", updatedAt: "2026-07-16", geometry: componentGeometries.panel },
  { id: "lib-pegboard-600", model: "PEGBOARD-600-450-P25", name: "孔阵洞洞板", kind: "panel", status: "ready", material: "原木色纤维板", defaultPanelMaterial: "oak", dimensions: { width: 600, length: 450, height: 12 }, pegboardParameters: defaultPegboardParameters, compatibleRod: "四点固定夹安装", connector: "4 × M5 安装位 / 25 mm 孔距", usageTags: ["pegboard-fixture", "wall-mount"], source: "preset", updatedAt: "2026-07-19", geometry: componentGeometries.pegboard },
  { id: "lib-base-10", model: roundFixedBaseModel(defaultRoundFixedBaseVariant.innerDiameter), name: "圆形固定底座", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 49, length: 49, height: 20 }, roundFixedBaseInnerDiameter: defaultRoundFixedBaseVariant.innerDiameter, variantCount: roundFixedBaseVariants.length, compatibleRod: `Ø${defaultRoundFixedBaseVariant.innerDiameter} mm`, connector: `垂直单孔 / 4 × Ø${defaultRoundFixedBaseVariant.mountingHoleDiameter} / PCD ${defaultRoundFixedBaseVariant.mountingHolePcd} mm`, usageTags: ["base-foot", "frame-structure"], source: "three-view", updatedAt: "2026-07-22", geometry: componentGeometries.base, referenceLabel: "用户提供 8 / 10 / 12 mm 三组尺寸图", referenceUrl: "/assets/references/round-fixed-base/inner-10.png" },
  { id: "lib-sk10", model: defaultVerticalFixedBaseVariant.model, name: "立式固定座", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 42, length: 14, height: 32.8 }, verticalFixedBaseShaftDiameter: defaultVerticalFixedBaseVariant.shaftDiameter, variantCount: verticalFixedBaseVariants.length, compatibleRod: `Ø${defaultVerticalFixedBaseVariant.shaftDiameter} mm`, connector: `夹紧支撑 / 2 × Ø${defaultVerticalFixedBaseVariant.s} 底面安装 / 孔距 ${defaultVerticalFixedBaseVariant.b} mm`, usageTags: ["panel-support", "base-foot"], source: "three-view", updatedAt: "2026-07-22", geometry: componentGeometries.verticalFixedBase, referenceLabel: "用户提供结构图及 SK8–SK16 五组尺寸表", referenceUrl: "/assets/references/vertical-fixed-base/size-table.png" },
  { id: "lib-shf10", model: "SHF10", name: "法兰式光轴支座", kind: "joint", status: "review", material: "不锈钢", dimensions: { width: 43, length: 10, height: 24 }, compatibleRod: "Ø10 mm", connector: "夹紧支撑 / 法兰安装", usageTags: ["wall-mount", "panel-support"], source: "manual", updatedAt: "2026-07-12", geometry: componentGeometries.shaftSupport, referenceLabel: "Tuli SHF10 STEP", referenceUrl: "https://www.tuli-shop.com/linear-shaft-support-shf-10", modelAssetUrl: "/assets/components/shaft-supports/SHF10/SHF10.glb", modelAssetName: "SHF10.step" },
  { id: "lib-lm10", model: "LM10", name: "直筒型直线轴承", kind: "joint", status: "review", material: "不锈钢", dimensions: { width: 19, length: 29, height: 19 }, compatibleRod: "Ø10 mm", connector: "轴向滑动", usageTags: ["linear-motion"], source: "manual", updatedAt: "2026-07-12", geometry: componentGeometries.linearBushing, referenceLabel: "THK Linear Bushing LM", referenceUrl: "https://www.thk.com/eu/en/products/other_linear_motion_guides/linear_bushing/flange_less_type/lm_aj_op/" },
  { id: "lib-collar10", model: "NSCSS-10-10-S", name: "分体式轴环", kind: "joint", status: "review", material: "不锈钢", dimensions: { width: 30, length: 10, height: 30 }, compatibleRod: "Ø10 mm", connector: "轴向限位 / 分体夹紧", usageTags: ["axial-stop"], source: "manual", updatedAt: "2026-07-12", geometry: componentGeometries.shaftCollar, referenceLabel: "NBK Split-type Set Collar", referenceUrl: "https://www.nbk1560.com/en-US/products/machine_element/setcollar/NSCSS-S/NSCSS-10-10-S/" },
  { id: "lib-fixed-ring-10", model: shaftStopModel(defaultShaftStopParameters), name: "限位器", kind: "joint", status: "ready", material: "不锈钢", dimensions: { width: 30, length: 30, height: 10 }, parameters: defaultShaftStopParameters, variantCount: shaftStopVariants.length, compatibleRod: "Ø10 mm", connector: "轴向限位 / 开口锁紧 / M4", usageTags: ["axial-stop"], source: "three-view", updatedAt: "2026-07-22", geometry: componentGeometries.fixedRing, referenceLabel: "用户提供结构图及 18 个库存尺寸组合", referenceUrl: "/assets/references/shaft-stop/size-table.png" },
];

const defaultCrossConnectorPart = initialLibraryParts.find(({ id }) => id === "lib-equal-cross-10")!;

function migrateRetiredCrossClampSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const retiredIds = new Set(snapshot.addedParts
    .filter(({ libraryPart }) =>
      libraryPart?.id === "lib-cross-10"
      || libraryPart?.model === "CROSS-10-10-M1"
      || libraryPart?.id === "lib-cross-split-10"
      || libraryPart?.model === "CROSS-SPLIT-10-10")
    .map(({ id }) => id));
  const retiredImportedModelIds = new Set(["lib-kba10uu", "lib-lmk10"]);
  const genericJointIds = snapshot.addedParts.filter(({ kind, libraryPart }) => kind === "joint" && !libraryPart).map(({ id }) => id);
  const replacedIds = new Set([...joints.map(({ id }) => id), ...retiredIds, ...genericJointIds]);
  const addedParts = snapshot.addedParts.map((part) => {
    if (retiredIds.has(part.id)) return { ...part, libraryPart: defaultCrossConnectorPart };
    if (!part.libraryPart || !retiredImportedModelIds.has(part.libraryPart.id)) return part;
    return {
      ...part,
      libraryPart: {
        ...part.libraryPart,
        modelAssetUrl: undefined,
        modelAssetName: undefined,
        modelRotation: undefined,
      },
    };
  });
  const transforms = { ...snapshot.transforms };
  replacedIds.forEach((id) => {
    const transform = transforms[id];
    if (!transform || !(
      (transform.sizeX === 34 && transform.sizeY === 34 && transform.sizeZ === 34)
      || (transform.sizeX === 50 && transform.sizeY === 20 && transform.sizeZ === 20)
    )) return;
    transforms[id] = { ...transform, sizeX: 45, sizeY: 20, sizeZ: 20 };
  });
  return {
    ...snapshot,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    transforms,
    addedParts,
    assemblyConnections: (snapshot.assemblyConnections ?? []).filter(({ connectorId, portId }) =>
      !replacedIds.has(connectorId) || portId.startsWith("TEMPLATE-"),
    ),
  };
}

function createSeededPhotoRackProject(): SavedProject | null {
  const shaft = initialLibraryParts.find(({ id }) => id === "lib-shaft-10");
  const panel = initialLibraryParts.find(({ id }) => id === "lib-panel");
  const openRingClamp = initialLibraryParts.find(({ id }) => id === "lib-fixed-ring-10");
  const crossConnector = initialLibraryParts.find(({ id }) => id === "lib-equal-cross-10");
  if (!shaft || !panel || !openRingClamp || !crossConnector) return null;
  return createPhotoCoffeeRackProject({ shaft, panel, openRingClamp, crossConnector }) as SavedProject;
}

function createSeededPegboardStandProject(): SavedProject | null {
  const shaft = initialLibraryParts.find(({ id }) => id === "lib-shaft-10");
  const pegboard = initialLibraryParts.find(({ id }) => id === "lib-pegboard-600");
  const crossConnector = initialLibraryParts.find(({ id }) => id === "lib-equal-cross-10");
  const panelClamp = initialLibraryParts.find(({ id }) => id === "lib-single-bore-fixed-clamp-10");
  if (!shaft || !pegboard || !crossConnector || !panelClamp) return null;
  return createStablePegboardStandProject({ shaft, pegboard, crossConnector, panelClamp }) as SavedProject;
}

function createSeededFurnitureProjects(): SavedProject[] {
  const shaft = initialLibraryParts.find(({ id }) => id === "lib-shaft-10");
  const panel = initialLibraryParts.find(({ id }) => id === "lib-panel");
  const crossConnector = initialLibraryParts.find(({ id }) => id === "lib-equal-cross-10");
  const panelSupport = initialLibraryParts.find(({ id }) => id === "lib-sk10");
  if (!shaft || !panel || !crossConnector || !panelSupport) return [];
  const proceduralPanelSupport = { ...panelSupport, modelAssetUrl: undefined, modelAssetName: undefined };
  return createGravityValidatedFurnitureProjects({
    shaft,
    panel,
    crossConnector,
    panelSupport: proceduralPanelSupport,
  }) as SavedProject[];
}

function AnnularGeometry({ innerDiameter, outerDiameter, thickness }: { innerDiameter: number; outerDiameter: number; thickness: number }) {
  const geometry = useMemo(() => {
    const scale = 2.5 / Math.max(outerDiameter, 0.1);
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outerDiameter * scale / 2, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, Math.min(innerDiameter, outerDiameter - 0.1) * scale / 2, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const depth = Math.max(thickness * scale, 0.08);
    const next = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 64 });
    next.translate(0, 0, -depth / 2);
    next.rotateX(Math.PI / 2);
    next.computeVertexNormals();
    return next;
  }, [innerDiameter, outerDiameter, thickness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function PerforatedPanelGeometry({ widthMm, lengthMm, parameters }: { widthMm: number; lengthMm: number; parameters: PegboardParameters }) {
  const geometry = useMemo(() => {
    const rawWidth = 3.2;
    const rawLength = 2.4;
    const rawThickness = 0.16;
    const shape = new THREE.Shape();
    shape.moveTo(-rawWidth / 2, -rawLength / 2);
    shape.lineTo(rawWidth / 2, -rawLength / 2);
    shape.lineTo(rawWidth / 2, rawLength / 2);
    shape.lineTo(-rawWidth / 2, rawLength / 2);
    shape.closePath();
    const radiusX = parameters.holeDiameter / 2 / Math.max(widthMm, 1) * rawWidth;
    const radiusZ = parameters.holeDiameter / 2 / Math.max(lengthMm, 1) * rawLength;
    calculatePegboardHoles(widthMm, lengthMm, parameters).forEach(({ xMm, zMm }) => {
      const hole = new THREE.Path();
      hole.absellipse(
        xMm / Math.max(widthMm, 1) * rawWidth,
        zMm / Math.max(lengthMm, 1) * rawLength,
        radiusX,
        radiusZ,
        0,
        Math.PI * 2,
        true,
        0,
      );
      shape.holes.push(hole);
    });
    const next = new THREE.ExtrudeGeometry(shape, {
      depth: rawThickness,
      bevelEnabled: false,
      curveSegments: 10,
    });
    next.translate(0, 0, -rawThickness / 2);
    next.rotateX(Math.PI / 2);
    next.computeVertexNormals();
    return next;
  }, [lengthMm, parameters, widthMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function CornerHolePanelGeometry({
  widthMm,
  lengthMm,
  parameters,
}: {
  widthMm: number;
  lengthMm: number;
  parameters: NonNullable<LibraryPart["cornerHolePanelParameters"]>;
}) {
  const geometry = useMemo(() => {
    const rawWidth = 3.2;
    const rawLength = 1.7;
    const rawThickness = 0.16;
    const radius = Math.min(
      parameters.cornerRadius / Math.max(widthMm, 1) * rawWidth,
      parameters.cornerRadius / Math.max(lengthMm, 1) * rawLength,
      rawWidth / 2,
      rawLength / 2,
    );
    const halfWidth = rawWidth / 2;
    const halfLength = rawLength / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth + radius, -halfLength);
    shape.lineTo(halfWidth - radius, -halfLength);
    shape.quadraticCurveTo(halfWidth, -halfLength, halfWidth, -halfLength + radius);
    shape.lineTo(halfWidth, halfLength - radius);
    shape.quadraticCurveTo(halfWidth, halfLength, halfWidth - radius, halfLength);
    shape.lineTo(-halfWidth + radius, halfLength);
    shape.quadraticCurveTo(-halfWidth, halfLength, -halfWidth, halfLength - radius);
    shape.lineTo(-halfWidth, -halfLength + radius);
    shape.quadraticCurveTo(-halfWidth, -halfLength, -halfWidth + radius, -halfLength);
    shape.closePath();

    const holeRadiusX = parameters.holeDiameter / 2 / Math.max(widthMm, 1) * rawWidth;
    const holeRadiusZ = parameters.holeDiameter / 2 / Math.max(lengthMm, 1) * rawLength;
    const holeX = halfWidth - parameters.holeInsetX / Math.max(widthMm, 1) * rawWidth;
    const holeZ = halfLength - parameters.holeInsetZ / Math.max(lengthMm, 1) * rawLength;
    [
      [-holeX, -holeZ],
      [holeX, -holeZ],
      [holeX, holeZ],
      [-holeX, holeZ],
    ].forEach(([x, z]) => {
      const hole = new THREE.Path();
      hole.absellipse(x, z, holeRadiusX, holeRadiusZ, 0, Math.PI * 2, true, 0);
      shape.holes.push(hole);
    });

    const next = new THREE.ExtrudeGeometry(shape, {
      depth: rawThickness,
      bevelEnabled: false,
      curveSegments: 24,
    });
    next.translate(0, 0, -rawThickness / 2);
    next.rotateX(Math.PI / 2);
    next.computeVertexNormals();
    return next;
  }, [lengthMm, parameters, widthMm]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function ComponentPortMarkers({
  ports,
  showLabels = false,
  unitsPerMm = mmToScene(1),
}: {
  ports: ComponentPort[];
  showLabels?: boolean;
  unitsPerMm?: number;
}) {
  const shaftPorts = ports.filter(isShaftAssemblyPort);
  return (
    <>
      {shaftPorts.map((port) => {
        const direction: Vec3Tuple = port.axis === "x" ? [1, 0, 0] : port.axis === "y" ? [0, 1, 0] : [0, 0, 1];
        const holeRadius = Math.max(port.diameter * unitsPerMm / 2, unitsPerMm * 0.5);
        const ringStrokeRadius = Math.max(holeRadius * 0.06, unitsPerMm * 0.12);
        const ringOutlineRadius = ringStrokeRadius * 1.45;
        const ringRadius = Math.max(holeRadius - ringStrokeRadius, ringStrokeRadius);
        const ringOutlineCenterRadius = Math.max(holeRadius - ringOutlineRadius, ringOutlineRadius);
        const axisHalfLength = holeRadius * 1.35;
        const lineStart = direction.map((value) => -value * axisHalfLength) as Vec3Tuple;
        const lineEnd = direction.map((value) => value * axisHalfLength) as Vec3Tuple;
        const torusRotation: Vec3Tuple = port.axis === "x" ? [0, Math.PI / 2, 0] : port.axis === "y" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
        const labelDistance = holeRadius * 2.4;
        const labelOffset: Vec3Tuple = port.axis === "x"
          ? [labelDistance, labelDistance * 0.6, 0]
          : port.axis === "y"
            ? [0, labelDistance, 0]
            : [-labelDistance, labelDistance * 0.6, 0];
        return (
          <group key={port.id} position={port.position}>
            <mesh rotation={torusRotation} renderOrder={30}>
              <torusGeometry args={[ringOutlineCenterRadius, ringOutlineRadius, 10, 36]} />
              <meshBasicMaterial color="#141413" transparent opacity={0.72} depthTest={false} depthWrite={false} />
            </mesh>
            <mesh rotation={torusRotation} renderOrder={31}>
              <torusGeometry args={[ringRadius, ringStrokeRadius, 10, 36]} />
              <meshBasicMaterial color="#4dd7e8" transparent opacity={0.98} depthTest={false} depthWrite={false} />
            </mesh>
            <Line
              points={[lineStart, lineEnd]}
              color="#141413"
              lineWidth={2}
              depthTest={false}
              renderOrder={32}
            />
            <Line
              points={[lineStart, lineEnd]}
              color="#f4a62a"
              lineWidth={1}
              depthTest={false}
              renderOrder={33}
            />
            {showLabels && <Html position={labelOffset} center><span className="shaft-port-label" data-port-id={port.id} data-display-position={port.position.join(",")}>{port.id} · Ø{port.diameter}</span></Html>}
          </group>
        );
      })}
    </>
  );
}

type ComponentDisplayMode = "preview" | "scene";

function componentRawBounds(part: LibraryPart) {
  const bounds = new THREE.Box3();
  const shaftDiameterScale = (part.shaftParameters?.diameter ?? 10) / 10;
  const shaftPreviewLength = THREE.MathUtils.clamp((part.shaftParameters?.length ?? 1000) / 285, 1.5, 4.2);
  part.geometry.primitives.filter(({ appearance }) => appearance !== "cutout").forEach((primitive) => {
    const geometry = primitive.shape === "box"
      ? new THREE.BoxGeometry(...primitive.size)
      : primitive.shape === "ring"
        ? new THREE.BoxGeometry(
            2.5,
            Math.max((part.parameters?.thickness ?? 8) * 2.5 / Math.max(part.parameters?.outerDiameter ?? 25, 0.1), 0.08),
            2.5,
          )
        : new THREE.CylinderGeometry(0.5, 0.5, 1, 32).scale(
            primitive.size[0] * (part.shaftParameters ? shaftDiameterScale : 1),
            part.shaftParameters ? shaftPreviewLength : primitive.size[1],
            primitive.size[2] * (part.shaftParameters ? shaftDiameterScale : 1),
          );
    geometry.computeBoundingBox();
    const primitiveBounds = geometry.boundingBox!.clone();
    const object = new THREE.Object3D();
    object.position.fromArray(primitive.position);
    object.rotation.set(...(primitive.rotation ?? [0, 0, 0]).map(degToRad) as Vec3Tuple);
    object.updateMatrix();
    primitiveBounds.applyMatrix4(object.matrix);
    bounds.union(primitiveBounds);
    geometry.dispose();
  });
  return {
    center: bounds.getCenter(new THREE.Vector3()),
    size: bounds.getSize(new THREE.Vector3()),
  };
}

function componentTargetSize(part: LibraryPart, displayMode: ComponentDisplayMode): Vec3Tuple {
  const previewMaxSize = part.kind === "rod" ? 3.6 : 2.8;
  return displayMode === "scene"
    ? componentSceneSize(part.dimensions)
    : normalizedComponentSelectionSize(part.dimensions, previewMaxSize, 0);
}

function componentDisplayUnitsPerMm(part: LibraryPart, displayMode: ComponentDisplayMode) {
  const target = componentTargetSize(part, displayMode);
  const dimensionsMm = [part.dimensions.width, part.dimensions.height, part.dimensions.length];
  return Math.min(...target.map((value, index) => value / Math.max(dimensionsMm[index], 0.001)));
}

function proceduralComponentFit(part: LibraryPart, displayMode: ComponentDisplayMode) {
  const raw = componentRawBounds(part);
  const target = componentTargetSize(part, displayMode);
  return {
    center: raw.center,
    scale: new THREE.Vector3(
      target[0] / Math.max(raw.size.x, 0.001),
      target[1] / Math.max(raw.size.y, 0.001),
      target[2] / Math.max(raw.size.z, 0.001),
    ),
  };
}

function fittedComponentPorts(part: LibraryPart, displayMode: ComponentDisplayMode = "scene"): ComponentPort[] {
  const fit = proceduralComponentFit(part, displayMode);
  return part.geometry.ports.map((port) => ({
    ...port,
    position: port.position.map((value, index) =>
      (value - fit.center.getComponent(index)) * fit.scale.getComponent(index),
    ) as Vec3Tuple,
  }));
}

function ComponentModel({ part, displayMode = "preview", onObjectReady }: { part: LibraryPart; displayMode?: ComponentDisplayMode; onObjectReady?: (object: THREE.Object3D | null) => void }) {
  const panelMaterial = part.kind === "panel" ? inferPanelMaterial(part) : null;
  const metalMaterial = part.kind === "panel" ? null : inferMetalMaterial(part);
  const metalSpec = metalMaterial ? metalMaterialSpecs[metalMaterial] : metalMaterialSpecs.stainless;
  const isAcrylic = panelMaterial === "acrylic";
  const isWood = panelMaterial === "oak" || panelMaterial === "walnut";
  const color = isAcrylic ? acrylicLiquidGlassMaterial.color : panelMaterial === "oak" ? "#b98b57" : panelMaterial === "walnut" ? "#5a3524" : metalSpec.color;
  const woodTexture = useMemo(
    () => panelMaterial && panelMaterial !== "acrylic" ? createWoodTexture(panelMaterial) : null,
    [panelMaterial],
  );
  const acrylicTexture = useMemo(
    () => isAcrylic ? createAcrylicLiquidGlassTexture() : null,
    [isAcrylic],
  );
  useEffect(() => () => woodTexture?.dispose(), [woodTexture]);
  useEffect(() => () => acrylicTexture?.dispose(), [acrylicTexture]);
  const shaftDiameterScale = (part.shaftParameters?.diameter ?? 10) / 10;
  const shaftPreviewLength = THREE.MathUtils.clamp((part.shaftParameters?.length ?? 1000) / 285, 1.5, 4.2);
  const fit = useMemo(
    () => proceduralComponentFit(part, displayMode),
    [displayMode, part],
  );
  const renderPrimitives = useMemo(
    () => normalizeCircularCutoutPrimitives(part.geometry.primitives, part.dimensions),
    [part.dimensions, part.geometry.primitives],
  );
  const hollowGeometry = useMemo(
    () => hasBooleanCutouts(renderPrimitives)
      ? getCachedHollowComponentGeometry(renderPrimitives, part.parameters)
      : null,
    [part.parameters, renderPrimitives],
  );
  const surfaceMaterial = () => isAcrylic
    ? (
      <meshPhysicalMaterial
        color={color}
        map={acrylicTexture ?? undefined}
        roughnessMap={acrylicTexture ?? undefined}
        metalness={acrylicLiquidGlassMaterial.metalness}
        roughness={acrylicLiquidGlassMaterial.roughness}
        transparent
        opacity={acrylicLiquidGlassMaterial.previewOpacity}
        transmission={acrylicLiquidGlassMaterial.transmission}
        thickness={acrylicLiquidGlassMaterial.thickness}
        ior={acrylicLiquidGlassMaterial.ior}
        clearcoat={acrylicLiquidGlassMaterial.clearcoat}
        clearcoatRoughness={acrylicLiquidGlassMaterial.clearcoatRoughness}
        reflectivity={acrylicLiquidGlassMaterial.reflectivity}
        envMapIntensity={acrylicLiquidGlassMaterial.envMapIntensity}
        attenuationColor={acrylicLiquidGlassMaterial.attenuationColor}
        attenuationDistance={acrylicLiquidGlassMaterial.attenuationDistance}
      />
    )
    : isWood
      ? <meshStandardMaterial map={woodTexture ?? undefined} color="#ffffff" metalness={0.02} roughness={0.52} />
      : <meshPhysicalMaterial color={color} metalness={metalSpec.metalness} roughness={metalSpec.roughness} clearcoat={0.28} clearcoatRoughness={0.16} envMapIntensity={1.45} />;
  return (
    <group ref={onObjectReady} scale={fit.scale.toArray() as Vec3Tuple}>
      <group position={fit.center.clone().multiplyScalar(-1).toArray() as Vec3Tuple}>
        {part.cornerHolePanelParameters ? (
          <mesh>
            <CornerHolePanelGeometry widthMm={part.dimensions.width} lengthMm={part.dimensions.length} parameters={part.cornerHolePanelParameters} />
            {surfaceMaterial()}
          </mesh>
        ) : part.pegboardParameters ? (
          <mesh>
            <PerforatedPanelGeometry widthMm={part.dimensions.width} lengthMm={part.dimensions.length} parameters={part.pegboardParameters} />
            {surfaceMaterial()}
          </mesh>
        ) : hollowGeometry ? <mesh geometry={hollowGeometry}>{surfaceMaterial()}</mesh> : part.geometry.primitives.map((primitive, index) => (
          <mesh key={`${primitive.shape}-${index}`} position={primitive.position} rotation={(primitive.rotation ?? [0, 0, 0]).map(degToRad) as Vec3Tuple}>
            {primitive.shape === "box" ? <boxGeometry args={primitive.size} /> : primitive.shape === "ring" ? <AnnularGeometry innerDiameter={part.parameters?.innerDiameter ?? 10} outerDiameter={part.parameters?.outerDiameter ?? 25} thickness={part.parameters?.thickness ?? 8} /> : <cylinderGeometry args={[primitive.size[0] / 2 * (part.shaftParameters ? shaftDiameterScale : 1), primitive.size[2] / 2 * (part.shaftParameters ? shaftDiameterScale : 1), part.shaftParameters ? shaftPreviewLength : primitive.size[1], 32]} />}
            {surfaceMaterial()}
          </mesh>
        ))}
      </group>
    </group>
  );
}

function parameterizedShaftLibraryPart(part: LibraryPart, transform: PartTransform): LibraryPart {
  if (!part.shaftParameters) return part;
  const parameters = resolveShaftInstanceParameters({
    baseDiameterMm: part.shaftParameters.diameter,
    baseLengthMm: part.shaftParameters.length,
    diameterMm: transform.sizeY,
    lengthScalePercent: transform.sizeX,
  });
  const halfPreviewLength = parameters.previewLengthScene / 2;
  return {
    ...part,
    model: `SHAFT-${parameters.diameterMm}-${parameters.lengthMm}`,
    dimensions: {
      width: parameters.diameterMm,
      height: parameters.diameterMm,
      length: parameters.lengthMm,
    },
    shaftParameters: {
      diameter: parameters.diameterMm,
      length: parameters.lengthMm,
    },
    compatibleRod: `Ø${parameters.diameterMm} mm`,
    geometry: {
      ...part.geometry,
      ports: part.geometry.ports.map((port) => port.id === "START"
        ? { ...port, diameter: parameters.diameterMm, position: [0, 0, -halfPreviewLength] }
        : port.id === "END"
          ? { ...port, diameter: parameters.diameterMm, position: [0, 0, halfPreviewLength] }
          : port),
    },
  };
}

function parameterizedPanelLibraryPart(part: LibraryPart, transform: PartTransform): LibraryPart {
  if (part.kind !== "panel") return part;
  return {
    ...part,
    dimensions: {
      width: transform.sizeX,
      length: transform.sizeZ,
      height: transform.sizeY,
    },
  };
}

function buildPreciseBoxPart({
  id,
  dimensions,
  addedParts,
  transforms,
}: {
  id: string;
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
}): BoxAssemblyPart | null {
  const info = getPartInfo(id, "zh", new Set(), addedParts);
  if (info.kind === "rod") return null;
  const transform = transforms[id] ?? (id.startsWith("P-") && allPartIds.includes(id)
    ? {
        ...getDefaultTransform(id),
        sizeX: Math.max(100, dimensions.width - 20),
        sizeZ: Math.max(100, dimensions.depth - 15),
      }
    : getPartTransform(transforms, id));
  const addedPart = addedParts.find((part) => part.id === id);
  const renderedPart = addedPart?.libraryPart
    ? addedPart.kind === "panel"
      ? parameterizedPanelLibraryPart(addedPart.libraryPart, transform)
      : addedPart.libraryPart
    : null;
  const rawSize = renderedPart
    ? componentSceneSize(renderedPart.dimensions)
    : [
        mmToScene(transform.sizeX),
        mmToScene(transform.sizeY),
        mmToScene(transform.sizeZ),
      ] satisfies Vec3Tuple;
  return {
    partId: id,
    center: getPartWorldPosition(id, dimensions, addedParts, transforms),
    size: rawSize.map((value, index) => value * Math.abs([
      transform.scaleX,
      transform.scaleY,
      transform.scaleZ,
    ][index])) as Vec3Tuple,
    rotation: [transform.rotX, transform.rotY, transform.rotZ],
  };
}

function calculateOverallDesignBounds({
  dimensions,
  addedParts,
  transforms,
  deletedIds,
  hiddenIds,
  isolatedIds,
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  deletedIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  isolatedIds: ReadonlySet<string>;
}): OverallDesignBounds | null {
  const boxes: THREE.Box3[] = [];
  const sceneNodes = sceneNodesForDimensions(dimensions);
  const isVisible = (id: string) =>
    !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id));
  const boxTransform = (basePosition: Vec3Tuple, transform: PartTransform): BoundsTransform => ({
    position: addVec3(basePosition, sceneOffset(transform)),
    rotationDeg: [transform.rotX, transform.rotY, transform.rotZ],
    scale: [transform.scaleX, transform.scaleY, transform.scaleZ],
  });
  const shaftTransform = (transform: PartTransform): BoundsTransform => ({
    position: sceneOffset(transform),
    rotationDeg: [transform.rotX, transform.rotY, transform.rotZ],
    scale: [transform.scaleX, transform.scaleY, transform.scaleZ],
  });

  rods.filter(([id]) => isVisible(id)).forEach(([id, startNode, endNode]) => {
    const transform = getPartTransform(transforms, id);
    boxes.push(shaftBounds({
      start: sceneNodes[startNode],
      end: sceneNodes[endNode],
      diameterScene: Math.max(0.05, mmToScene(transform.sizeY)),
      lengthScale: Math.max(0.15, transform.sizeX / 100),
      transform: shaftTransform(transform),
    }));
  });

  panels.filter(({ id }) => isVisible(id)).forEach(({ id }) => {
    const index = Number(id.slice(-1)) - 1;
    const transform = transforms[id] ?? {
      ...getDefaultTransform(id),
      sizeX: Math.max(100, dimensions.width - 20),
      sizeZ: Math.max(100, dimensions.depth - 15),
    };
    boxes.push(orientedBoxBounds({
      size: [
        Math.max(0.4, mmToScene(transform.sizeX)),
        Math.max(0.025, mmToScene(transform.sizeY)),
        Math.max(0.3, mmToScene(transform.sizeZ)),
      ],
      transform: boxTransform([0, builtInPanelYs(dimensions)[index], 0], transform),
    }));
  });

  joints.filter(({ id }) => isVisible(id)).forEach(({ id, nodeId }) => {
    const transform = getPartTransform(transforms, id);
    boxes.push(orientedBoxBounds({
      size: [
        Math.max(0.12, mmToScene(transform.sizeX)),
        Math.max(0.12, mmToScene(transform.sizeY)),
        Math.max(0.12, mmToScene(transform.sizeZ)),
      ],
      transform: boxTransform(sceneNodes[nodeId], transform),
    }));
  });

  addedParts.filter(({ id }) => isVisible(id)).forEach((part) => {
    const transform = getPartTransform(transforms, part.id);
    const basePosition = getPartBasePosition(part.id, dimensions, addedParts);
    if (!part.libraryPart) {
      if (part.kind === "rod") {
        boxes.push(shaftBounds({
          start: addVec3(basePosition, [-1.5, 0, 0]),
          end: addVec3(basePosition, [1.5, 0, 0]),
          diameterScene: Math.max(0.05, mmToScene(transform.sizeY)),
          lengthScale: Math.max(0.15, transform.sizeX / 100),
          transform: shaftTransform(transform),
        }));
      } else {
        boxes.push(orientedBoxBounds({
          size: part.kind === "panel"
            ? [
                Math.max(0.4, mmToScene(transform.sizeX)),
                Math.max(0.025, mmToScene(transform.sizeY)),
                Math.max(0.3, mmToScene(transform.sizeZ)),
              ]
            : [
                Math.max(0.12, mmToScene(transform.sizeX)),
                Math.max(0.12, mmToScene(transform.sizeY)),
                Math.max(0.12, mmToScene(transform.sizeZ)),
              ],
          transform: boxTransform(basePosition, transform),
        }));
      }
      return;
    }

    const renderedPart = part.kind === "rod"
      ? parameterizedShaftLibraryPart(part.libraryPart, transform)
      : part.kind === "panel"
        ? parameterizedPanelLibraryPart(part.libraryPart, transform)
        : part.libraryPart;
    boxes.push(orientedBoxBounds({
      size: componentSceneSize(renderedPart.dimensions),
      transform: boxTransform(basePosition, transform),
    }));
  });

  return mergeDesignBounds(boxes);
}

function structuralPartFromBox({
  id,
  kind,
  box,
  material,
  requiredConnectionCount,
}: {
  id: string;
  kind: PartKind;
  box: THREE.Box3;
  material: PartMaterial;
  requiredConnectionCount?: number;
}): StructuralPart {
  const sceneUnitMm = 1 / mmToScene(1);
  const minMm = box.min.toArray().map((value) => value * sceneUnitMm) as Vec3Tuple;
  const maxMm = box.max.toArray().map((value) => value * sceneUnitMm) as Vec3Tuple;
  const centerMm = box.getCenter(new THREE.Vector3()).toArray().map((value) => value * sceneUnitMm) as Vec3Tuple;
  const sizeMm = box.getSize(new THREE.Vector3()).toArray().map((value) => value * sceneUnitMm) as Vec3Tuple;
  return {
    id,
    kind,
    minMm,
    maxMm,
    centerMm,
    sizeMm,
    massKg: estimatePartMassKg({
      kind,
      sizeMm,
      material: material === "acrylic" ? "acrylic" : material === "oak" || material === "walnut" ? "wood" : "steel",
    }),
    requiredConnectionCount,
  };
}

function calculateStructuralModel({
  dimensions,
  addedParts,
  transforms,
  materials,
  deletedIds,
  assemblyConnections,
}: {
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transforms: Record<string, PartTransform>;
  materials: Record<string, PartMaterial>;
  deletedIds: ReadonlySet<string>;
  assemblyConnections: AssemblyConnection[];
}): { parts: StructuralPart[]; connections: AssemblyConnection[]; panelMounts: PanelMountConnection[] } {
  const parts: StructuralPart[] = [];
  const sceneNodes = sceneNodesForDimensions(dimensions);
  const emptyIds = new Set<string>();
  const shaftSegments = buildVisibleShaftSegments({
    dimensions,
    addedParts,
    transforms,
    deletedIds,
    hiddenIds: emptyIds,
    isolatedIds: emptyIds,
  });
  const boxTransform = (basePosition: Vec3Tuple, transform: PartTransform): BoundsTransform => ({
    position: addVec3(basePosition, sceneOffset(transform)),
    rotationDeg: [transform.rotX, transform.rotY, transform.rotZ],
    scale: [transform.scaleX, transform.scaleY, transform.scaleZ],
  });

  shaftSegments.forEach((segment) => {
    const start = new THREE.Vector3(...segment.start);
    const end = new THREE.Vector3(...segment.end);
    const radius = mmToScene(Math.max(1, segment.diameter)) / 2;
    const box = new THREE.Box3().setFromPoints([start, end]).expandByScalar(radius);
    parts.push(structuralPartFromBox({
      id: segment.partId,
      kind: "rod",
      box,
      material: getPartMaterial(materials, segment.partId),
    }));
  });

  panels.filter(({ id }) => !deletedIds.has(id)).forEach(({ id }) => {
    const index = Number(id.slice(-1)) - 1;
    const transform = transforms[id] ?? {
      ...getDefaultTransform(id),
      sizeX: Math.max(100, dimensions.width - 20),
      sizeZ: Math.max(100, dimensions.depth - 15),
    };
    parts.push(structuralPartFromBox({
      id,
      kind: "panel",
      box: orientedBoxBounds({
        size: [
          Math.max(0.4, mmToScene(transform.sizeX)),
          Math.max(0.025, mmToScene(transform.sizeY)),
          Math.max(0.3, mmToScene(transform.sizeZ)),
        ],
        transform: boxTransform([0, builtInPanelYs(dimensions)[index], 0], transform),
      }),
      material: getPartMaterial(materials, id),
    }));
  });

  joints.filter(({ id }) => !deletedIds.has(id)).forEach(({ id, nodeId }) => {
    const transform = getPartTransform(transforms, id);
    parts.push(structuralPartFromBox({
      id,
      kind: "joint",
      box: orientedBoxBounds({
        size: [
          Math.max(0.12, mmToScene(transform.sizeX)),
          Math.max(0.12, mmToScene(transform.sizeY)),
          Math.max(0.12, mmToScene(transform.sizeZ)),
        ],
        transform: boxTransform(sceneNodes[nodeId], transform),
      }),
      material: getPartMaterial(materials, id),
      requiredConnectionCount: 2,
    }));
  });

  addedParts.filter(({ id, kind }) => !deletedIds.has(id) && kind !== "rod").forEach((part) => {
    const transform = getPartTransform(transforms, part.id);
    const basePosition = getPartBasePosition(part.id, dimensions, addedParts);
    const renderedPart = part.libraryPart
      ? part.kind === "panel" ? parameterizedPanelLibraryPart(part.libraryPart, transform) : part.libraryPart
      : null;
    const size = renderedPart
      ? componentSceneSize(renderedPart.dimensions)
      : part.kind === "panel"
        ? [Math.max(0.4, mmToScene(transform.sizeX)), Math.max(0.025, mmToScene(transform.sizeY)), Math.max(0.3, mmToScene(transform.sizeZ))] as Vec3Tuple
        : [Math.max(0.12, mmToScene(transform.sizeX)), Math.max(0.12, mmToScene(transform.sizeY)), Math.max(0.12, mmToScene(transform.sizeZ))] as Vec3Tuple;
    const requiredConnectionCount = part.kind === "joint"
      ? Math.max(1, part.libraryPart?.geometry.ports.filter(isShaftAssemblyPort).length ?? 2)
      : undefined;
    parts.push(structuralPartFromBox({
      id: part.id,
      kind: part.kind,
      box: orientedBoxBounds({ size, transform: boxTransform(basePosition, transform) }),
      material: getPartMaterial(materials, part.id),
      requiredConnectionCount,
    }));
  });

  // Built-in templates predate the explicit assembly graph. Reconstruct only their
  // deterministic geometric joints; manually placed library parts still require a real snap.
  const syntheticConnections: AssemblyConnection[] = [];
  const explicitConnectorIds = new Set(assemblyConnections.map(({ connectorId }) => connectorId));
  joints.filter(({ id }) => !deletedIds.has(id)).forEach(({ id, nodeId }) => {
    if (explicitConnectorIds.has(id)) return;
    const jointPosition = new THREE.Vector3(...addVec3(sceneNodes[nodeId], sceneOffset(getPartTransform(transforms, id))));
    shaftSegments.filter(({ partId }) => partId.startsWith("R-")).forEach((segment) => {
      const start = new THREE.Vector3(...segment.start);
      const direction = new THREE.Vector3(...segment.end).sub(start);
      const lengthSq = direction.lengthSq();
      const t = lengthSq > 1e-8 ? THREE.MathUtils.clamp(jointPosition.clone().sub(start).dot(direction) / lengthSq, 0, 1) : 0;
      const closest = start.clone().addScaledVector(direction, t);
      if (closest.distanceTo(jointPosition) > mmToScene(12)) return;
      syntheticConnections.push({
        connectorId: id,
        portId: `TEMPLATE-${segment.partId}`,
        shaftId: segment.partId,
        positionOnShaft: t,
        behavior: "fixed",
      });
    });
  });

  // Surface contact is evaluated for every connector by analyzeStructure. Keep
  // explicit mounts only for imported/project data that declares one directly.
  const panelMounts: PanelMountConnection[] = [];

  return {
    parts,
    connections: [...syntheticConnections, ...assemblyConnections],
    panelMounts,
  };
}

function ImportedComponentModel({ part, displayMode = "preview", onObjectReady }: { part: LibraryPart; displayMode?: ComponentDisplayMode; onObjectReady?: (object: THREE.Object3D | null) => void }) {
  const gltf = useLoader(GLTFLoader, part.modelAssetUrl!);
  const normalizedModel = useMemo(() => {
    const clone = gltf.scene.clone(true);
    const rotation = part.modelRotation ?? [0, 0, 0];
    clone.rotation.set(...rotation.map(degToRad) as Vec3Tuple);
    clone.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const target = componentTargetSize(part, displayMode);
    const scale = new THREE.Vector3(
      target[0] / Math.max(size.x, 0.001),
      target[1] / Math.max(size.y, 0.001),
      target[2] / Math.max(size.z, 0.001),
    );
    const panelMaterial = part.kind === "panel" ? inferPanelMaterial(part) : null;
    const metalSpec = part.kind === "panel" ? metalMaterialSpecs.stainless : metalMaterialSpecs[inferMetalMaterial(part)];
    const surfaceColor = panelMaterial === "oak"
      ? "#b98b57"
      : panelMaterial === "walnut"
        ? "#5a3524"
        : panelMaterial === "acrylic"
          ? acrylicLiquidGlassMaterial.color
          : metalSpec.color;
    clone.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = new THREE.MeshPhysicalMaterial({
        color: surfaceColor,
        metalness: panelMaterial ? 0.02 : metalSpec.metalness,
        roughness: panelMaterial ? 0.52 : metalSpec.roughness,
        transparent: panelMaterial === "acrylic",
        opacity: panelMaterial === "acrylic" ? acrylicLiquidGlassMaterial.previewOpacity : 1,
        transmission: panelMaterial === "acrylic" ? acrylicLiquidGlassMaterial.transmission : 0,
        clearcoat: 0.28,
        clearcoatRoughness: 0.16,
        envMapIntensity: 1.45,
      });
      object.frustumCulled = false;
    });
    return {
      object: clone,
      position: [-center.x * scale.x, -center.y * scale.y, -center.z * scale.z] as Vec3Tuple,
      scale: [scale.x, scale.y, scale.z] as Vec3Tuple,
    };
  }, [displayMode, gltf.scene, part]);
  return <group ref={onObjectReady} position={normalizedModel.position} scale={normalizedModel.scale} dispose={null}><primitive object={normalizedModel.object} dispose={null} /></group>;
}

function PreviewInvalidator({ revision }: { revision: string }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    invalidate();
    const frame = window.requestAnimationFrame(() => invalidate());
    return () => window.cancelAnimationFrame(frame);
  }, [invalidate, revision]);
  return null;
}

function PreviewContextRecovery({ revision, onContextLost }: { revision: number; onContextLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useLayoutEffect(() => {
    const canvas = gl.domElement;
    canvas.dataset.contextRevision = String(revision);
    canvas.dataset.contextRecoveryReady = "true";
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      window.setTimeout(onContextLost, 0);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost, false);
    return () => {
      delete canvas.dataset.contextRecoveryReady;
      canvas.removeEventListener("webglcontextlost", handleContextLost, false);
    };
  }, [gl, onContextLost, revision]);
  return null;
}

function ComponentModelPreview({ part, detailed = false, onExportObjectReady }: { part: LibraryPart; detailed?: boolean; onExportObjectReady?: (object: THREE.Object3D | null) => void }) {
  const [contextRevision, setContextRevision] = useState(0);
  const recoverContext = useCallback(() => setContextRevision((current) => current + 1), []);
  const previewPorts = useMemo(() => fittedComponentPorts(part, "preview"), [part]);
  const cutoutCount = part.geometry.primitives.filter(({ appearance }) => appearance === "cutout").length;
  const pegboardHoleCount = part.pegboardParameters ? calculatePegboardHoles(part.dimensions.width, part.dimensions.length, part.pegboardParameters).length : 0;
  const previewRevision = `${part.id}-${part.updatedAt}-${part.dimensions.width}-${part.dimensions.length}-${part.dimensions.height}-${part.geometry.ports.map((port) => `${port.id}:${port.position.join(",")}:${port.axis}:${port.diameter}`).join("|")}-${detailed}`;
  const presentationRotation: Vec3Tuple = part.kind === "rod" ? [0.14, -1.05, 0.08] : [0.18, -0.45, 0];
  return (
    <div className={`component-model-preview ${detailed ? "detailed" : ""}`}>
      <Canvas key={contextRevision} frameloop="demand" dpr={[1, 1.25]} camera={{ position: [0, 0.55, 5], fov: 38 }} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}>
        <ambientLight intensity={0.24} />
        <directionalLight position={[4, 6, 5]} intensity={1.7} />
        <directionalLight position={[-3, 1, -4]} intensity={0.35} />
        <StudioEnvironment intensity={1.15} />
        <group rotation={presentationRotation}>
          <Suspense fallback={null}>
            {part.modelAssetUrl ? <ImportedComponentModel part={part} displayMode="preview" onObjectReady={onExportObjectReady} /> : <ComponentModel part={part} displayMode="preview" onObjectReady={onExportObjectReady} />}
          </Suspense>
          {detailed && <ComponentPortMarkers ports={previewPorts} showLabels unitsPerMm={componentDisplayUnitsPerMm(part, "preview")} />}
          {detailed && <axesHelper args={[2.1]} />}
        </group>
        <PreviewInvalidator revision={previewRevision} />
        <PreviewContextRecovery revision={contextRevision} onContextLost={recoverContext} />
        <OrbitControls enableDamping={false} enablePan={false} minDistance={2.4} maxDistance={7} />
      </Canvas>
      <div className="model-preview-meta"><span>3D</span>{detailed && <><strong className="axis-x">X / W</strong><strong className="axis-y">Y / H</strong><strong className="axis-z">Z / L</strong></>}<strong>{pegboardHoleCount > 0 ? `1 MESH / ${pegboardHoleCount} HOLE` : cutoutCount > 0 ? `1 MESH / ${cutoutCount} VOID` : `${part.geometry.primitives.length} MESH`}</strong><strong>{part.geometry.ports.length} PORT</strong></div>
    </div>
  );
}

const componentPreviewIds = new Set(initialLibraryParts.map(({ id }) => id));

function DialogFocusTrap({ onEscape }: { onEscape: () => void }) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const onEscapeRef = useRef(onEscape);
  useEffect(() => { onEscapeRef.current = onEscape; }, [onEscape]);
  useEffect(() => {
    const dialog = markerRef.current?.parentElement;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";
    const focusInitial = window.requestAnimationFrame(() => {
      const target = dialog.querySelector<HTMLElement>("[autofocus]") ?? dialog.querySelector<HTMLElement>(focusableSelector);
      target?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusInitial);
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, []);
  return <span ref={markerRef} hidden aria-hidden="true" />;
}

function ComponentListPreview({ part }: { part: LibraryPart }) {
  const [failed, setFailed] = useState(!componentPreviewIds.has(part.id));
  useEffect(() => setFailed(!componentPreviewIds.has(part.id)), [part.id]);

  if (failed) return (
    <div className="component-list-live-preview" data-preview-source="live-3d">
      <ComponentModelPreview part={part} />
    </div>
  );
  return (
    <div className="component-list-preview" data-preview-source="image">
      <img
        src={`/assets/component-previews/${part.id}.png`}
        alt={`${part.model} ${part.name}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      <span>3D PREVIEW</span>
    </div>
  );
}

function PartPickerDialog({ parts, lang, onClose, onAdd }: { parts: LibraryPart[]; lang: Lang; onClose: () => void; onAdd: (part: LibraryPart, orientation?: ShaftPlacementOrientation) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | PartKind>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | ComponentUsageTag>("all");
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = orderLibraryParts(parts.filter((part) =>
    (kind === "all" || part.kind === kind) &&
    (usageFilter === "all" || normalizeUsageTags(part.kind, part.usageTags).includes(usageFilter)) &&
    (!normalizedQuery || `${part.model} ${part.name} ${part.compatibleRod} ${usageSummary(part.usageTags, part.kind, lang)}`.toLowerCase().includes(normalizedQuery)),
  ));
  const labels = lang === "zh"
    ? { title: "从组件库添加零件", search: "搜索名称、型号、光轴规格或用途", all: "全部", joint: "连接件", rod: "光轴", panel: "层板", add: "添加", horizontalAdd: "水平添加", verticalAdd: "垂直添加", cancel: "取消", empty: "没有匹配的组件", usage: "用途" }
    : { title: "ADD FROM COMPONENT LIBRARY", search: "Search name, model, shaft spec, or usage", all: "ALL", joint: "CONNECTORS", rod: "SHAFTS", panel: "PANELS", add: "ADD", horizontalAdd: "ADD HORIZONTAL", verticalAdd: "ADD VERTICAL", cancel: "CANCEL", empty: "NO MATCHING COMPONENTS", usage: "USAGE" };

  return (
    <div className="modal-backdrop part-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="part-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="part-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <DialogFocusTrap onEscape={onClose} />
        <header>
          <div><span>{lang === "zh" ? "组件库" : "COMPONENT LIBRARY"}</span><h2 id="part-picker-title">{labels.title}</h2></div>
          <button type="button" aria-label={labels.cancel} onClick={onClose}>×</button>
        </header>
        <div className="part-picker-controls">
          <label><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} /></label>
          <div>{libraryKindFilterOrder.map((value) => <button type="button" key={value} className={kind === value ? "active" : ""} onClick={() => setKind(value)}>{labels[value]}</button>)}</div>
          <select aria-label={labels.usage} value={usageFilter} onChange={(event) => setUsageFilter(event.target.value as "all" | ComponentUsageTag)}>
            <option value="all">{labels.usage}: {labels.all}</option>
            {componentUsageOptions.map((tag) => <option key={tag} value={tag}>{usageLabel(tag, lang)}</option>)}
          </select>
        </div>
        <div className="part-picker-list">
          {filtered.map((part) => (
            <article key={part.id} data-component-id={part.id} data-component-kind={part.kind}>
              <ComponentListPreview part={part} />
              <div className="part-picker-identity"><span>{part.model}</span><strong>{part.name}</strong><small>{part.shaftParameters ? `Ø${part.shaftParameters.diameter} × ${part.shaftParameters.length} mm` : part.verticalFixedBaseShaftDiameter !== undefined ? `${part.model} · Ø${part.verticalFixedBaseShaftDiameter} · ${part.dimensions.width} × ${part.dimensions.length} × ${part.dimensions.height} mm` : part.roundFixedBaseInnerDiameter !== undefined ? `${lang === "zh" ? "内径" : "ID"} Ø${part.roundFixedBaseInnerDiameter} / ${lang === "zh" ? "外径" : "OD"} Ø${part.dimensions.width} / ${lang === "zh" ? "总高" : "H"} ${part.dimensions.height} mm` : part.parameters ? `${lang === "zh" ? "内" : "ID"} ${part.parameters.innerDiameter} / ${lang === "zh" ? "外" : "OD"} ${part.parameters.outerDiameter} / ${lang === "zh" ? "厚" : "T"} ${part.parameters.thickness} mm` : `${part.dimensions.width} × ${part.dimensions.length} × ${part.dimensions.height} mm`}</small></div>
              <div className="part-picker-compatibility"><span>{lang === "zh" ? "用途 / 适配" : "USAGE / FIT"}</span><strong>{usageSummary(part.usageTags, part.kind, lang)}</strong><small>{part.compatibleRod} · {part.connector}</small></div>
              <div className={`part-picker-row-actions ${part.kind === "rod" ? "shaft-actions" : ""}`}>
                {part.kind === "rod" ? (
                  <>
                    <button className="secondary-button" type="button" onClick={() => onAdd(part, "horizontal")}><MoveHorizontal size={15} />{labels.horizontalAdd}</button>
                    <button className="primary-button" type="button" onClick={() => onAdd(part, "vertical")}><MoveVertical size={15} />{labels.verticalAdd}</button>
                  </>
                ) : (
                  <button className="primary-button" type="button" onClick={() => onAdd(part)}><Plus size={15} />{labels.add}</button>
                )}
              </div>
            </article>
          ))}
          {filtered.length === 0 && <div className="part-picker-empty"><PackageSearch size={26} /><strong>{labels.empty}</strong></div>}
        </div>
      </section>
    </div>
  );
}

function templatePreviewImage(template: RackTemplateDefinition) {
  if (template.previewImage) return template.previewImage;
  if (!template.snapshot) return "/assets/template-previews/blank-empty-state.png";
  const visiblePanelCount = [
    ...panels.map(({ id }) => id),
    ...template.snapshot.addedParts.filter(({ kind }) => kind === "panel").map(({ id }) => id),
  ].filter((id) => !template.snapshot!.deletedIds.includes(id)).length;
  if (visiblePanelCount >= 3) return "/assets/template-previews/three-tier.png";
  if (visiblePanelCount >= 2) return "/assets/template-previews/two-tier.png";
  return visiblePanelCount === 0
    ? "/assets/template-previews/shaft-frame.png"
    : "/assets/template-previews/three-tier.png";
}

function TemplatePickerDialog({
  templates,
  lang,
  onClose,
  onSelect,
  onDelete,
}: {
  templates: RackTemplateDefinition[];
  lang: Lang;
  onClose: () => void;
  onSelect: (templateId: RackTemplateId) => void;
  onDelete: (templateId: RackTemplateId) => void;
}) {
  const isZh = lang === "zh";
  return (
    <div className="modal-backdrop template-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="template-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="template-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <DialogFocusTrap onEscape={onClose} />
        <header>
          <div>
            <span>{isZh ? "项目模板" : "PROJECT TEMPLATES"}</span>
            <h2 id="template-picker-title">{isZh ? "从模板创建" : "CREATE FROM TEMPLATE"}</h2>
            <p>{isZh ? "选择一个基础结构，创建后仍可自由调整尺寸、组件和材质。" : "Choose a starting structure, then freely edit its dimensions, components, and materials."}</p>
          </div>
          <button type="button" aria-label={isZh ? "关闭模板列表" : "CLOSE TEMPLATE LIST"} onClick={onClose}>×</button>
        </header>
        <div className="template-picker-list">
          {templates.map((template, index) => {
            const partCount = template.snapshot
              ? allPartIds.length + template.snapshot.addedParts.length - template.snapshot.deletedIds.length
              : allPartIds.length - template.deletedPartIds.length;
            return (
              <article className={template.custom ? "custom-template" : ""} data-template-id={template.id} key={template.id}>
                <div className="template-preview">
                  <img src={templatePreviewImage(template)} alt={`${template.name[lang]} ${isZh ? "3D 预览" : "3D PREVIEW"}`} />
                  <span>{String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="template-identity">
                  <span>{template.custom ? (isZh ? "我的模板" : "MY TEMPLATE") : (isZh ? "结构模板" : "STRUCTURE TEMPLATE")}</span>
                  <h3>{template.name[lang]}</h3>
                  <p>{template.description[lang]}</p>
                </div>
                <dl>
                  <div><dt>{isZh ? "外形尺寸" : "DIMENSIONS"}</dt><dd>{template.dimensions.width} × {template.dimensions.depth} × {template.dimensions.height} MM</dd></div>
                  <div><dt>{isZh ? "基础组件" : "BASE PARTS"}</dt><dd>{partCount} {isZh ? "个" : "PARTS"}</dd></div>
                </dl>
                <div className="template-actions">
                  <button className="primary-button" type="button" onClick={() => onSelect(template.id)}><Layers3 size={15} />{template.id === "blank" ? (isZh ? "创建空白项目" : "CREATE BLANK PROJECT") : (isZh ? "使用模板" : "USE TEMPLATE")}</button>
                  {template.custom && <button className="danger" type="button" aria-label={`${isZh ? "删除模板" : "DELETE TEMPLATE"} ${template.name[lang]}`} onClick={() => onDelete(template.id)}><Trash2 size={14} />{isZh ? "删除" : "DELETE"}</button>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ThreeViewPlaneEditor({
  part,
  lang,
  onAddHole,
  onUpdateHoleDiameter,
  onMoveHole,
  onRemoveHole,
}: {
  part: LibraryPart;
  lang: Lang;
  onAddHole: (plane: ThreeViewPlane, point: { uMm: number; vMm: number }, diameterMm: number) => void;
  onUpdateHoleDiameter: (primitiveIndex: number, diameterMm: number) => void;
  onMoveHole: (primitiveIndex: number, point: { uMm: number; vMm: number }) => void;
  onRemoveHole: (primitiveIndex: number) => void;
}) {
  const [activePlane, setActivePlane] = useState<ThreeViewPlane>(() => {
    const areas: Array<[ThreeViewPlane, number]> = [
      ["front", part.dimensions.width * part.dimensions.height],
      ["side", part.dimensions.length * part.dimensions.height],
      ["top", part.dimensions.width * part.dimensions.length],
    ];
    return areas.sort((left, right) => right[1] - left[1])[0][0];
  });
  const [holeDiameter, setHoleDiameter] = useState(10);
  const [selectedHoleIndex, setSelectedHoleIndex] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ primitiveIndex: number; uMm: number; vMm: number } | null>(null);
  const suppressNextCanvasClick = useRef(false);
  const holes = useMemo(
    () => describeCircularCutouts(part.geometry.primitives, part.dimensions),
    [part.dimensions, part.geometry.primitives],
  );
  const projectedOutlines = useMemo(
    () => projectThreeViewOutlines(part.geometry.primitives, part.dimensions, activePlane),
    [activePlane, part.dimensions, part.geometry.primitives],
  );
  const visibleHoles = holes.filter((hole) => hole.plane === activePlane);
  const selectedHole = holes.find((hole) => hole.primitiveIndex === selectedHoleIndex) ?? null;
  useEffect(() => {
    if (selectedHoleIndex !== null && !holes.some((hole) => hole.primitiveIndex === selectedHoleIndex)) {
      setSelectedHoleIndex(null);
    }
  }, [holes, selectedHoleIndex]);
  const planeLabels = lang === "zh"
    ? { front: "正视图", side: "侧视图", top: "顶视图" }
    : { front: "FRONT", side: "SIDE", top: "TOP" };
  const helperText = lang === "zh"
    ? "原生孔和新增孔统一管理；选择孔后可调整孔径、拖拽位置或删除，并同步更新 3D、智能吸附和 GLB。"
    : "Source and added holes share one workflow. Select any hole to resize, drag, or delete it and update 3D, smart snap, and GLB.";
  const [uSize, vSize] = activePlane === "front"
    ? [part.dimensions.width, part.dimensions.height]
    : activePlane === "side"
      ? [part.dimensions.length, part.dimensions.height]
      : [part.dimensions.width, part.dimensions.length];
  const safeU = Math.max(uSize, 1);
  const safeV = Math.max(vSize, 1);
  const holeLabelSize = Math.max(1.2, Math.min(safeU, safeV) * 0.07);
  const minorGridMm = Math.max(safeU, safeV) <= 80 ? 5 : Math.max(safeU, safeV) <= 240 ? 10 : Math.max(safeU, safeV) <= 600 ? 25 : 50;
  const majorGridMm = minorGridMm * 2;
  const rulerFontSize = Math.max(0.8, Math.max(safeU, safeV) * 0.014);
  const uTicks = Array.from({ length: Math.floor(safeU / majorGridMm) + 1 }, (_, index) => index * majorGridMm);
  const vTicks = Array.from({ length: Math.floor(safeV / majorGridMm) + 1 }, (_, index) => index * majorGridMm);

  const pointerToPlanePoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { uMm: point.x, vMm: safeV - point.y };
    }
    const rect = svg.getBoundingClientRect();
    return {
      uMm: ((clientX - rect.left) / rect.width) * safeU,
      vMm: ((rect.bottom - clientY) / rect.height) * safeV,
    };
  };

  const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (suppressNextCanvasClick.current) {
      suppressNextCanvasClick.current = false;
      return;
    }
    if (dragPreview) return;
    const svg = event.currentTarget;
    const point = pointerToPlanePoint(svg, event.clientX, event.clientY);
    onAddHole(activePlane, clampCircularHolePoint(part.dimensions, activePlane, point, holeDiameter), holeDiameter);
  };
  const selectHole = (hole: typeof holes[number]) => {
    setSelectedHoleIndex(hole.primitiveIndex);
    setActivePlane(hole.plane);
    setHoleDiameter(hole.diameterMm);
  };
  const handleHolePointerDown = (event: React.PointerEvent<SVGGElement>, hole: typeof holes[number]) => {
    event.preventDefault();
    event.stopPropagation();
    selectHole(hole);
    const svg = event.currentTarget.ownerSVGElement;
    svg?.setPointerCapture(event.pointerId);
    setDragPreview({ primitiveIndex: hole.primitiveIndex, uMm: hole.uMm, vMm: hole.vMm });
  };
  const handleHolePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragPreview) return;
    const hole = holes.find(({ primitiveIndex }) => primitiveIndex === dragPreview.primitiveIndex);
    if (!hole) return;
    const point = pointerToPlanePoint(event.currentTarget, event.clientX, event.clientY);
    const clamped = clampCircularHolePoint(part.dimensions, activePlane, point, hole.diameterMm);
    setDragPreview({ primitiveIndex: hole.primitiveIndex, ...clamped });
  };
  const finishHoleDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragPreview) return;
    if (event.type === "pointerup") suppressNextCanvasClick.current = true;
    onMoveHole(dragPreview.primitiveIndex, { uMm: dragPreview.uMm, vMm: dragPreview.vMm });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragPreview(null);
  };
  const draggingHole = dragPreview
    ? holes.find(({ primitiveIndex }) => primitiveIndex === dragPreview.primitiveIndex) ?? null
    : null;
  const dragClearances = draggingHole && dragPreview
    ? circularHoleClearances(part.dimensions, activePlane, dragPreview, draggingHole.diameterMm)
    : null;

  return (
    <section className="three-view-plane-editor" aria-label={lang === "zh" ? "平面三视图编辑" : "PLANAR THREE-VIEW EDITOR"}>
      <div className="three-view-editor-heading">
        <div>
          <h3>{lang === "zh" ? "平面三视图 / 挖孔" : "PLANAR THREE VIEWS / CUT HOLES"}</h3>
          <p>{helperText}</p>
        </div>
        <label>
          {lang === "zh" ? "孔径" : "DIAMETER"}
          <input
            aria-label={lang === "zh" ? "挖孔孔径" : "CUT HOLE DIAMETER"}
            type="number"
            min="1"
            step="0.5"
            value={holeDiameter}
            onChange={(event) => setHoleDiameter(Math.max(1, Number(event.target.value) || 1))}
          />
          <span>mm</span>
        </label>
      </div>
      <div className="three-view-tabs" role="tablist" aria-label={lang === "zh" ? "三视图切换" : "THREE VIEW SWITCHER"}>
        {(["front", "side", "top"] as const).map((plane) => (
          <button
            type="button"
            role="tab"
            aria-selected={activePlane === plane}
            className={activePlane === plane ? "active" : ""}
            key={plane}
            onClick={() => setActivePlane(plane)}
          >
            {planeLabels[plane]}
          </button>
        ))}
      </div>
      <svg
        className={`three-view-canvas ${dragPreview ? "dragging-hole" : ""}`}
        role="img"
        aria-label={`${planeLabels[activePlane]} ${lang === "zh" ? "可点击挖孔平面" : "clickable hole-cutting plane"}`}
        viewBox={`0 0 ${safeU} ${safeV}`}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleCanvasClick}
        onPointerMove={handleHolePointerMove}
        onPointerUp={finishHoleDrag}
        onPointerCancel={finishHoleDrag}
      >
        <defs>
          <pattern id={`three-view-grid-${activePlane}`} width={minorGridMm} height={minorGridMm} patternUnits="userSpaceOnUse">
            <path d={`M ${minorGridMm} 0 L 0 0 0 ${minorGridMm}`} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={safeU} height={safeV} rx={Math.min(safeU, safeV) * 0.025} fill={`url(#three-view-grid-${activePlane})`} />
        <g className="three-view-mm-grid" aria-label={`${minorGridMm} mm ${lang === "zh" ? "辅助网格" : "GRID"}`}>
          {uTicks.map((value) => <line key={`u-${value}`} x1={value} x2={value} y1="0" y2={safeV} />)}
          {vTicks.map((value) => <line key={`v-${value}`} x1="0" x2={safeU} y1={safeV - value} y2={safeV - value} />)}
        </g>
        <g className="three-view-mm-rulers" aria-label={lang === "zh" ? "毫米标尺" : "MILLIMETER RULERS"}>
          {uTicks.filter((value) => value <= safeU - rulerFontSize * 8).map((value) => <text style={{ fontSize: rulerFontSize }} key={`ut-${value}`} x={value} y={rulerFontSize * 1.1} textAnchor={value === 0 ? "start" : "middle"}>{value}</text>)}
          {vTicks.map((value) => <text style={{ fontSize: rulerFontSize }} key={`vt-${value}`} x={rulerFontSize * 0.4} y={Math.min(safeV - rulerFontSize * 0.3, Math.max(rulerFontSize, safeV - value))} dominantBaseline="middle">{value}</text>)}
          <text style={{ fontSize: rulerFontSize }} className="three-view-grid-unit" x={safeU - rulerFontSize * 0.4} y={rulerFontSize * 1.1} textAnchor="end">GRID {minorGridMm} MM</text>
        </g>
        <g className="three-view-model-outline" aria-label={lang === "zh" ? "组件投影轮廓" : "COMPONENT PROJECTED OUTLINE"}>
          {projectedOutlines.map((outline) => outline.kind === "ellipse" ? (
            <ellipse
              key={`${outline.kind}-${outline.primitiveIndex}`}
              cx={outline.cxMm}
              cy={safeV - outline.cyMm}
              rx={outline.rxMm}
              ry={outline.ryMm}
            />
          ) : (
            <rect
              key={`${outline.kind}-${outline.primitiveIndex}`}
              x={outline.xMm}
              y={safeV - outline.yMm - outline.heightMm}
              width={outline.widthMm}
              height={outline.heightMm}
              rx={outline.radiusMm}
              ry={outline.radiusMm}
            />
          ))}
        </g>
        {visibleHoles.map((hole) => (
          <g
            key={hole.primitiveIndex}
            className={`drilled-hole ${selectedHoleIndex === hole.primitiveIndex ? "selected-hole" : ""}`}
            onPointerDown={(event) => handleHolePointerDown(event, hole)}
            onClick={(event) => {
              event.stopPropagation();
              selectHole(hole);
            }}
          >
            <circle
              cx={dragPreview?.primitiveIndex === hole.primitiveIndex ? dragPreview.uMm : hole.uMm}
              cy={safeV - (dragPreview?.primitiveIndex === hole.primitiveIndex ? dragPreview.vMm : hole.vMm)}
              r={Math.max(hole.diameterMm / 2, 1)}
              fill="rgba(8,8,8,0.92)"
              stroke="rgba(126,217,87,0.95)"
              strokeWidth={Math.max(safeU, safeV) / 220}
            />
            <text style={{ fontSize: holeLabelSize }} x={dragPreview?.primitiveIndex === hole.primitiveIndex ? dragPreview.uMm : hole.uMm} y={safeV - (dragPreview?.primitiveIndex === hole.primitiveIndex ? dragPreview.vMm : hole.vMm)} textAnchor="middle" dominantBaseline="middle">Ø{hole.diameterMm}</text>
          </g>
        ))}
        {draggingHole && dragPreview && dragClearances && (() => {
          const radius = draggingHole.diameterMm / 2;
          const centerY = safeV - dragPreview.vMm;
          return (
            <g className="three-view-clearance-guides" aria-label={lang === "zh" ? "孔边缘到组件四周距离" : "HOLE EDGE CLEARANCES"}>
              <line data-edge="left" x1="0" x2={dragPreview.uMm - radius} y1={centerY} y2={centerY} />
              <text style={{ fontSize: rulerFontSize }} x={(dragPreview.uMm - radius) / 2} y={centerY - rulerFontSize * 0.35} textAnchor="middle">{dragClearances.leftMm} mm</text>
              <line data-edge="right" x1={dragPreview.uMm + radius} x2={safeU} y1={centerY} y2={centerY} />
              <text style={{ fontSize: rulerFontSize }} x={dragPreview.uMm + radius + dragClearances.rightMm / 2} y={centerY - rulerFontSize * 0.35} textAnchor="middle">{dragClearances.rightMm} mm</text>
              <line data-edge="top" x1={dragPreview.uMm} x2={dragPreview.uMm} y1="0" y2={centerY - radius} />
              <text style={{ fontSize: rulerFontSize }} x={dragPreview.uMm + rulerFontSize * 0.35} y={(centerY - radius) / 2} dominantBaseline="middle">{dragClearances.topMm} mm</text>
              <line data-edge="bottom" x1={dragPreview.uMm} x2={dragPreview.uMm} y1={centerY + radius} y2={safeV} />
              <text style={{ fontSize: rulerFontSize }} x={dragPreview.uMm + rulerFontSize * 0.35} y={centerY + radius + dragClearances.bottomMm / 2} dominantBaseline="middle">{dragClearances.bottomMm} mm</text>
            </g>
          );
        })()}
      </svg>
      {selectedHole && (
        <div className="three-view-selected-hole" aria-label={lang === "zh" ? "选中孔参数" : "SELECTED HOLE PARAMETERS"}>
          <div>
            <span>{lang === "zh" ? "已选孔" : "SELECTED HOLE"}</span>
            <strong>{planeLabels[selectedHole.plane]} · {Math.round(selectedHole.uMm)} × {Math.round(selectedHole.vMm)} mm</strong>
          </div>
          <label>
            {lang === "zh" ? "孔径" : "DIAMETER"}
            <input
              aria-label={lang === "zh" ? "选中孔孔径" : "SELECTED HOLE DIAMETER"}
              type="number"
              min="1"
              step="0.5"
              value={selectedHole.diameterMm}
              onChange={(event) => {
                const diameter = Math.max(1, Number(event.target.value) || 1);
                setHoleDiameter(diameter);
                onUpdateHoleDiameter(selectedHole.primitiveIndex, diameter);
              }}
            />
            <span>mm</span>
          </label>
        </div>
      )}
      <div className="three-view-hole-list" aria-label={lang === "zh" ? "当前孔位" : "CURRENT HOLES"}>
        {holes.length === 0 ? (
          <p>{lang === "zh" ? "暂无圆孔。点击上方平面添加第一个孔。" : "No circular holes yet. Click the plane above to add one."}</p>
        ) : holes.map((hole) => (
          <div key={hole.primitiveIndex} className={selectedHoleIndex === hole.primitiveIndex ? "selected" : ""}>
            <span>{planeLabels[hole.plane]}</span>
            <strong>Ø{hole.diameterMm} mm</strong>
            <small>{Math.round(hole.uMm)} × {Math.round(hole.vMm)} mm</small>
            <button type="button" aria-label={`${lang === "zh" ? "选择孔" : "SELECT HOLE"} ${hole.primitiveIndex}`} onClick={() => selectHole(hole)}>
              <MousePointer2 size={13} />
              {lang === "zh" ? "选择" : "SELECT"}
            </button>
            <button type="button" aria-label={`${lang === "zh" ? "删除孔" : "DELETE HOLE"} ${hole.primitiveIndex}`} onClick={() => onRemoveHole(hole.primitiveIndex)}>
              <Trash2 size={13} />
              {lang === "zh" ? "删除" : "DELETE"}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

const threeViewHolePortPrefix = "CUT-HOLE-";

function isThreeViewHolePort(port: ComponentPort): boolean {
  return port.id.startsWith(threeViewHolePortPrefix);
}

function samePortLocation(left: Pick<ComponentPort, "axis" | "position">, right: Pick<ComponentPort, "axis" | "position">): boolean {
  return left.axis === right.axis && left.position.every((value, index) => Math.abs(value - right.position[index]) < 0.001);
}

function createThreeViewHolePort(hole: ThreeViewHoleDraft, id: string): ComponentPort {
  return {
    id,
    axis: hole.axis,
    position: hole.position,
    diameter: hole.diameterMm,
    kind: "shaft-bore",
    behavior: "fixed",
    toleranceMm: 0.25,
    capacity: 1,
  };
}

function nextThreeViewHolePortId(ports: ComponentPort[]): string {
  const nextNumber = ports.reduce((maximum, port) => {
    if (!isThreeViewHolePort(port)) return maximum;
    return Math.max(maximum, Number(port.id.slice(threeViewHolePortPrefix.length)) || 0);
  }, 0) + 1;
  return `${threeViewHolePortPrefix}${String(nextNumber).padStart(2, "0")}`;
}

function findPortForHole(geometry: ComponentGeometry, hole: ThreeViewHoleDraft | undefined): ComponentPort | undefined {
  if (!hole) return undefined;
  return geometry.ports.find((port) => samePortLocation(port, hole));
}

function addEditableHole(
  geometry: ComponentGeometry,
  dimensions: LibraryPart["dimensions"],
  plane: ThreeViewPlane,
  point: { uMm: number; vMm: number },
  diameterMm: number,
): ComponentGeometry {
  const primitives = addCircularCutoutPrimitive(geometry.primitives, dimensions, plane, point, diameterMm);
  const hole = describeCircularCutouts(primitives, dimensions).find(({ primitiveIndex }) => primitiveIndex === primitives.length - 1);
  return hole ? {
    ...geometry,
    primitives,
    ports: [...geometry.ports, createThreeViewHolePort(hole, nextThreeViewHolePortId(geometry.ports))],
  } : { ...geometry, primitives };
}

function updateEditableHole(
  geometry: ComponentGeometry,
  dimensions: LibraryPart["dimensions"],
  primitiveIndex: number,
  update: (primitives: ComponentPrimitive[]) => ComponentPrimitive[],
): ComponentGeometry {
  const previousHole = describeCircularCutouts(geometry.primitives, dimensions).find((hole) => hole.primitiveIndex === primitiveIndex);
  const linkedPort = findPortForHole(geometry, previousHole);
  const primitives = update(geometry.primitives);
  const nextHole = describeCircularCutouts(primitives, dimensions).find((hole) => hole.primitiveIndex === primitiveIndex);
  if (!nextHole) return { ...geometry, primitives };
  if (linkedPort) return {
    ...geometry,
    primitives,
    ports: geometry.ports.map((port) => port.id === linkedPort.id
      ? { ...port, axis: nextHole.axis, position: nextHole.position, diameter: nextHole.diameterMm }
      : port),
  };
  return {
    ...geometry,
    primitives,
    ports: [...geometry.ports, createThreeViewHolePort(nextHole, nextThreeViewHolePortId(geometry.ports))],
  };
}

function removeEditableHole(
  geometry: ComponentGeometry,
  dimensions: LibraryPart["dimensions"],
  primitiveIndex: number,
): ComponentGeometry {
  const hole = describeCircularCutouts(geometry.primitives, dimensions).find((candidate) => candidate.primitiveIndex === primitiveIndex);
  const linkedPort = findPortForHole(geometry, hole);
  return {
    ...geometry,
    primitives: removePrimitiveAtIndex(geometry.primitives, primitiveIndex),
    ports: linkedPort ? geometry.ports.filter((port) => port.id !== linkedPort.id) : geometry.ports,
  };
}

function removeRedundantThreeViewHolePorts(geometry: ComponentGeometry): ComponentGeometry {
  const permanentPorts = geometry.ports.filter((port) => !isThreeViewHolePort(port));
  const ports = geometry.ports.filter((port) =>
    !isThreeViewHolePort(port) || !permanentPorts.some((permanent) => samePortLocation(port, permanent)),
  );
  return ports.length === geometry.ports.length ? geometry : { ...geometry, ports };
}

function ComponentLibraryPage({ lang, theme, parts, onPartsChange, onBackToDesign, onUsePart, onToggleTheme }: { lang: Lang; theme: Theme; parts: LibraryPart[]; onPartsChange: React.Dispatch<React.SetStateAction<LibraryPart[]>>; onBackToDesign: () => void; onUsePart: (part: LibraryPart) => void; onToggleTheme: () => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | PartKind>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | ComponentUsageTag>("all");
  const [selectedPartId, setSelectedPartId] = useState(initialLibraryParts[0].id);
  const [editorMode, setEditorMode] = useState<"edit" | "three-view" | null>(null);
  const [editorView, setEditorView] = useState<"model" | "three-view">("model");
  const [referencePreviewPart, setReferencePreviewPart] = useState<LibraryPart | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<LibraryPart | null>(null);
  const [viewFiles, setViewFiles] = useState<Record<"front" | "side" | "top", File | null>>({ front: null, side: null, top: null });
  const exportObjectRef = useRef<THREE.Object3D | null>(null);
  const [exportObjectReady, setExportObjectReady] = useState(false);
  const [glbExportStatus, setGlbExportStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
  const [glbExportResult, setGlbExportResult] = useState<ComponentGlbExportResult | null>(null);
  const selectedPart = parts.find(({ id }) => id === selectedPartId) ?? parts[0];
  const [draft, setDraft] = useState<LibraryPart>(selectedPart);
  useEffect(() => {
    if (!editorMode) return;
    setDraft((current) => {
      const geometry = removeRedundantThreeViewHolePorts(current.geometry);
      return geometry === current.geometry ? current : { ...current, geometry };
    });
  }, [draft.geometry, editorMode]);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredParts = orderLibraryParts(parts.filter((part) =>
    (kind === "all" || part.kind === kind) &&
    (usageFilter === "all" || normalizeUsageTags(part.kind, part.usageTags).includes(usageFilter)) &&
    (!normalizedQuery || `${part.model} ${part.name} ${usageSummary(part.usageTags, part.kind, lang)}`.toLowerCase().includes(normalizedQuery)),
  ));
  const labels = lang === "zh" ? {
    title: "组件库", subtitle: "维护标准件、定制件与三视图生成组件", search: "按型号、组件名称或用途查询", add: "新增组件", threeView: "三视图生成", all: "全部", joint: "连接件", rod: "光轴", panel: "层板", result: "个组件", model: "型号", dimensions: "外形尺寸", material: "材质", interface: "连接接口", usage: "常见用途", reference: "资料来源", edit: "修改组件", use: "添加到设计", delete: "删除组件", empty: "没有匹配的组件", back: "返回设计器", front: "正视图", side: "侧视图", top: "顶视图", upload: "上传图片", generate: "生成组件草稿", generatingHint: "上传同一零件的正视、侧视和顶视图，系统将识别轮廓、尺寸比例与连接孔位。", save: "保存组件", cancel: "取消", basic: "基础信息", geometry: "几何参数", compatibility: "装配接口", ready: "可使用", draft: "草稿", review: "待复核",
  } : {
    title: "COMPONENT LIBRARY", subtitle: "Manage standard, custom, and three-view generated components", search: "Search by model, component name, or usage", add: "NEW COMPONENT", threeView: "GENERATE FROM VIEWS", all: "ALL", joint: "CONNECTORS", rod: "RODS", panel: "PANELS", result: "COMPONENTS", model: "MODEL", dimensions: "DIMENSIONS", material: "MATERIAL", interface: "INTERFACE", usage: "COMMON USAGE", reference: "REFERENCE", edit: "EDIT", use: "ADD TO DESIGN", delete: "DELETE COMPONENT", empty: "NO MATCHING COMPONENTS", back: "BACK TO DESIGN", front: "FRONT", side: "SIDE", top: "TOP", upload: "UPLOAD IMAGE", generate: "GENERATE DRAFT", generatingHint: "Upload front, side, and top views of the same part to detect its outline, scale, and connection holes.", save: "SAVE COMPONENT", cancel: "CANCEL", basic: "BASIC INFO", geometry: "GEOMETRY", compatibility: "INTERFACE", ready: "READY", draft: "DRAFT", review: "REVIEW",
  };
  const isLocalReferenceImage = (url: string) => url.startsWith("/") && /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(url);
  const confirmComponentDelete = () => {
    if (!deleteCandidate || parts.length <= 1) return;
    const remaining = parts.filter((part) => part.id !== deleteCandidate.id);
    onPartsChange(remaining);
    if (selectedPartId === deleteCandidate.id) setSelectedPartId(remaining[0]?.id ?? "");
    setDeleteCandidate(null);
  };
  const toggleDraftUsage = (tag: ComponentUsageTag) => {
    setDraft((current) => {
      const currentTags = normalizeUsageTags(current.kind, current.usageTags);
      const usageTags = currentTags.includes(tag)
        ? currentTags.filter((item) => item !== tag)
        : [...currentTags, tag];
      return { ...current, usageTags: normalizeUsageTags(current.kind, usageTags) };
    });
  };
  const resetGlbExport = () => {
    exportObjectRef.current = null;
    setExportObjectReady(false);
    setGlbExportStatus("idle");
    setGlbExportResult(null);
  };
  const invalidateGlbExportResult = () => {
    setGlbExportStatus("idle");
    setGlbExportResult(null);
  };
  const captureExportObject = useCallback((object: THREE.Object3D | null) => {
    exportObjectRef.current = object;
    setExportObjectReady(Boolean(object));
  }, []);
  const openEdit = (part: LibraryPart) => { resetGlbExport(); setEditorView("model"); setSelectedPartId(part.id); setDraft({ ...part, usageTags: normalizeUsageTags(part.kind, part.usageTags), dimensions: { ...part.dimensions }, parallelClampParameters: part.parallelClampParameters ? { ...part.parallelClampParameters } : undefined, pegboardParameters: part.pegboardParameters ? { ...part.pegboardParameters } : undefined }); setEditorMode("edit"); };
  const openNew = () => {
    const next: LibraryPart = { id: `lib-${Date.now()}`, model: "NEW-10-001", name: lang === "zh" ? "新组件" : "NEW COMPONENT", kind: "joint", status: "draft", material: lang === "zh" ? "不锈钢" : "STAINLESS", dimensions: { width: 30, length: 30, height: 30 }, compatibleRod: "Ø10 mm", connector: lang === "zh" ? "待定义" : "UNDEFINED", usageTags: normalizeUsageTags("joint"), source: "manual", updatedAt: new Date().toISOString().slice(0, 10), geometry: defaultCrossConnectorPart.geometry };
    resetGlbExport(); setEditorView("model"); setDraft(next); setEditorMode("edit");
  };
  const saveDraft = () => {
    const nextDraft = { ...draft, usageTags: normalizeUsageTags(draft.kind, draft.usageTags), updatedAt: new Date().toISOString().slice(0, 10) };
    onPartsChange((current) => current.some(({ id }) => id === draft.id) ? current.map((part) => part.id === draft.id ? nextDraft : part) : [nextDraft, ...current]);
    setSelectedPartId(draft.id); setEditorMode(null);
  };
  const generateDraft = () => {
    const generated: LibraryPart = { id: `lib-generated-${Date.now()}`, model: `SCAN-10-${String(parts.length + 1).padStart(3, "0")}`, name: lang === "zh" ? "三视图生成组件" : "VIEW-GENERATED COMPONENT", kind: "joint", status: "review", material: lang === "zh" ? "待确认" : "TO CONFIRM", dimensions: { width: 40, length: 40, height: 32 }, compatibleRod: "Ø10 mm", connector: lang === "zh" ? "识别到 2 个连接孔" : "2 HOLES DETECTED", usageTags: ["corner-connection"], source: "three-view", updatedAt: new Date().toISOString().slice(0, 10), geometry: componentGeometries.base };
    resetGlbExport(); setEditorView("model"); setDraft(generated); setEditorMode("edit");
  };
  const handleComponentGlbExport = async () => {
    if (!exportObjectRef.current || glbExportStatus === "exporting") {
      setGlbExportStatus("error");
      return;
    }
    setGlbExportStatus("exporting");
    setGlbExportResult(null);
    try {
      const result = await exportComponentGlb(exportObjectRef.current, {
        model: draft.model,
        name: draft.name,
        dimensions: draft.dimensions,
        material: draft.material,
        ports: draft.geometry.ports.map(({ id, position, axis, diameter, kind: portKind, behavior }) => ({
          id,
          position,
          axis,
          diameter,
          kind: portKind,
          behavior,
        })),
      });
      setGlbExportResult(result);
      setGlbExportStatus("success");
    } catch (error) {
      console.error("Component GLB export failed", error);
      setGlbExportStatus("error");
    }
  };
  const updateDraftPort = (portId: string, changes: Partial<ComponentPort>) => {
    setDraft((current) => ({
      ...current,
      geometry: {
        ...current.geometry,
        ports: current.geometry.ports.map((port) => port.id === portId ? { ...port, ...changes } : port),
      },
    }));
  };
  const updateFixedRingParameter = (parameter: ShaftStopParameterKey, value: number) => {
    setDraft((current) => {
      if (!current.parameters) return current;
      const requested = parameter === "innerDiameter"
        ? { ...current.parameters, innerDiameter: value }
        : { ...current.parameters, thickness: value };
      const parameters = resolveShaftStopParameters(requested);
      const variant = resolveShaftStopVariant(parameters);
      return {
        ...current,
        model: shaftStopModel(parameters),
        parameters,
        compatibleRod: `Ø${parameters.innerDiameter} mm`,
        connector: `${lang === "zh" ? "轴向限位 / 开口锁紧" : "AXIAL STOP / SPLIT CLAMP"} / ${variant.thread}`,
        dimensions: shaftStopDimensions(parameters),
        geometry: createShaftStopComponentGeometry(parameters),
      };
    });
  };
  const updateParallelClampParameter = (parameter: ParallelClampParameterKey, value: number) => {
    setDraft((current) => {
      if (!current.parallelClampParameters) return current;
      const requested = parameter === "holeCenterDistance"
        ? { ...current.parallelClampParameters, holeCenterDistance: value }
        : { ...current.parallelClampParameters, hole1Diameter: value, hole2Diameter: value };
      const parameters = resolveParallelClampParameters({
        ...requested,
      });
      return {
        ...current,
        model: parallelClampModel(parameters),
        dimensions: parallelClampDimensions(parameters),
        parallelClampParameters: parameters,
        compatibleRod: `Ø${parameters.hole1Diameter} mm × Ø${parameters.hole2Diameter} mm`,
        connector: `${lang === "zh" ? "同径平行双孔 / 中心距" : "EQUAL PARALLEL BORES / CENTER DISTANCE"} ${parameters.holeCenterDistance} mm / M5`,
        geometry: createParallelClampComponentGeometry(parameters),
      };
    });
  };
  const updateEqualBoreCrossClampModel = (diameter: number) => {
    setDraft((current) => current.equalBoreCrossClampDiameter === undefined
      ? current
      : parameterizedEqualBoreCrossClampPart(current, diameter, lang));
    invalidateGlbExportResult();
  };
  const updateEqualBoreTClampModel = (diameter: number) => {
    setDraft((current) => current.equalBoreTClampDiameter === undefined
      ? current
      : parameterizedEqualBoreTClampPart(current, diameter, lang));
    invalidateGlbExportResult();
  };
  const updateRoundFixedBaseInnerDiameter = (innerDiameter: number) => {
    setDraft((current) => current.roundFixedBaseInnerDiameter === undefined
      ? current
      : parameterizedRoundFixedBasePart(current, innerDiameter, lang));
    invalidateGlbExportResult();
  };
  const updateVerticalFixedBaseModel = (model: string) => {
    setDraft((current) => current.verticalFixedBaseShaftDiameter === undefined
      ? current
      : parameterizedVerticalFixedBasePart(current, model, lang));
    invalidateGlbExportResult();
  };
  const updatePegboardParameter = (parameter: keyof PegboardParameters, value: number) => {
    setDraft((current) => {
      if (!current.pegboardParameters) return current;
      const parameters = resolvePegboardParameters(current.dimensions.width, current.dimensions.length, {
        ...current.pegboardParameters,
        [parameter]: value,
      });
      return {
        ...current,
        model: `PEGBOARD-${current.dimensions.width}-${current.dimensions.length}-P${parameters.holePitch}-D${parameters.holeDiameter}`,
        pegboardParameters: parameters,
        connector: `${lang === "zh" ? "孔阵" : "HOLE ARRAY"} Ø${parameters.holeDiameter} / ${lang === "zh" ? "孔距" : "PITCH"} ${parameters.holePitch} mm`,
      };
    });
    invalidateGlbExportResult();
  };
  const addDraftPlaneHole = (plane: ThreeViewPlane, point: { uMm: number; vMm: number }, diameterMm: number) => {
    setDraft((current) => ({
      ...current,
      modelAssetUrl: undefined,
      modelAssetName: undefined,
      status: "review",
      connector: current.connector.includes("平面挖孔") || current.connector.includes("planar cutout")
        ? current.connector
        : `${current.connector} / ${lang === "zh" ? "平面挖孔" : "planar cutout"}`,
      geometry: addEditableHole(current.geometry, current.dimensions, plane, point, diameterMm),
    }));
    invalidateGlbExportResult();
  };
  const updateDraftPlaneHoleDiameter = (primitiveIndex: number, diameterMm: number) => {
    setDraft((current) => ({
      ...current,
      modelAssetUrl: undefined,
      modelAssetName: undefined,
      status: "review",
      geometry: updateEditableHole(current.geometry, current.dimensions, primitiveIndex, (primitives) => updateCircularCutoutDiameter(primitives, current.dimensions, primitiveIndex, diameterMm)),
    }));
    invalidateGlbExportResult();
  };
  const moveDraftPlaneHole = (primitiveIndex: number, point: { uMm: number; vMm: number }) => {
    setDraft((current) => ({
      ...current,
      modelAssetUrl: undefined,
      modelAssetName: undefined,
      status: "review",
      geometry: updateEditableHole(current.geometry, current.dimensions, primitiveIndex, (primitives) => moveCircularCutoutPrimitive(primitives, current.dimensions, primitiveIndex, point)),
    }));
    invalidateGlbExportResult();
  };
  const removeDraftPlaneHole = (primitiveIndex: number) => {
    setDraft((current) => ({
      ...current,
      modelAssetUrl: undefined,
      modelAssetName: undefined,
      status: "review",
      geometry: removeEditableHole(current.geometry, current.dimensions, primitiveIndex),
    }));
    invalidateGlbExportResult();
  };
  return (
    <div className={`component-library-workspace ${editorMode ? "component-editor-open" : ""}`}>
      <header className="library-topbar">
        <div><div className="app-name">AXISFRAME STUDIO</div><h1>{labels.title}</h1><p>{labels.subtitle}</p></div>
        <div className="library-top-actions"><button className="icon-button theme-toggle" type="button" title={theme === "dark" ? (lang === "zh" ? "切换到浅色模式" : "SWITCH TO LIGHT MODE") : (lang === "zh" ? "切换到深色模式" : "SWITCH TO DARK MODE")} aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><button className="icon-button" type="button" onClick={onBackToDesign}><ChevronLeft size={16} />{labels.back}</button><button className="icon-button" type="button" onClick={() => { setViewFiles({ front: null, side: null, top: null }); setEditorMode("three-view"); }}><ImageUp size={16} />{labels.threeView}</button><button className="primary-button" type="button" onClick={openNew}><Plus size={16} />{labels.add}</button></div>
      </header>
      <div className="library-body">
        <aside className="library-filters">
          <div className="library-section-label">{lang === "zh" ? "组件分类" : "CATEGORIES"}</div>
          {libraryKindFilterOrder.map((value) => <button key={value} className={kind === value ? "active" : ""} type="button" onClick={() => setKind(value)}>{value === "all" ? <Layers3 size={17} /> : value === "joint" ? <Target size={17} /> : value === "rod" ? <Maximize2 size={17} /> : <Grid3X3 size={17} />}<span>{labels[value]}</span><strong>{value === "all" ? parts.length : parts.filter((part) => part.kind === value).length}</strong></button>)}
          <div className="library-section-label usage-label">{labels.usage}</div>
          <button className={usageFilter === "all" ? "active" : ""} type="button" onClick={() => setUsageFilter("all")}><WandSparkles size={17} /><span>{labels.all}</span><strong>{parts.length}</strong></button>
          {componentUsageOptions.map((tag) => <button key={tag} className={usageFilter === tag ? "active" : ""} type="button" onClick={() => setUsageFilter(tag)}><Wrench size={17} /><span>{usageLabel(tag, lang)}</span><strong>{parts.filter((part) => normalizeUsageTags(part.kind, part.usageTags).includes(tag)).length}</strong></button>)}
          <div className="library-source-note"><WandSparkles size={18} /><strong>{lang === "zh" ? "三视图识别" : "VIEW RECOGNITION"}</strong><span>{lang === "zh" ? "上传三视图生成组件后，可继续编辑尺寸、孔位和装配接口。" : "Generate a component from three views, then refine dimensions, holes, and assembly interfaces."}</span></div>
        </aside>
        <main className="library-main">
          <div className="library-query-row"><label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} /></label><Badge>{filteredParts.length} {labels.result}</Badge></div>
          <div className="component-grid">
            {filteredParts.map((part) => <article key={part.id} data-component-id={part.id} data-component-kind={part.kind} className={`component-card ${selectedPartId === part.id ? "selected" : ""}`} onClick={() => setSelectedPartId(part.id)}>
              <ComponentListPreview part={part} />
              <div className="component-card-head"><div><span>{part.model}</span><h2>{part.name}</h2>{part.variantCount && <span className="component-variant-count">{part.variantCount} {lang === "zh" ? "个可选规格" : "VARIANTS"}</span>}</div>{part.kind === "joint" && <div className="component-smart-ports"><i />{part.geometry.ports.filter(isShaftAssemblyPort).length} {lang === "zh" ? "光轴端口" : "SHAFT PORTS"}</div>}</div>
              <dl className="component-card-summary">
                <div className="component-card-usage"><dt>{labels.usage}</dt><dd>{usageSummary(part.usageTags, part.kind, lang)}</dd></div>
                <div className="component-card-interface"><dt>{labels.interface}</dt><dd>{part.connector}</dd></div>
                {part.referenceUrl && <div className="component-card-reference"><dt>{labels.reference}</dt><dd><button className="component-reference-button" type="button" onClick={(event) => { event.stopPropagation(); setReferencePreviewPart(part); }}><Eye size={12} />{part.referenceLabel}</button></dd></div>}
              </dl>
              <div className="component-card-actions"><button type="button" onClick={(event) => { event.stopPropagation(); openEdit(part); }}><Pencil size={15} />{labels.edit}</button><button className="primary-button" type="button" onClick={(event) => { event.stopPropagation(); onUsePart(part); }}><Plus size={15} />{labels.use}</button><button className="component-delete-button" type="button" aria-label={`${labels.delete} ${part.model}`} disabled={parts.length <= 1} onClick={(event) => { event.stopPropagation(); setDeleteCandidate(part); }}><Trash2 size={15} />{lang === "zh" ? "删除" : "DELETE"}</button></div>
            </article>)}
            {filteredParts.length === 0 && <div className="library-empty"><PackageSearch size={28} /><strong>{labels.empty}</strong></div>}
          </div>
        </main>
      </div>
      {editorMode && <div className="library-editor-backdrop component-editor-page">
        <header className="component-editor-topbar">
          <div className="component-editor-titlebar">
            <button className="icon-button" type="button" onClick={() => setEditorMode(null)}><ChevronLeft size={16} />{lang === "zh" ? "返回组件库" : "BACK TO LIBRARY"}</button>
            <div>
              <span>{editorMode === "three-view" ? labels.threeView : (lang === "zh" ? "组件编辑器" : "COMPONENT EDITOR")}</span>
              <h1>{editorMode === "three-view" ? (lang === "zh" ? "由图片创建组件" : "CREATE FROM IMAGES") : draft.name}</h1>
              <p>{editorMode === "three-view" ? labels.generatingHint : `${draft.model} · ${draft.dimensions.width} × ${draft.dimensions.length} × ${draft.dimensions.height} mm`}</p>
            </div>
          </div>
          <div className="component-editor-top-actions">
            <button className="icon-button theme-toggle" type="button" title={theme === "dark" ? (lang === "zh" ? "切换到浅色模式" : "SWITCH TO LIGHT MODE") : (lang === "zh" ? "切换到深色模式" : "SWITCH TO DARK MODE")} aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
            {editorMode !== "three-view" && <button className="primary-button" type="button" onClick={saveDraft}><Save size={16} />{lang === "zh" ? "保存并返回" : "SAVE & BACK"}</button>}
          </div>
        </header>
        {editorMode === "three-view" ? (
          <div className="component-editor-create-shell">
            <aside className="component-editor-create-steps">
              <span>{lang === "zh" ? "创建流程" : "CREATE FLOW"}</span>
              <strong>{lang === "zh" ? "三视图生成" : "THREE-VIEW GENERATION"}</strong>
              <ol>
                <li className="active">{lang === "zh" ? "上传正、侧、顶视图" : "Upload front, side, and top"}</li>
                <li>{lang === "zh" ? "识别轮廓和孔位" : "Detect outline and holes"}</li>
                <li>{lang === "zh" ? "生成可编辑草稿" : "Generate editable draft"}</li>
              </ol>
            </aside>
            <main className="library-editor component-editor-surface component-editor-create-main">
              <div className="three-view-flow"><p>{labels.generatingHint}</p><div className="view-upload-grid">{(["front", "side", "top"] as const).map((view) => <label key={view} className={viewFiles[view] ? "has-file" : ""}><input type="file" accept="image/*" onChange={(event) => setViewFiles((current) => ({ ...current, [view]: event.target.files?.[0] ?? null }))} /><ImageUp size={24} /><strong>{labels[view]}</strong><span>{viewFiles[view]?.name ?? labels.upload}</span></label>)}</div><div className="recognition-steps"><div className={viewFiles.front && viewFiles.side && viewFiles.top ? "done" : "active"}><span>01</span><strong>{lang === "zh" ? "图片完整性" : "IMAGE SET"}</strong></div><div><span>02</span><strong>{lang === "zh" ? "轮廓与孔位" : "OUTLINE & HOLES"}</strong></div><div><span>03</span><strong>{lang === "zh" ? "尺寸校正" : "DIMENSION REVIEW"}</strong></div></div><button className="primary-button full" type="button" disabled={!viewFiles.front || !viewFiles.side || !viewFiles.top} onClick={generateDraft}><WandSparkles size={16} />{labels.generate}</button></div>
            </main>
          </div>
        ) : (
          <div className="component-editor-body">
            <main className="library-editor component-editor-surface">
              <div className="component-editor-workspace">
                <div className="component-editor-viewbar">
                  <div className="component-editor-view-switch" role="tablist" aria-label={lang === "zh" ? "零件视图" : "PART VIEW"}>
                    <button type="button" role="tab" aria-selected={editorView === "model"} className={editorView === "model" ? "active" : ""} onClick={() => setEditorView("model")}><Box size={15} />{lang === "zh" ? "3D 模型" : "3D MODEL"}</button>
                    <button type="button" role="tab" aria-selected={editorView === "three-view"} className={editorView === "three-view" ? "active" : ""} onClick={() => setEditorView("three-view")}><Grid3X3 size={15} />{lang === "zh" ? "三视图 / 挖孔" : "THREE VIEWS / HOLES"}</button>
                  </div>
                  <div className="component-editor-view-summary"><strong className="component-editor-model-code">{draft.model}</strong><span>{draft.material}</span></div>
                </div>
                <section className={`component-editor-stage ${editorView === "three-view" ? "three-view-active" : "model-active"}`} aria-label={lang === "zh" ? "零件主视图" : "PRIMARY PART VIEW"}>
                  <div className={`component-editor-view-layer component-editor-model-layer ${editorView === "model" ? "active" : ""}`} aria-hidden={editorView !== "model"}><ComponentModelPreview part={draft} detailed onExportObjectReady={captureExportObject} /></div>
                  <div className={`component-editor-view-layer component-editor-three-view-layer ${editorView === "three-view" ? "active" : ""}`} aria-hidden={editorView !== "three-view"}><ThreeViewPlaneEditor part={draft} lang={lang} onAddHole={addDraftPlaneHole} onUpdateHoleDiameter={updateDraftPlaneHoleDiameter} onMoveHole={moveDraftPlaneHole} onRemoveHole={removeDraftPlaneHole} /></div>
                </section>
                <div className="component-editor-stage-status">
                  <span>{lang === "zh" ? "外形" : "ENVELOPE"} <strong>{draft.dimensions.width} × {draft.dimensions.length} × {draft.dimensions.height} mm</strong></span>
                  <span>{lang === "zh" ? "智能端口" : "SMART PORTS"} <strong>{draft.geometry.ports.filter(isShaftAssemblyPort).length}</strong></span>
                  <span>{lang === "zh" ? "状态" : "STATUS"} <strong>{draft.status === "ready" ? labels.ready : draft.status === "review" ? labels.review : labels.draft}</strong></span>
                </div>
              </div>
            </main>
            <aside className="component-editor-inspector" aria-label={lang === "zh" ? "零件属性与操作" : "PART PROPERTIES AND ACTIONS"}>
              <header>
                <div><span>{lang === "zh" ? "零件设置" : "PART SETTINGS"}</span><h2>{draft.name}</h2></div>
                <strong>{draft.kind === "joint" ? labels.joint : draft.kind === "rod" ? labels.rod : labels.panel}</strong>
              </header>
              <div className="component-form component-editor-inspector-scroll">
                <section className="component-editor-inspector-group"><div className="component-editor-group-title"><Settings2 size={15} /><div><span>01</span><h3>{labels.basic}</h3></div></div><label>{labels.model}<input value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></label><label>{lang === "zh" ? "组件名称" : "NAME"}<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>{lang === "zh" ? "类型" : "TYPE"}<select value={draft.kind} onChange={(event) => { const kind = event.target.value as PartKind; setDraft({ ...draft, kind, usageTags: normalizeUsageTags(kind) }); }}><option value="joint">{labels.joint}</option><option value="rod">{labels.rod}</option><option value="panel">{labels.panel}</option></select></label><label>{labels.material}<input value={draft.material} onChange={(event) => setDraft({ ...draft, material: event.target.value })} /></label></section>
                <section className="component-editor-inspector-group component-editor-parameter-group"><div className="component-editor-group-title"><Box size={15} /><div><span>02</span><h3>{lang === "zh" ? "参数规格" : "PARAMETRIC SPECS"}</h3></div></div>
                  {draft.equalBoreTClampDiameter !== undefined && (() => { const variant = resolveEqualBoreTClampVariant(draft.equalBoreTClampDiameter); return <div className="equal-bore-t-clamp-parameters"><p className="parameter-family-hint">{lang === "zh" ? "型号对应两个相同孔径；选择孔径后 A/B/C/E/F、锁紧螺栓、正交孔位和端口按规格表整组同步。" : "THE MODEL DEFINES TWO EQUAL BORES; A/B/C/E/F, LOCKING BOLTS, PERPENDICULAR BORES, AND PORTS FOLLOW THE STOCK ROW."}</p><label className="equal-bore-model-field">{lang === "zh" ? "型号（孔径 × 孔径）" : "MODEL (BORE × BORE)"}<select aria-label={lang === "zh" ? "同径T型夹型号" : "EQUAL-BORE T-CLAMP MODEL"} value={variant.diameter} onChange={(event) => updateEqualBoreTClampModel(Number(event.target.value))}>{equalBoreTClampVariants.map(({ diameter }) => <option value={diameter} key={diameter}>{diameter}×{diameter}</option>)}</select></label><dl className="equal-bore-derived-specs"><div><dt>A · {lang === "zh" ? "长" : "LENGTH"}</dt><dd>{variant.a} mm</dd></div><div><dt>B · {lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{variant.b} mm</dd></div><div><dt>C · {lang === "zh" ? "宽" : "DEPTH"}</dt><dd>{variant.c} mm</dd></div><div><dt>E · {lang === "zh" ? "左孔中心" : "LEFT CENTER"}</dt><dd>{variant.e} mm</dd></div><div><dt>F · {lang === "zh" ? "右孔中心" : "RIGHT CENTER"}</dt><dd>{variant.f} mm</dd></div><div><dt>{lang === "zh" ? "锁紧螺栓" : "LOCKING BOLT"}</dt><dd>{variant.lockingBolt}</dd></div></dl></div>; })()}
                  {draft.parallelClampParameters && (() => { const variant = resolveParallelClampVariant(draft.parallelClampParameters); return <div className="parallel-clamp-parameters"><p className="parameter-family-hint">{lang === "zh" ? "只选择同径孔径和有效中心距；长、宽、高、M5 螺丝、几何和端口按 16 个库存组合同步。" : "SELECT AN EQUAL BORE DIAMETER AND VALID CENTER DISTANCE; THE STOCK ENVELOPE, M5 FASTENER, GEOMETRY, AND PORTS UPDATE TOGETHER."}</p><div className="dimension-fields"><label>{lang === "zh" ? "同径孔径" : "EQUAL BORE DIA."}<select aria-label={lang === "zh" ? "平行夹孔径" : "PARALLEL CLAMP BORE DIAMETER"} value={variant.boreDiameter} onChange={(event) => updateParallelClampParameter("hole1Diameter", Number(event.target.value))}>{parallelClampDiameterOptions().map((diameter) => <option value={diameter} key={diameter}>Ø{diameter} × Ø{diameter} mm</option>)}</select></label><label>{lang === "zh" ? "中心距" : "CENTER DISTANCE"}<select aria-label={lang === "zh" ? "平行夹中心距" : "PARALLEL CLAMP CENTER DISTANCE"} value={variant.holeCenterDistance} onChange={(event) => updateParallelClampParameter("holeCenterDistance", Number(event.target.value))}>{parallelClampCenterDistanceOptions(variant.boreDiameter).map((distance) => <option value={distance} key={distance}>{distance} mm</option>)}</select></label></div><dl className="equal-bore-derived-specs"><div><dt>{lang === "zh" ? "长" : "LENGTH"}</dt><dd>{variant.length} mm</dd></div><div><dt>{lang === "zh" ? "宽" : "WIDTH"}</dt><dd>{variant.width} mm</dd></div><div><dt>{lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{variant.height} mm</dd></div><div><dt>{lang === "zh" ? "适用螺丝" : "FASTENER"}</dt><dd>{variant.screw}</dd></div></dl></div>; })()}
                  {draft.equalBoreCrossClampDiameter !== undefined && (() => { const variant = resolveEqualBoreCrossClampVariant(draft.equalBoreCrossClampDiameter); return <div className="equal-bore-cross-clamp-parameters"><p className="parameter-family-hint">{lang === "zh" ? "型号对应两个相同孔径；选择型号后 A/B/C 外形和 D 孔距按规格表自动同步。" : "THE MODEL DEFINES TWO EQUAL BORES; A/B/C AND PITCH D FOLLOW THE STOCK TABLE."}</p><label className="equal-bore-model-field">{lang === "zh" ? "型号（孔径 × 孔径）" : "MODEL (BORE × BORE)"}<select aria-label={lang === "zh" ? "同径双孔十字夹型号" : "EQUAL-BORE CROSS-CLAMP MODEL"} value={variant.diameter} onChange={(event) => updateEqualBoreCrossClampModel(Number(event.target.value))}>{equalBoreCrossClampVariants.map(({ diameter }) => <option value={diameter} key={diameter}>{diameter}×{diameter}</option>)}</select></label><dl className="equal-bore-derived-specs"><div><dt>A · {lang === "zh" ? "长" : "LENGTH"}</dt><dd>{variant.length} mm</dd></div><div><dt>B · {lang === "zh" ? "宽" : "WIDTH"}</dt><dd>{variant.width} mm</dd></div><div><dt>C · {lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{variant.height} mm</dd></div><div><dt>D · {lang === "zh" ? "孔距" : "PITCH"}</dt><dd>{variant.holeCenterDistance} mm</dd></div></dl></div>; })()}
                  {draft.roundFixedBaseInnerDiameter !== undefined && (() => { const variant = resolveRoundFixedBaseVariant(draft.roundFixedBaseInnerDiameter); return <div className="round-fixed-base-parameters"><p className="parameter-family-hint">{lang === "zh" ? "只需选择内径；外径、凸台、厚度、安装孔距和孔径按库存尺寸整组匹配。" : "SELECT THE INNER DIAMETER; ALL OTHER STOCK DIMENSIONS UPDATE AS ONE SET."}</p><label className="equal-bore-model-field">{lang === "zh" ? "内径" : "INNER DIAMETER"}<select aria-label={lang === "zh" ? "圆形固定底座内径" : "ROUND FIXED BASE INNER DIAMETER"} value={variant.innerDiameter} onChange={(event) => updateRoundFixedBaseInnerDiameter(Number(event.target.value))}>{roundFixedBaseVariants.map(({ innerDiameter }) => <option value={innerDiameter} key={innerDiameter}>Ø{innerDiameter} mm</option>)}</select></label><dl className="equal-bore-derived-specs"><div><dt>{lang === "zh" ? "法兰外径" : "FLANGE OD"}</dt><dd>Ø{variant.flangeDiameter} mm</dd></div><div><dt>{lang === "zh" ? "凸台直径" : "BOSS OD"}</dt><dd>Ø{variant.bossDiameter} mm</dd></div><div><dt>{lang === "zh" ? "凸台长度" : "HUB LENGTH"}</dt><dd>{variant.hubProjection} mm</dd></div><div><dt>{lang === "zh" ? "法兰厚度" : "FLANGE T"}</dt><dd>{variant.flangeThickness} mm</dd></div><div><dt>{lang === "zh" ? "安装孔距" : "MOUNT PCD"}</dt><dd>{variant.mountingHolePcd} mm</dd></div><div><dt>{lang === "zh" ? "安装孔径" : "MOUNT HOLE"}</dt><dd>Ø{variant.mountingHoleDiameter} mm</dd></div><div><dt>{lang === "zh" ? "紧定螺钉" : "SET SCREW"}</dt><dd>{variant.setScrew}</dd></div></dl></div>; })()}
                  {draft.verticalFixedBaseShaftDiameter !== undefined && (() => { const variant = resolveVerticalFixedBaseVariant(draft.verticalFixedBaseShaftDiameter); return <div className="vertical-fixed-base-parameters"><p className="parameter-family-hint">{lang === "zh" ? "选择 SK 型号后，轴径、H/E/W/L/F/G/P/B/S、螺栓与重量按规格表整组同步。" : "SELECT AN SK MODEL; ALL DIMENSIONS, FASTENERS, WEIGHT, GEOMETRY, AND PORTS FOLLOW ITS STOCK ROW."}</p><label className="equal-bore-model-field">{lang === "zh" ? "型号（轴径）" : "MODEL (SHAFT DIA.)"}<select aria-label={lang === "zh" ? "立式固定座型号" : "VERTICAL FIXED BASE MODEL"} value={variant.model} onChange={(event) => updateVerticalFixedBaseModel(event.target.value)}>{verticalFixedBaseVariants.map(({ model, shaftDiameter }) => <option value={model} key={model}>{model} · Ø{shaftDiameter} mm</option>)}</select></label><dl className="equal-bore-derived-specs"><div><dt>{lang === "zh" ? "轴径" : "SHAFT DIA."}</dt><dd>Ø{variant.shaftDiameter} mm</dd></div><div><dt>H · {lang === "zh" ? "轴心高" : "CENTER H"}</dt><dd>{variant.h} mm</dd></div><div><dt>E · {lang === "zh" ? "上座宽" : "TOP W"}</dt><dd>{variant.e} mm</dd></div><div><dt>W · {lang === "zh" ? "总宽" : "WIDTH"}</dt><dd>{variant.w} mm</dd></div><div><dt>L · {lang === "zh" ? "深度" : "DEPTH"}</dt><dd>{variant.l} mm</dd></div><div><dt>F · {lang === "zh" ? "总高" : "HEIGHT"}</dt><dd>{variant.f} mm</dd></div><div><dt>G · {lang === "zh" ? "底厚" : "BASE T"}</dt><dd>{variant.g} mm</dd></div><div><dt>P · {lang === "zh" ? "立座宽" : "PEDESTAL W"}</dt><dd>{variant.p} mm</dd></div><div><dt>B · {lang === "zh" ? "安装孔距" : "MOUNT PITCH"}</dt><dd>{variant.b} mm</dd></div><div><dt>S · {lang === "zh" ? "安装孔径" : "MOUNT HOLE"}</dt><dd>Ø{variant.s} mm</dd></div><div><dt>{lang === "zh" ? "锁紧 / 安装螺栓" : "LOCK / MOUNT BOLT"}</dt><dd>{variant.lockingBolt} / {variant.mountingBolt}</dd></div><div><dt>{lang === "zh" ? "重量" : "WEIGHT"}</dt><dd>{variant.weightKg.toFixed(3)} kg</dd></div></dl></div>; })()}
                  {draft.pegboardParameters && <div className="pegboard-hole-parameters"><p className="parameter-family-hint">{lang === "zh" ? "洞洞板孔阵支持调整孔径、孔距和边距，3D模型与孔数自动更新。" : "ADJUST HOLE DIAMETER, PITCH, AND EDGE MARGIN; 3D GEOMETRY AND HOLE COUNT UPDATE AUTOMATICALLY."}</p><div className="dimension-fields"><label>{lang === "zh" ? "孔径" : "HOLE DIAMETER"}<input aria-label={lang === "zh" ? "洞洞板孔径" : "PEGBOARD HOLE DIAMETER"} type="number" min="1" step="0.5" value={draft.pegboardParameters.holeDiameter} onChange={(event) => updatePegboardParameter("holeDiameter", Number(event.target.value))} /><span>mm</span></label><label>{lang === "zh" ? "孔距" : "HOLE PITCH"}<input aria-label={lang === "zh" ? "洞洞板孔距" : "PEGBOARD HOLE PITCH"} type="number" min={draft.pegboardParameters.holeDiameter + 1} step="1" value={draft.pegboardParameters.holePitch} onChange={(event) => updatePegboardParameter("holePitch", Number(event.target.value))} /><span>mm</span></label><label>{lang === "zh" ? "边距" : "EDGE MARGIN"}<input aria-label={lang === "zh" ? "洞洞板边距" : "PEGBOARD EDGE MARGIN"} type="number" min={draft.pegboardParameters.holeDiameter / 2} step="1" value={draft.pegboardParameters.edgeMargin} onChange={(event) => updatePegboardParameter("edgeMargin", Number(event.target.value))} /><span>mm</span></label></div></div>}
                  {!draft.parameters && !draft.shaftParameters && !draft.parallelClampParameters && draft.equalBoreCrossClampDiameter === undefined && draft.equalBoreTClampDiameter === undefined && draft.roundFixedBaseInnerDiameter === undefined && draft.verticalFixedBaseShaftDiameter === undefined && <div className="dimension-fields">{(["width", "length", "height"] as const).map((axis) => <label key={axis}>{axis.toUpperCase()}<input type="number" min="1" value={draft.dimensions[axis]} onChange={(event) => setDraft({ ...draft, dimensions: { ...draft.dimensions, [axis]: Number(event.target.value) } })} /><span>mm</span></label>)}</div>}
                  {draft.shaftParameters && <div className="dimension-fields"><label>{lang === "zh" ? "直径" : "DIAMETER"}<select value={draft.shaftParameters.diameter} onChange={(event) => { const diameter = Number(event.target.value); setDraft({ ...draft, model: `SHAFT-${diameter}-${draft.shaftParameters!.length}`, shaftParameters: { ...draft.shaftParameters!, diameter }, compatibleRod: `Ø${diameter} mm`, dimensions: { ...draft.dimensions, width: diameter, height: diameter } }); }}>{shaftDiameterOptions.map((diameter) => <option key={diameter} value={diameter}>Ø{diameter} mm</option>)}</select></label><label>{lang === "zh" ? "长度" : "LENGTH"}<input type="number" min="10" max="6000" step="10" value={draft.shaftParameters.length} onChange={(event) => { const length = Math.max(10, Number(event.target.value)); setDraft({ ...draft, model: `SHAFT-${draft.shaftParameters!.diameter}-${length}`, shaftParameters: { ...draft.shaftParameters!, length }, dimensions: { ...draft.dimensions, length } }); }} /><span>mm</span></label></div>}
                  {draft.parameters && (() => { const variant = resolveShaftStopVariant(draft.parameters); return <div className="shaft-stop-parameters"><p className="parameter-family-hint">{lang === "zh" ? `只选择内径和该内径对应的有效厚度；外径、螺纹、通孔、沉孔和开口按 ${shaftStopVariants.length} 个库存规格整组同步。` : `SELECT AN INNER DIAMETER AND VALID THICKNESS; THE OUTER DIAMETER, THREAD, THROUGH HOLE, COUNTERBORE, AND SLIT FOLLOW ONE OF ${shaftStopVariants.length} STOCK ROWS.`}</p><div className="dimension-fields"><label>{lang === "zh" ? "内径" : "INNER DIAMETER"}<select aria-label={lang === "zh" ? "限位器内径" : "SHAFT STOP INNER DIAMETER"} value={variant.innerDiameter} onChange={(event) => updateFixedRingParameter("innerDiameter", Number(event.target.value))}>{shaftStopInnerDiameterOptions().map((diameter) => <option key={diameter} value={diameter}>Ø{diameter} mm</option>)}</select></label><label>{lang === "zh" ? "厚度" : "THICKNESS"}<select aria-label={lang === "zh" ? "限位器厚度" : "SHAFT STOP THICKNESS"} value={variant.thickness} onChange={(event) => updateFixedRingParameter("thickness", Number(event.target.value))}>{shaftStopThicknessOptions(variant.innerDiameter).map((thickness) => <option key={thickness} value={thickness}>{thickness} mm</option>)}</select></label></div><dl className="equal-bore-derived-specs"><div><dt>D1 · {lang === "zh" ? "外径" : "OUTER DIA."}</dt><dd>Ø{variant.outerDiameter} mm</dd></div><div><dt>M · {lang === "zh" ? "粗螺纹" : "THREAD"}</dt><dd>{variant.thread}</dd></div><div><dt>d · {lang === "zh" ? "通孔" : "THROUGH HOLE"}</dt><dd>Ø{variant.throughHoleDiameter} mm</dd></div><div><dt>H · {lang === "zh" ? "沉孔" : "COUNTERBORE"}</dt><dd>Ø{variant.counterboreDiameter} mm</dd></div><div><dt>X · {lang === "zh" ? "螺钉中心偏移" : "SCREW OFFSET"}</dt><dd>{variant.screwCenterOffset} mm</dd></div><div><dt>Y · {lang === "zh" ? "沉孔深度" : "COUNTERBORE DEPTH"}</dt><dd>{variant.counterboreDepth} mm</dd></div><div><dt>W · {lang === "zh" ? "开口宽" : "SLIT WIDTH"}</dt><dd>{variant.slitWidth} mm</dd></div></dl></div>; })()}
                </section>
                <section className="component-usage-section component-editor-inspector-group"><div className="component-editor-group-title"><WandSparkles size={15} /><div><span>03</span><h3>{lang === "zh" ? "用途与智能设计" : "USAGE & SMART DESIGN"}</h3></div></div><div className="usage-option-grid">{componentUsageOptions.map((tag) => { const active = normalizeUsageTags(draft.kind, draft.usageTags).includes(tag); return <button type="button" key={tag} className={active ? "active" : ""} onClick={() => toggleDraftUsage(tag)}>{usageLabel(tag, lang)}</button>; })}</div><p>{lang === "zh" ? "用途用于匹配框架、承托、限位、壁装和滑动结构。" : "Usage guides frame, support, stop, wall-mount, and motion patterns."}</p></section>
                <section className="component-editor-inspector-group component-editor-assembly-group"><div className="component-editor-group-title"><Target size={15} /><div><span>04</span><h3>{lang === "zh" ? "连接与智能吸附" : "ASSEMBLY & SMART SNAP"}</h3></div></div>
                  {draft.kind === "joint" && !draft.parameters && !draft.parallelClampParameters && draft.equalBoreCrossClampDiameter === undefined && draft.equalBoreTClampDiameter === undefined && draft.roundFixedBaseInnerDiameter === undefined && draft.verticalFixedBaseShaftDiameter === undefined && <div className="smart-port-section"><div className="smart-port-heading"><div><p>{lang === "zh" ? "端口中心、轴向和孔径直接参与自动吸附校验。" : "Port center, axis, and diameter drive automatic snapping."}</p></div><strong>{draft.geometry.ports.filter(isShaftAssemblyPort).length}</strong></div><div className="smart-port-list">{draft.geometry.ports.filter(isShaftAssemblyPort).map((port) => <div className="smart-port-row" key={port.id}><div className="smart-port-id"><i /><strong>{port.id}</strong><span>{port.kind}</span></div><div className="smart-port-fields"><label>{lang === "zh" ? "轴向" : "AXIS"}<select aria-label={`${port.id} axis`} value={port.axis} onChange={(event) => updateDraftPort(port.id, { axis: event.target.value as ComponentPort["axis"] })}>{(["x", "y", "z"] as const).map((axis) => <option key={axis} value={axis}>{axis.toUpperCase()}</option>)}</select></label><label>{lang === "zh" ? "行为" : "BEHAVIOR"}<select aria-label={`${port.id} behavior`} value={port.behavior} onChange={(event) => updateDraftPort(port.id, { behavior: event.target.value as PortBehavior })}><option value="fixed">FIXED</option><option value="slide">SLIDE</option><option value="stop">STOP</option></select></label><label>{lang === "zh" ? "孔径" : "DIAMETER"}<input aria-label={`${port.id} diameter`} type="number" min="0.1" step="0.1" value={port.diameter} onChange={(event) => updateDraftPort(port.id, { diameter: Number(event.target.value) })} /><span>mm</span></label><label>{lang === "zh" ? "容差" : "TOLERANCE"}<input aria-label={`${port.id} tolerance`} type="number" min="0" step="0.05" value={port.toleranceMm} onChange={(event) => updateDraftPort(port.id, { toleranceMm: Number(event.target.value) })} /><span>mm</span></label><label>{lang === "zh" ? "容量" : "CAPACITY"}<input aria-label={`${port.id} capacity`} type="number" min="1" step="1" value={port.capacity} onChange={(event) => updateDraftPort(port.id, { capacity: Math.max(1, Number(event.target.value)) })} /></label></div><div className="smart-port-position">{(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis}>{lang === "zh" ? `局部 ${axis}` : `LOCAL ${axis}`}<input aria-label={`${port.id} position ${axis}`} type="number" step="0.01" value={port.position[index]} onChange={(event) => { const position = [...port.position] as Vec3Tuple; position[index] = Number(event.target.value); updateDraftPort(port.id, { position }); }} /></label>)}</div></div>)}</div></div>}
                  {draft.parallelClampParameters ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：P1 Ø${draft.parallelClampParameters.hole1Diameter} mm / P2 Ø${draft.parallelClampParameters.hole2Diameter} mm · 孔距 ${draft.parallelClampParameters.holeCenterDistance} mm` : `AUTO-SYNCED: P1 Ø${draft.parallelClampParameters.hole1Diameter} MM / P2 Ø${draft.parallelClampParameters.hole2Diameter} MM · PITCH ${draft.parallelClampParameters.holeCenterDistance} MM`}</p></div> : draft.equalBoreCrossClampDiameter !== undefined ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：P1 / P2 均为 Ø${draft.equalBoreCrossClampDiameter} mm · ${draft.connector}` : `AUTO-SYNCED: P1 / P2 Ø${draft.equalBoreCrossClampDiameter} MM · ${draft.connector}`}</p></div> : draft.equalBoreTClampDiameter !== undefined ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：P1 / P2 均为 Ø${draft.equalBoreTClampDiameter} mm · ${draft.connector}` : `AUTO-SYNCED: P1 / P2 Ø${draft.equalBoreTClampDiameter} MM · ${draft.connector}`}</p></div> : draft.parameters ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：限位孔 Ø${draft.parameters.innerDiameter} mm · ${draft.connector}` : `AUTO-SYNCED: STOP BORE Ø${draft.parameters.innerDiameter} MM · ${draft.connector}`}</p></div> : draft.roundFixedBaseInnerDiameter !== undefined ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：光轴孔 Ø${draft.roundFixedBaseInnerDiameter} mm · ${draft.connector}` : `AUTO-SYNCED: SHAFT BORE Ø${draft.roundFixedBaseInnerDiameter} MM · ${draft.connector}`}</p></div> : draft.verticalFixedBaseShaftDiameter !== undefined ? <div className="parallel-clamp-derived" aria-label={lang === "zh" ? "自动同步的装配信息" : "AUTOMATIC ASSEMBLY INFORMATION"}><p className="parameter-family-hint">{lang === "zh" ? `自动同步：${draft.model} · 光轴孔 Ø${draft.verticalFixedBaseShaftDiameter} mm · ${draft.connector}` : `AUTO-SYNCED: ${draft.model} · SHAFT BORE Ø${draft.verticalFixedBaseShaftDiameter} MM · ${draft.connector}`}</p></div> : <div className="component-editor-compatibility"><label>{lang === "zh" ? "适配光轴" : "COMPATIBLE ROD"}<input value={draft.compatibleRod} onChange={(event) => setDraft({ ...draft, compatibleRod: event.target.value })} /></label><label>{labels.interface}<input value={draft.connector} onChange={(event) => setDraft({ ...draft, connector: event.target.value })} /></label></div>}
                </section>
                <section className={`model-fidelity-panel component-editor-inspector-group ${draft.modelAssetUrl ? "imported" : "approximate"}`}><div className="component-editor-group-title"><Download size={15} /><div><span>05</span><h3>{lang === "zh" ? "模型文件" : "MODEL FILE"}</h3></div></div>
                  <div className="model-fidelity-summary">
                    <strong>{draft.modelAssetUrl ? (lang === "zh" ? "已导入外部3D模型" : "IMPORTED 3D MODEL") : (lang === "zh" ? "系统几何模型" : "SYSTEM GEOMETRY")}</strong>
                    <span>{draft.modelAssetName ?? (lang === "zh" ? "导出 GLB 后可在 Blender 中优化并重新导入。" : "Export GLB, refine in Blender, and reimport.")}</span>
                  </div>
                  <div className="model-file-actions">
                    <button type="button" disabled={!exportObjectReady || glbExportStatus === "exporting"} aria-label={lang === "zh" ? "导出 GLB" : "EXPORT GLB"} onClick={handleComponentGlbExport}><Download size={15} />{glbExportStatus === "exporting" ? (lang === "zh" ? "正在导出" : "EXPORTING") : (lang === "zh" ? "导出 GLB" : "EXPORT GLB")}</button>
                    <label><input aria-label={lang === "zh" ? "重新导入 GLB 或 GLTF" : "REIMPORT GLB OR GLTF"} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; setGlbExportStatus("idle"); setGlbExportResult(null); setDraft({ ...draft, modelAssetUrl: URL.createObjectURL(file), modelAssetName: file.name, status: "review" }); }} /><FileOutput size={15} />{lang === "zh" ? "重新导入" : "REIMPORT"}</label>
                  </div>
                  <p className={`glb-export-status ${glbExportStatus}`} role="status" aria-live="polite">
                    {glbExportStatus === "exporting" ? (lang === "zh" ? "正在生成二进制 GLB 文件…" : "GENERATING BINARY GLB…") : glbExportStatus === "success" && glbExportResult ? (lang === "zh" ? `已导出 ${glbExportResult.filename} · ${Math.max(1, Math.round(glbExportResult.byteLength / 1024))} KB` : `EXPORTED ${glbExportResult.filename} · ${Math.max(1, Math.round(glbExportResult.byteLength / 1024))} KB`) : glbExportStatus === "error" ? (lang === "zh" ? "GLB 导出失败，请等待模型加载完成后重试。" : "GLB EXPORT FAILED. WAIT FOR THE MODEL AND TRY AGAIN.") : exportObjectReady ? (lang === "zh" ? "米制 GLB · 原点居中 · 保留装配元数据" : "METER-BASED GLB · CENTERED ORIGIN · ASSEMBLY METADATA") : (lang === "zh" ? "正在准备可导出的 3D 模型…" : "PREPARING EXPORTABLE 3D MODEL…")}
                  </p>
                </section>
              </div>
              <div className="component-form-actions component-editor-inspector-actions"><button type="button" aria-label={labels.cancel} onClick={() => setEditorMode(null)}>{labels.cancel}</button><button className="primary-button" type="button" onClick={saveDraft}><Save size={16} />{labels.save}</button></div>
            </aside>
          </div>
        )}
      </div>}
      {referencePreviewPart?.referenceUrl && <div className="modal-backdrop component-reference-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReferencePreviewPart(null); }}>
        <section className="component-reference-dialog" role="dialog" aria-modal="true" aria-labelledby="component-reference-title">
          <DialogFocusTrap onEscape={() => setReferencePreviewPart(null)} />
          <header><div><span>{lang === "zh" ? "组件资料" : "COMPONENT REFERENCE"}</span><h2 id="component-reference-title">{referencePreviewPart.name}</h2><p>{referencePreviewPart.model}</p></div><button type="button" aria-label={lang === "zh" ? "关闭资料预览" : "CLOSE REFERENCE PREVIEW"} onClick={() => setReferencePreviewPart(null)}><X size={17} /></button></header>
          <div className="component-reference-media">
            {isLocalReferenceImage(referencePreviewPart.referenceUrl)
              ? <img src={referencePreviewPart.referenceUrl} alt={`${referencePreviewPart.name} ${lang === "zh" ? "资料预览" : "reference preview"}`} />
              : <ComponentListPreview part={referencePreviewPart} />}
          </div>
          <div className="component-reference-meta"><span>{labels.reference}</span><strong>{referencePreviewPart.referenceLabel}</strong><p>{isLocalReferenceImage(referencePreviewPart.referenceUrl) ? (lang === "zh" ? "当前显示用户提供的实物参考图。" : "Showing the supplied physical reference image.") : (lang === "zh" ? "当前显示组件的已生成 3D 预览；可打开资料原页核对厂商信息。" : "Showing the generated 3D preview. Open the source page to verify manufacturer information.")}</p></div>
          <footer><button type="button" onClick={() => setReferencePreviewPart(null)}>{labels.cancel}</button><a href={referencePreviewPart.referenceUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} />{lang === "zh" ? "打开资料原页" : "OPEN SOURCE"}</a></footer>
        </section>
      </div>}
      {deleteCandidate && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteCandidate(null); }}>
        <section className="confirm-dialog component-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="component-delete-title" aria-describedby="component-delete-description">
          <DialogFocusTrap onEscape={() => setDeleteCandidate(null)} />
          <div className="confirm-dialog-icon"><Trash2 size={20} /></div>
          <h2 id="component-delete-title">{lang === "zh" ? "删除组件" : "DELETE COMPONENT"}</h2>
          <p id="component-delete-description">{lang === "zh" ? "组件将从当前组件库移除，已有设计中的组件实例不会被删除。" : "This component will be removed from the current library. Existing instances in designs will remain."}</p>
          <div className="delete-impact-list"><strong>{deleteCandidate.name}</strong><span>{deleteCandidate.model}</span></div>
          <div className="confirm-dialog-actions"><button type="button" autoFocus onClick={() => setDeleteCandidate(null)}>{labels.cancel}</button><button className="danger" type="button" onClick={confirmComponentDelete}><Trash2 size={14} />{labels.delete}</button></div>
        </section>
      </div>}
    </div>
  );
}

function TopBar({
  lang,
  theme,
  projectName,
  dimensions,
  isEmpty,
  saveStatus,
  canUndo,
  canRedo,
  onToggleLang,
  onToggleTheme,
  onOpenHelp,
  onSave,
  onUndo,
  onRedo,
  onExport,
  onExportJson,
  exporting,
}: {
  lang: Lang;
  theme: Theme;
  projectName: string;
  dimensions: FrameDimensions;
  isEmpty: boolean;
  saveStatus: "saved" | "unsaved" | "saving" | "failed";
  canUndo: boolean;
  canRedo: boolean;
  onToggleLang: () => void;
  onToggleTheme: () => void;
  onOpenHelp: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onExportJson: () => void;
  exporting: boolean;
}) {
  const t = copy[lang];

  return (
    <header className="top-bar">
      <div className="project-title">
        <div className="app-name">{t.appName}</div>
        <div className="project-meta">
          <span>{projectName || (isEmpty ? t.blankProjectName : t.projectName)}</span>
          <span>{dimensions.width} × {dimensions.depth} × {dimensions.height} MM</span>
          <span>{isEmpty ? t.blankTemplateName : t.templateName}</span>
        </div>
      </div>
      <div className="top-actions">
        <button
          className="save-status-button"
          type="button"
          title={lang === "zh" ? "自动保存已开启；点击可命名并保存到项目列表" : "Auto-save is on; click to name and save to the project list"}
          onClick={onSave}
        >
          <Save size={14} />
          <Badge tone={saveStatus === "saved" ? "success" : saveStatus === "failed" ? "danger" : "warning"}>
            {saveStatus === "saved"
              ? t.autoSaved
              : saveStatus === "saving"
                ? t.autoSaving
                : saveStatus === "failed"
                  ? t.saveFailed
                  : t.unsaved}
          </Badge>
        </button>
        <Badge tone="success">{t.bomSynced}</Badge>
        <button className="icon-button language-toggle" type="button" onClick={onToggleLang}>
          <Languages size={16} />
          <span>{t.language}</span>
        </button>
        <button className="icon-button theme-toggle" type="button" title={theme === "dark" ? (lang === "zh" ? "切换到浅色模式" : "SWITCH TO LIGHT MODE") : (lang === "zh" ? "切换到深色模式" : "SWITCH TO DARK MODE")} aria-label={theme === "dark" ? "Light mode" : "Dark mode"} onClick={onToggleTheme}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className="icon-button help-button"
          type="button"
          title={lang === "zh" ? "快捷键与鼠标操作帮助" : "KEYBOARD AND MOUSE HELP"}
          aria-label={lang === "zh" ? "操作帮助" : "CONTROLS HELP"}
          onClick={onOpenHelp}
        >
          <CircleHelp size={17} />
        </button>
        <button className="icon-button" type="button" aria-label="Undo" disabled={!canUndo} onClick={onUndo}>
          <RotateCcw size={16} />
          <span>{t.undo}</span>
        </button>
        <button className="icon-button" type="button" aria-label="Redo" disabled={!canRedo} onClick={onRedo}>
          <RotateCw size={16} />
          <span>{t.redo}</span>
        </button>
        <button className="icon-button export-json-button" type="button" title={t.exportJson} aria-label={t.exportJson} onClick={onExportJson}>
          <FileJson size={16} />
          <span>{t.exportJson}</span>
        </button>
        <button className="primary-button" type="button" onClick={onExport} disabled={exporting}>
          <Download size={15} />
          <span>{exporting ? t.exporting : t.export}</span>
        </button>
      </div>
    </header>
  );
}

type HelpEntry = {
  keys: string[];
  combine?: boolean;
  zh: string;
  en: string;
};

const keyboardHelpEntries: HelpEntry[] = [
  { keys: ["G", "R", "S"], zh: "切换移动、旋转、缩放工具", en: "SWITCH MOVE, ROTATE, AND SCALE TOOLS" },
  { keys: ["V", "B"], zh: "切换点击选择、框选模式", en: "SWITCH CLICK AND BOX SELECTION" },
  { keys: ["0", "1", "2", "3"], zh: "透视、前视、侧视、顶视", en: "PERSPECTIVE, FRONT, SIDE, AND TOP VIEWS" },
  { keys: ["F"], zh: "聚焦当前选中组件", en: "FOCUS THE SELECTED COMPONENT" },
  { keys: ["D"], zh: "复制选中组件或编组", en: "DUPLICATE THE SELECTION OR GROUP" },
  { keys: ["H", "L"], zh: "隐藏 / 显示、锁定 / 解锁选中项", en: "HIDE / SHOW AND LOCK / UNLOCK SELECTION" },
  { keys: ["⌘/Ctrl", "A"], combine: true, zh: "选择全部可见组件", en: "SELECT ALL VISIBLE COMPONENTS" },
  { keys: ["⌘/Ctrl", "C"], combine: true, zh: "复制选中组件", en: "COPY THE SELECTION" },
  { keys: ["⌘/Ctrl", "V"], combine: true, zh: "粘贴已复制组件", en: "PASTE COPIED COMPONENTS" },
  { keys: ["⌘/Ctrl", "D"], combine: true, zh: "复制选中组件或编组", en: "DUPLICATE THE SELECTION OR GROUP" },
  { keys: ["⌘/Ctrl", "G"], combine: true, zh: "将多选组件建立编组", en: "GROUP THE MULTI-SELECTION" },
  { keys: ["⌘/Ctrl", "S"], combine: true, zh: "保存并命名当前项目", en: "SAVE AND NAME THE CURRENT PROJECT" },
  { keys: ["⌘/Ctrl", "Z"], combine: true, zh: "撤销上一步操作", en: "UNDO THE LAST ACTION" },
  { keys: ["⌘/Ctrl", "Shift", "Z"], combine: true, zh: "重做上一步操作", en: "REDO THE LAST ACTION" },
  { keys: ["Delete"], zh: "打开删除选中组件确认框", en: "OPEN DELETE CONFIRMATION FOR SELECTION" },
  { keys: ["Esc"], zh: "关闭弹窗、菜单或退出隔离状态", en: "CLOSE DIALOGS / MENUS OR EXIT ISOLATION" },
];

const mouseHelpEntries: HelpEntry[] = [
  { keys: ["左键单击"], zh: "选择组件；单击空白处清除选择", en: "SELECT A COMPONENT; CLICK EMPTY SPACE TO CLEAR" },
  { keys: ["Shift", "左键单击"], combine: true, zh: "追加或移除多选组件", en: "ADD OR REMOVE A COMPONENT FROM SELECTION" },
  { keys: ["左键拖拽"], zh: "在画布空白处旋转观察视角", en: "ORBIT THE CAMERA FROM EMPTY CANVAS SPACE" },
  { keys: ["Shift/Ctrl/⌘", "左键拖拽"], combine: true, zh: "平移观察视角", en: "PAN THE CAMERA VIEW" },
  { keys: ["滚轮"], zh: "缩放观察视角", en: "ZOOM THE CAMERA VIEW" },
  { keys: ["右键"], zh: "打开组件或画布快捷操作菜单", en: "OPEN COMPONENT OR CANVAS CONTEXT ACTIONS" },
  { keys: ["拖拽变换轴"], zh: "按当前工具移动、旋转或缩放选中项", en: "MOVE, ROTATE, OR SCALE WITH THE ACTIVE TOOL" },
  { keys: ["Alt/Option", "拖拽变换轴"], combine: true, zh: "保留原件并拖拽复制", en: "KEEP THE ORIGINAL AND DRAG A DUPLICATE" },
  { keys: ["框选模式", "左键拖拽"], combine: true, zh: "拖出选择框并批量选择组件", en: "DRAW A MARQUEE TO SELECT MULTIPLE COMPONENTS" },
  { keys: ["拖拽端点/边缘"], zh: "调整光轴长度或层板外形尺寸", en: "RESIZE SHAFT LENGTH OR PANEL ENVELOPE" },
];

function EditorHelpDialog({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const isZh = lang === "zh";
  const renderEntries = (entries: HelpEntry[]) => entries.map((entry, index) => (
    <li key={`${entry.keys.join("-")}-${index}`}>
      <div className="help-key-sequence" aria-label={entry.keys.join(" + ")}>
        {entry.keys.map((key, keyIndex) => (
          <span key={`${key}-${keyIndex}`}>
            {keyIndex > 0 && <i aria-hidden="true">{entry.combine ? "+" : "/"}</i>}
            <kbd>{key}</kbd>
          </span>
        ))}
      </div>
      <p>{isZh ? entry.zh : entry.en}</p>
    </li>
  ));

  return (
    <div className="modal-backdrop help-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-help-title" aria-describedby="editor-help-description">
        <DialogFocusTrap onEscape={onClose} />
        <header>
          <div className="help-dialog-title">
            <span>{isZh ? "设计器操作指南" : "DESIGNER CONTROLS"}</span>
            <h2 id="editor-help-title">{isZh ? "快捷键与鼠标操作" : "KEYBOARD & MOUSE CONTROLS"}</h2>
            <p id="editor-help-description">{isZh ? "快速查找设计、选择、视角和变换操作。" : "A QUICK REFERENCE FOR DESIGN, SELECTION, CAMERA, AND TRANSFORM CONTROLS."}</p>
          </div>
          <button type="button" aria-label={isZh ? "关闭操作帮助" : "CLOSE CONTROLS HELP"} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="help-dialog-body">
          <section aria-labelledby="keyboard-help-title">
            <div className="help-section-heading">
              <Keyboard size={18} />
              <div>
                <span>KEYBOARD</span>
                <h3 id="keyboard-help-title">{isZh ? "键盘快捷键" : "KEYBOARD SHORTCUTS"}</h3>
              </div>
            </div>
            <ul>{renderEntries(keyboardHelpEntries)}</ul>
          </section>
          <section aria-labelledby="mouse-help-title">
            <div className="help-section-heading">
              <MousePointer2 size={18} />
              <div>
                <span>MOUSE</span>
                <h3 id="mouse-help-title">{isZh ? "鼠标操作" : "MOUSE CONTROLS"}</h3>
              </div>
            </div>
            <ul>{renderEntries(mouseHelpEntries)}</ul>
          </section>
        </div>
        <footer>
          <p>{isZh ? "提示：输入框获得焦点时，单键快捷键不会触发。" : "TIP: SINGLE-KEY SHORTCUTS ARE DISABLED WHILE TYPING IN A FIELD."}</p>
          <button className="primary-button" type="button" onClick={onClose}>{isZh ? "知道了" : "GOT IT"}</button>
        </footer>
      </section>
    </div>
  );
}

type StructureGroup = {
  id: string;
  label: LocalizedText;
  icon: typeof Layers3;
  partIds: string[];
  warning?: boolean;
};

const structureGroups: StructureGroup[] = [
  {
    id: "rods",
    label: { en: "FRAME RODS", zh: "框架杆件" },
    icon: Layers3,
    partIds: rods.map(([id]) => id),
  },
  {
    id: "panels",
    label: { en: "PANELS", zh: "层板" },
    icon: Grid3X3,
    partIds: panels.map(({ id }) => id),
  },
  {
    id: "joints",
    label: { en: "SPLIT CROSS CONNECTORS", zh: "十字型连接件" },
    icon: Target,
    partIds: joints.map(({ id }) => id),
  },
  {
    id: "risks",
    label: { en: "RISKS", zh: "风险" },
    icon: TriangleAlert,
    partIds: joints.filter(({ warning }) => warning).map(({ id }) => id),
    warning: true,
  },
];

function StructurePanel({
  lang,
  selectedIds,
  addedParts,
  userGroups,
  resolvedRiskIds,
  deletedIds,
  hiddenIds,
  lockedIds,
  isolatedIds,
  collapsed,
  onSelect,
  onSelectMany,
  onGroupSelection,
  onUngroup,
  onRenameGroup,
  onDuplicateSelection,
  onMirrorSelection,
  onToggleHidden,
  onToggleLocked,
  onToggleIsolation,
  onRequestDelete,
  onFocusSelection,
  onQuickFix,
  onToggleCollapsed,
}: {
  lang: Lang;
  selectedIds: string[];
  addedParts: AddedPart[];
  userGroups: UserGroup[];
  resolvedRiskIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  isolatedIds: ReadonlySet<string>;
  collapsed: boolean;
  onSelect: (id: string, additive?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onGroupSelection: () => void;
  onUngroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onDuplicateSelection: () => void;
  onMirrorSelection: () => void;
  onToggleHidden: () => void;
  onToggleLocked: () => void;
  onToggleIsolation: () => void;
  onRequestDelete: () => void;
  onFocusSelection: () => void;
  onQuickFix: (id: string) => void;
  onToggleCollapsed: () => void;
}) {
  const t = copy[lang];
  const [query, setQuery] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const cancelGroupRenameRef = useRef(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(["joints"]),
  );
  useEffect(() => {
    const latest = addedParts[addedParts.length - 1];
    if (!latest) return;
    const groupId = latest.kind === "rod" ? "rods" : latest.kind === "panel" ? "panels" : "joints";
    setExpandedGroups((current) => new Set(current).add(groupId));
  }, [addedParts]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = structureGroups
    .map((group) => {
      const addedPartIds = addedParts
        .filter(({ kind }) =>
          group.id === "rods"
            ? kind === "rod"
            : group.id === "panels"
              ? kind === "panel"
              : group.id === "joints"
                ? kind === "joint"
                : false,
        )
        .map(({ id }) => id);
      const eligiblePartIds = [...group.partIds, ...addedPartIds]
        .filter((id) => !deletedIds.has(id))
        .filter((id) => group.id !== "risks" || getPartInfo(id, lang, resolvedRiskIds).warning);
      return {
        ...group,
        partIds: eligiblePartIds,
        visiblePartIds: eligiblePartIds.filter((id) => {
      const part = getPartInfo(id, lang, resolvedRiskIds, addedParts);
          return `${id} ${part.title} ${part.componentId}`
            .toLowerCase()
            .includes(normalizedQuery);
        }),
      };
    })
    .filter((group) => !normalizedQuery || group.visiblePartIds.length > 0);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };
  const beginGroupRename = (group: UserGroup) => {
    cancelGroupRenameRef.current = false;
    setEditingGroupId(group.id);
    setGroupNameDraft(group.name);
  };
  const finishGroupRename = (group: UserGroup) => {
    if (cancelGroupRenameRef.current) {
      cancelGroupRenameRef.current = false;
      setEditingGroupId(null);
      setGroupNameDraft("");
      return;
    }
    const name = groupNameDraft.trim();
    setEditingGroupId(null);
    setGroupNameDraft("");
    if (name && name !== group.name) onRenameGroup(group.id, name);
  };
  const allSelectedHidden = selectedIds.length > 0 && selectedIds.every((id) => hiddenIds.has(id));
  const allSelectedLocked = selectedIds.length > 0 && selectedIds.every((id) => lockedIds.has(id));
  const selectionActionItems = [
    {
      id: "group",
      label: lang === "zh" ? "编组" : "GROUP",
      ariaLabel: t.groupSelection,
      hint: lang === "zh" ? "将选中的多个组件合并为一个编组，方便后续整体选择和操作。" : "Combine selected components into one group for batch selection and editing.",
      icon: Group,
      disabled: selectedIds.length < 2,
      onClick: onGroupSelection,
    },
    {
      id: "duplicate",
      label: lang === "zh" ? "复制" : "COPY",
      ariaLabel: t.duplicate,
      hint: lang === "zh" ? "复制选中的组件，并保留原有尺寸、角度、方向和材质。" : "Duplicate the selection while preserving size, rotation, direction, and material.",
      icon: Copy,
      onClick: onDuplicateSelection,
    },
    {
      id: "mirror",
      label: lang === "zh" ? "镜像" : "MIRROR",
      ariaLabel: t.mirrorDuplicate,
      hint: lang === "zh" ? "依据当前查看角度，将选中的组件镜像复制到设计的另一侧。" : "Mirror-duplicate the selection according to the current camera view.",
      icon: FlipHorizontal2,
      onClick: onMirrorSelection,
    },
    {
      id: "visibility",
      label: lang === "zh" ? (allSelectedHidden ? "显示" : "隐藏") : (allSelectedHidden ? "SHOW" : "HIDE"),
      ariaLabel: allSelectedHidden ? t.show : t.hide,
      hint: lang === "zh"
        ? (allSelectedHidden ? "恢复显示选中的组件。" : "临时隐藏选中的组件，不会从项目中删除。")
        : (allSelectedHidden ? "Show the selected components again." : "Temporarily hide the selection without deleting it."),
      icon: allSelectedHidden ? Eye : EyeOff,
      onClick: onToggleHidden,
    },
    {
      id: "lock",
      label: lang === "zh" ? (allSelectedLocked ? "解锁" : "锁定") : (allSelectedLocked ? "UNLOCK" : "LOCK"),
      ariaLabel: allSelectedLocked ? t.unlock : t.lock,
      hint: lang === "zh"
        ? (allSelectedLocked ? "解除锁定，允许再次移动和编辑选中的组件。" : "锁定选中的组件，防止误移动或修改。")
        : (allSelectedLocked ? "Unlock the selection for movement and editing." : "Lock the selection to prevent accidental edits."),
      icon: allSelectedLocked ? Unlock : Lock,
      onClick: onToggleLocked,
    },
    {
      id: "isolate",
      label: lang === "zh" ? (isolatedIds.size > 0 ? "解除" : "隔离") : (isolatedIds.size > 0 ? "EXIT" : "ISOLATE"),
      ariaLabel: isolatedIds.size > 0 ? t.clearIsolation : t.isolate,
      hint: lang === "zh"
        ? (isolatedIds.size > 0 ? "退出隔离模式，恢复显示其他组件。" : "只显示选中的组件，暂时隐藏其他组件。")
        : (isolatedIds.size > 0 ? "Exit isolation and restore other components." : "Show only the selection and hide all other components."),
      icon: Maximize2,
      active: isolatedIds.size > 0,
      onClick: onToggleIsolation,
    },
    {
      id: "focus",
      label: lang === "zh" ? "聚焦" : "FOCUS",
      ariaLabel: t.focus,
      hint: lang === "zh" ? "调整相机视角，使选中的组件居中并完整显示。" : "Center and frame the selected components in the camera view.",
      icon: Focus,
      onClick: onFocusSelection,
    },
    {
      id: "delete",
      label: lang === "zh" ? "删除" : "DELETE",
      ariaLabel: t.deletePart,
      hint: lang === "zh" ? "从当前项目中删除选中的组件，操作前会再次确认。" : "Delete selected components from the project after confirmation.",
      icon: Trash2,
      danger: true,
      onClick: onRequestDelete,
    },
  ] satisfies Array<{
    id: string;
    label: string;
    ariaLabel: string;
    hint: string;
    icon: typeof Group;
    disabled?: boolean;
    active?: boolean;
    danger?: boolean;
    onClick: () => void;
  }>;

  return (
    <section className={`left-panel panel ${collapsed ? "panel-collapsed" : ""}`}>
      {collapsed ? (
        <>
          <button className="panel-expand-button" type="button" title={t.expandStructure} aria-label={t.expandStructure} onClick={onToggleCollapsed}>
            <ChevronRight size={18} />
          </button>
          <span className="collapsed-panel-label">{t.structure}</span>
        </>
      ) : (
        <>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t.model}</p>
          <h2>{t.structure}</h2>
        </div>
        <div className="panel-heading-actions">
          <Badge>{31 + addedParts.length - deletedIds.size} {lang === "zh" ? "零件" : "PARTS"}</Badge>
          <button className="panel-collapse-button" type="button" title={t.collapseStructure} aria-label={t.collapseStructure} onClick={onToggleCollapsed}>
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      <label className="search-row">
        <Search size={14} />
        <input
          type="search"
          value={query}
          placeholder={t.search}
          aria-label={t.search}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {selectedIds.length > 0 && (
        <div className="selection-actions" aria-label={`${selectedIds.length} ${t.selectedCount}`}>
          <div className="selection-summary">
            <strong>{selectedIds.length}</strong>
            <span>{t.selectedCount}</span>
          </div>
          {selectionActionItems.map(({ id, label, ariaLabel, hint, icon: Icon, disabled, active, danger, onClick }) => (
            <button
              key={id}
              type="button"
              data-selection-action={id}
              data-tooltip={hint}
              aria-label={ariaLabel}
              disabled={disabled}
              className={`${active ? "active" : ""} ${danger ? "danger" : ""}`.trim()}
              onClick={onClick}
            >
              <Icon size={14} />
              <span className="selection-action-label">{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="structure-list">
        {userGroups.length > 0 && (
          <div className="custom-groups">
            <div className="tree-section-label">{t.customGroups}</div>
            {userGroups.map((group) => {
              const groupPartIds = group.partIds.filter((id) => !deletedIds.has(id));
              const selected = groupPartIds.length > 0 && groupPartIds.every((id) => selectedIds.includes(id));
              return (
                <div className="custom-group-row" key={group.id}>
                  {editingGroupId === group.id ? (
                    <div className={`structure-row custom-group-rename ${selected ? "selected" : ""}`}>
                      <Group size={15} />
                      <input
                        autoFocus
                        aria-label={lang === "zh" ? `重命名 ${group.name}` : `RENAME ${group.name}`}
                        maxLength={40}
                        value={groupNameDraft}
                        onChange={(event) => setGroupNameDraft(event.target.value)}
                        onBlur={() => finishGroupRename(group)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                          if (event.key === "Escape") {
                            cancelGroupRenameRef.current = true;
                            event.currentTarget.blur();
                          }
                        }}
                      />
                      <span>{groupPartIds.length}</span>
                    </div>
                  ) : (
                    <button
                      className={`structure-row ${selected ? "selected" : ""}`}
                      type="button"
                      title={lang === "zh" ? "双击重命名" : "DOUBLE-CLICK TO RENAME"}
                      onClick={() => onSelectMany(groupPartIds)}
                      onDoubleClick={() => beginGroupRename(group)}
                      onKeyDown={(event) => { if (event.key === "F2") beginGroupRename(group); }}
                    >
                      <span className="row-main"><Group size={15} /><span>{group.name}</span></span>
                      <span>{groupPartIds.length}</span>
                    </button>
                  )}
                  <button type="button" title={t.ungroup} aria-label={`${t.ungroup} ${group.name}`} onClick={() => onUngroup(group.id)}>
                    <Ungroup size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {visibleGroups.map((group) => {
          const Icon = group.icon;
          const isExpanded = normalizedQuery ? true : expandedGroups.has(group.id);
          const containsSelection = group.partIds.some((id) => selectedIds.includes(id));
          return (
            <div className="tree-group" key={group.id}>
              <button
                className={`structure-row ${containsSelection ? "selected" : ""} ${
                  group.warning ? "warning" : ""
                }`}
                type="button"
                aria-expanded={isExpanded}
                onClick={() => toggleGroup(group.id)}
              >
                <span className="row-main">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Icon size={15} />
                  <span>{labelFor(group.label, lang)}</span>
                </span>
                <span>{group.visiblePartIds.length}</span>
              </button>
              {isExpanded && (
                <div className="tree-children">
                  {group.visiblePartIds.map((id) => {
                    const part = getPartInfo(id, lang, resolvedRiskIds, addedParts);
                    return (
                      <div className="tree-node-row" key={`${group.id}-${id}`}>
                        <button
                          className={`tree-node ${selectedIds.includes(id) ? "selected" : ""} ${
                            part.warning ? "warning" : ""
                          } ${hiddenIds.has(id) ? "hidden-part" : ""} ${lockedIds.has(id) ? "locked-part" : ""}`}
                          type="button"
                          aria-pressed={selectedIds.includes(id)}
                          onClick={(event) => onSelect(id, event.shiftKey)}
                        >
                          <span className="tree-branch" aria-hidden="true" />
                          <span className="tree-node-id">{id}</span>
                          <span className="tree-node-name">{part.title}</span>
                          {hiddenIds.has(id) && <EyeOff size={12} />}
                          {lockedIds.has(id) && <Lock size={12} />}
                          {part.warning && <AlertTriangle size={13} />}
                        </button>
                        {part.warning && group.id === "joints" && (
                          <button
                            className="tree-quick-fix"
                            type="button"
                            title={t.quickFix}
                            aria-label={`${t.quickFix} ${id}`}
                            onClick={() => {
                              onSelect(id);
                              onQuickFix(id);
                            }}
                          >
                            <WandSparkles size={13} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {visibleGroups.length === 0 && <div className="tree-empty">{t.noTreeResults}</div>}
      </div>
        </>
      )}
    </section>
  );
}

function CameraRig({
  view,
  focusRequest,
  defaultTarget,
  focusTarget,
  focusSize,
  presentationFactor = 0,
  presentationTarget,
  presentationSize = 0,
  onMirrorAxisChange,
}: {
  view: ViewMode;
  focusRequest: number;
  defaultTarget: Vec3Tuple;
  focusTarget?: Vec3Tuple;
  focusSize: number;
  presentationFactor?: number;
  presentationTarget?: Vec3Tuple;
  presentationSize?: number;
  onMirrorAxisChange: (axis: MirrorAxis) => void;
}) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<any>(null);
  const focusTargetRef = useRef(focusTarget);
  const focusSizeRef = useRef(focusSize);
  const previousPresentationFactor = useRef(presentationFactor);
  focusTargetRef.current = focusTarget;
  focusSizeRef.current = focusSize;
  const publishCameraState = useCallback(() => {
    const target = controls.current?.target ?? new THREE.Vector3(...defaultTarget);
    const viewDirection = target.clone().sub(camera.position).normalize();
    const screenRight = viewDirection.clone().cross(camera.up);
    const mirrorAxis: MirrorAxis = screenRight.lengthSq() < 1e-8 || Math.abs(screenRight.x) >= Math.abs(screenRight.z) ? "x" : "z";
    gl.domElement.dataset.cameraState = [
      ...camera.position.toArray().map((value) => value.toFixed(4)),
      ...target.toArray().map((value: number) => value.toFixed(4)),
    ].join(",");
    gl.domElement.dataset.mirrorAxis = mirrorAxis;
    onMirrorAxisChange(mirrorAxis);
  }, [camera, defaultTarget, gl.domElement, onMirrorAxisChange]);

  useEffect(() => {
    const positions: Record<ViewMode, Vec3Tuple> = {
      perspective: [12, 8.5, 14],
      top: [0, 22, 0.001],
      front: [0, 4.2, 18],
      side: [18, 4.2, 0],
    };
    camera.position.set(...positions[view]);
    camera.lookAt(...defaultTarget);
    controls.current?.target.set(...defaultTarget);
    controls.current?.update();
    publishCameraState();
    invalidate();
  }, [camera, defaultTarget, invalidate, publishCameraState, view]);

  useEffect(() => {
    const requestedTarget = focusTargetRef.current;
    if (focusRequest === 0 || !requestedTarget) return;
    const target = new THREE.Vector3(...requestedTarget);
    const direction = camera.position.clone().sub(controls.current?.target ?? target).normalize();
    const distance = THREE.MathUtils.clamp(focusSizeRef.current * 2.8, 0.9, 14);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.current?.target.copy(target);
    camera.lookAt(target);
    controls.current?.update();
    publishCameraState();
    invalidate();
  }, [camera, focusRequest, invalidate, publishCameraState]);

  useEffect(() => {
    const wasExploded = previousPresentationFactor.current > 0;
    previousPresentationFactor.current = presentationFactor;
    if (presentationFactor <= 0) {
      if (!wasExploded) return;
      const positions: Record<ViewMode, Vec3Tuple> = {
        perspective: [12, 8.5, 14], top: [0, 22, 0.001], front: [0, 4.2, 18], side: [18, 4.2, 0],
      };
      camera.position.set(...positions[view]);
      controls.current?.target.set(...defaultTarget);
      camera.lookAt(...defaultTarget);
      controls.current?.update();
      publishCameraState();
      invalidate();
      return;
    }
    if (!presentationTarget) return;
    const target = new THREE.Vector3(...presentationTarget);
    const direction = camera.position.clone().sub(controls.current?.target ?? target).normalize();
    const distance = THREE.MathUtils.clamp(presentationSize * 2.8, 7, 32);
    camera.position.copy(target).add(direction.multiplyScalar(distance));
    controls.current?.target.copy(target);
    camera.lookAt(target);
    controls.current?.update();
    publishCameraState();
    invalidate();
  }, [camera, defaultTarget, invalidate, presentationFactor, presentationSize, presentationTarget, publishCameraState, view]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      maxDistance={30}
      minDistance={0.25}
      target={defaultTarget}
      onChange={publishCameraState}
    />
  );
}

function OrientationAxisLabel({
  letter,
  color,
  position,
}: {
  letter: "X" | "Y" | "Z";
  color: string;
  position: Vec3Tuple;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.font = "900 82px Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 12;
      context.strokeStyle = "rgba(0, 0, 0, 0.78)";
      context.strokeText(letter, 64, 68);
      context.fillStyle = color;
      context.fillText(letter, 64, 68);
    }
    const next = new THREE.CanvasTexture(canvas);
    next.colorSpace = THREE.SRGBColorSpace;
    next.needsUpdate = true;
    return next;
  }, [color, letter]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[0.5, 0.5, 0.5]} renderOrder={1002}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
    </sprite>
  );
}

function OrientationAxis({
  axis,
  color,
}: {
  axis: "x" | "y" | "z";
  color: string;
}) {
  const direction = axis === "x"
    ? new THREE.Vector3(1, 0, 0)
    : axis === "y"
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
  const rotation: Vec3Tuple = axis === "x"
    ? [0, 0, -Math.PI / 2]
    : axis === "z"
      ? [Math.PI / 2, 0, 0]
      : [0, 0, 0];
  const shaftPosition = direction.clone().multiplyScalar(0.82).toArray() as Vec3Tuple;
  const arrowPosition = direction.clone().multiplyScalar(1.28).toArray() as Vec3Tuple;
  const labelPosition = direction.clone().multiplyScalar(1.72).toArray() as Vec3Tuple;
  return (
    <group>
      <mesh position={shaftPosition} rotation={rotation} renderOrder={1000}>
        <cylinderGeometry args={[0.055, 0.055, 0.95, 16]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh position={arrowPosition} rotation={rotation} renderOrder={1001}>
        <coneGeometry args={[0.15, 0.34, 20]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
      </mesh>
      <OrientationAxisLabel letter={axis.toUpperCase() as "X" | "Y" | "Z"} color={color} position={labelPosition} />
    </group>
  );
}

function ViewOrientationGizmo() {
  return (
    <GizmoHelper alignment="bottom-left" margin={[64, 100]} renderPriority={1}>
      <group scale={28}>
        <mesh renderOrder={999}>
          <sphereGeometry args={[0.34, 28, 20]} />
          <meshBasicMaterial
            color="#e8ecef"
            transparent
            opacity={0.9}
            depthTest={false}
            depthWrite={false}
          />
        </mesh>
        <mesh renderOrder={1000}>
          <sphereGeometry args={[0.5, 18, 12]} />
          <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.34} depthTest={false} depthWrite={false} />
        </mesh>
        <OrientationAxis axis="x" color="#f05252" />
        <OrientationAxis axis="y" color="#66c768" />
        <OrientationAxis axis="z" color="#4c8ef7" />
      </group>
    </GizmoHelper>
  );
}

function BoxSelectionProjector({
  selectionRect,
  partCenters,
  onSelectMany,
}: {
  selectionRect: SelectionRect | null;
  partCenters: Record<string, Vec3Tuple>;
  onSelectMany: (ids: string[]) => void;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!selectionRect) return;
    camera.updateMatrixWorld();
    const selected = Object.entries(partCenters)
      .filter(([, center]) => {
        const point = new THREE.Vector3(...center).project(camera);
        const x = ((point.x + 1) / 2) * size.width;
        const y = ((1 - point.y) / 2) * size.height;
        return (
          point.z >= -1 &&
          point.z <= 1 &&
          x >= selectionRect.left &&
          x <= selectionRect.right &&
          y >= selectionRect.top &&
          y <= selectionRect.bottom
        );
      })
      .map(([id]) => id);
    onSelectMany(selected);
  }, [camera, onSelectMany, partCenters, selectionRect, size.height, size.width]);

  return null;
}

function TransformHandleProbe({ position, enabled }: { position?: Vec3Tuple; enabled: boolean }) {
  const { camera, gl, size } = useThree();
  useFrame(() => {
    if (!enabled || !position) {
      delete gl.domElement.dataset.transformHandleX;
      delete gl.domElement.dataset.transformOrigin;
      return;
    }
    camera.updateMatrixWorld();
    const origin = new THREE.Vector3(...position).project(camera);
    const axis = new THREE.Vector3(position[0] + 0.8, position[1], position[2]).project(camera);
    const originScreen = new THREE.Vector2((origin.x + 1) * size.width / 2, (1 - origin.y) * size.height / 2);
    const axisScreen = new THREE.Vector2((axis.x + 1) * size.width / 2, (1 - axis.y) * size.height / 2);
    const direction = axisScreen.sub(originScreen).normalize();
    const handle = originScreen.clone().addScaledVector(direction, 38);
    gl.domElement.dataset.transformOrigin = `${Math.round(originScreen.x)},${Math.round(originScreen.y)}`;
    gl.domElement.dataset.transformHandleX = `${Math.round(handle.x)},${Math.round(handle.y)}`;
  });
  return null;
}

function SceneModeMetadata({ explosionFactor }: { explosionFactor: number }) {
  const { gl } = useThree();
  useEffect(() => {
    gl.domElement.dataset.explosionFactor = String(explosionFactor);
    return () => { delete gl.domElement.dataset.explosionFactor; };
  }, [explosionFactor, gl]);
  return null;
}

function PanelCutoutMetadata({ selectedId, cutouts }: { selectedId: string; cutouts: Record<string, PanelCutout[]> }) {
  const { gl } = useThree();
  useEffect(() => {
    const selectedCutouts = cutouts[selectedId] ?? [];
    gl.domElement.dataset.panelCutoutPart = selectedCutouts.length > 0 ? selectedId : "";
    gl.domElement.dataset.panelCutoutCount = String(selectedCutouts.length);
    gl.domElement.dataset.panelCutouts = selectedCutouts.map(({ xMm, zMm, diameterMm }) => `${xMm},${zMm},${diameterMm}`).join(";");
    return () => {
      delete gl.domElement.dataset.panelCutoutPart;
      delete gl.domElement.dataset.panelCutoutCount;
      delete gl.domElement.dataset.panelCutouts;
    };
  }, [cutouts, gl, selectedId]);
  return null;
}

function GroundReferenceGrid({ background, size }: { background: CanvasBg; size: number }) {
  const { gl } = useThree();
  const imageBackground = background === "room" || background === "custom";
  const opacity = imageBackground ? 0.26 : 0.32;
  const cellColor = imageBackground
    ? "#d7dfe2"
    : background === "white"
      ? "#8f989c"
      : background === "gray"
        ? "#31383b"
        : "#8a969b";
  const axisColor = imageBackground
    ? "#f2f5f6"
    : background === "black"
      ? "#c4cdd0"
      : "#5f6a6e";
  const surfaceColor = imageBackground ? "#dce4e7" : background === "black" ? "#aab5b9" : "#596469";
  const divisions = Math.max(28, Math.round(size * 2));

  useEffect(() => {
    gl.domElement.dataset.groundGrid = "true";
    gl.domElement.dataset.groundGridOpacity = String(opacity);
    gl.domElement.dataset.groundGridCellMm = "50";
    gl.domElement.dataset.groundGridYMm = String(DESIGN_GROUND_Y_MM);
    return () => {
      delete gl.domElement.dataset.groundGrid;
      delete gl.domElement.dataset.groundGridOpacity;
      delete gl.domElement.dataset.groundGridCellMm;
      delete gl.domElement.dataset.groundGridYMm;
    };
  }, [gl, opacity]);

  return (
    <group position={[0, mmToScene(DESIGN_GROUND_Y_MM), 0]} name="ground-reference-grid">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.004, 0]} renderOrder={-2} raycast={() => null}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial
          color={surfaceColor}
          transparent
          opacity={imageBackground ? 0.035 : 0.055}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <gridHelper args={[size, divisions, axisColor, cellColor]} renderOrder={-1} raycast={() => null}>
        <lineBasicMaterial attach="material" vertexColors transparent opacity={opacity} depthWrite={false} toneMapped={false} />
      </gridHelper>
    </group>
  );
}

function StudioEnvironment({ intensity = 0.52 }: { intensity?: number }) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    let environment: THREE.Texture | null = null;
    let room: RoomEnvironment | null = null;
    let generator: THREE.PMREMGenerator | null = null;
    let cancelled = false;
    const createEnvironment = () => {
      if (cancelled) return;
      generator = new THREE.PMREMGenerator(gl);
      room = new RoomEnvironment();
      environment = generator.fromScene(room, 0.04).texture;
      scene.environment = environment;
      scene.environmentIntensity = intensity;
      invalidate();
    };
    const requestIdle = (window as unknown as { requestIdleCallback?: typeof window.requestIdleCallback }).requestIdleCallback?.bind(window);
    const idleHandle = requestIdle ? requestIdle(createEnvironment, { timeout: 600 }) : window.setTimeout(createEnvironment, 180);

    return () => {
      cancelled = true;
      if (requestIdle) window.cancelIdleCallback(idleHandle); else window.clearTimeout(idleHandle);
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      environment?.dispose();
      room?.dispose();
      generator?.dispose();
    };
  }, [gl, intensity, invalidate, scene]);

  return null;
}

function EditablePartGroup({
  id,
  basePosition,
  transform,
  selected,
  active,
  locked,
  snapPoints,
  resolveSmartSnap,
  resolvePanelSurface,
  transformMode,
  modifierDuplicate,
  onSelect,
  onOpenContextMenu,
  onModifierDuplicate,
  onTransformChange,
  onTransformPreview,
  children,
}: {
  id: string;
  basePosition: THREE.Vector3;
  transform: PartTransform;
  selected: boolean;
  active: boolean;
  locked: boolean;
  snapPoints?: Vec3Tuple[];
  resolveSmartSnap?: (position: Vec3Tuple, rotation: Vec3Tuple) => SmartSnapResult | null;
  resolvePanelSurface?: (position: Vec3Tuple, rotation: Vec3Tuple, scale: Vec3Tuple) => ConnectorPanelSurfaceContact | null;
  transformMode: TransformMode;
  modifierDuplicate: boolean;
  onSelect: (id: string, additive?: boolean) => void;
  onOpenContextMenu: PartContextMenuHandler;
  onModifierDuplicate: (id: string) => void;
  onTransformChange: TransformChangeHandler;
  onTransformPreview: (message: string | null) => void;
  children: React.ReactNode;
}) {
  const referenceGuides = useContext(ReferenceGuideContext);
  const groupRef = useRef<THREE.Group>(null);
  const [controlObject, setControlObject] = useState<THREE.Group | null>(null);
  const position = useMemo(
    () =>
      new THREE.Vector3(
        ...addVec3([basePosition.x, basePosition.y, basePosition.z], sceneOffset(transform)),
      ),
    [basePosition.x, basePosition.y, basePosition.z, transform.x, transform.y, transform.z],
  );
  const rotation = useMemo<Vec3Tuple>(() => [
    degToRad(transform.rotX),
    degToRad(transform.rotY),
    degToRad(transform.rotZ),
  ], [transform.rotX, transform.rotY, transform.rotZ]);
  const scale = useMemo<Vec3Tuple>(() => [
    transform.scaleX,
    transform.scaleY,
    transform.scaleZ,
  ], [transform.scaleX, transform.scaleY, transform.scaleZ]);
  const setGroupRef = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setControlObject((current) => (current === node ? current : node));
  }, []);

  const commitTransform = () => {
    const group = groupRef.current;
    if (!group) return;
    const committedPosition = group.position.clone();
    const currentRotation: Vec3Tuple = [
      radToDeg(group.rotation.x),
      radToDeg(group.rotation.y),
      radToDeg(group.rotation.z),
    ];
    const smartSnap = transformMode === "scale" ? null : resolveSmartSnap?.(
      [committedPosition.x, committedPosition.y, committedPosition.z],
      currentRotation,
    );
    const referenceSnap = !smartSnap && transformMode === "translate"
      ? referenceGuides?.resolve(id, committedPosition.toArray() as Vec3Tuple)
      : null;
    if (smartSnap) {
      committedPosition.set(...smartSnap.position);
      group.rotation.set(...smartSnap.rotation.map(degToRad) as Vec3Tuple);
    } else if (referenceSnap && referenceSnap.guides.length > 0) {
      committedPosition.set(...referenceSnap.position);
    } else if (transformMode !== "scale" && snapPoints && snapPoints.length > 0) {
      const nearest = snapPoints
        .map((point) => new THREE.Vector3(...point))
        .sort((a, b) => a.distanceToSquared(committedPosition) - b.distanceToSquared(committedPosition))[0];
      if (nearest.distanceTo(committedPosition) <= 0.5) committedPosition.copy(nearest);
    }
    const surfaceContact = resolvePanelSurface?.(
      committedPosition.toArray() as Vec3Tuple,
      [radToDeg(group.rotation.x), radToDeg(group.rotation.y), radToDeg(group.rotation.z)],
      group.scale.toArray() as Vec3Tuple,
    );
    if (surfaceContact) committedPosition.set(...surfaceContact.position);
    group.position.copy(committedPosition);
    const snapRotation = (value: number) => Math.round(value / 90) * 90;
    const committedRotation = transformMode === "rotate"
      ? [
          snapRotation(radToDeg(group.rotation.x)),
          snapRotation(radToDeg(group.rotation.y)),
          snapRotation(radToDeg(group.rotation.z)),
        ] as Vec3Tuple
      : [transform.rotX, transform.rotY, transform.rotZ] as Vec3Tuple;
    onTransformChange(id, {
      ...transform,
      x: sceneDeltaToFreePositionMm(committedPosition.x - basePosition.x),
      y: sceneDeltaToFreePositionMm(committedPosition.y - basePosition.y),
      z: sceneDeltaToFreePositionMm(committedPosition.z - basePosition.z),
      rotX: committedRotation[0],
      rotY: committedRotation[1],
      rotZ: committedRotation[2],
      scaleX: Math.sign(group.scale.x || 1) * Math.max(0.1, Math.round(Math.abs(group.scale.x) * 10) / 10),
      scaleY: Math.sign(group.scale.y || 1) * Math.max(0.1, Math.round(Math.abs(group.scale.y) * 10) / 10),
      scaleZ: Math.sign(group.scale.z || 1) * Math.max(0.1, Math.round(Math.abs(group.scale.z) * 10) / 10),
    }, transformMode === "scale" ? [] : smartSnap?.connections ?? []);
    referenceGuides?.report(id, null);
    onTransformPreview(null);
  };

  return (
    <>
      <group
        ref={setGroupRef}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={(event) => {
          event.stopPropagation();
          if (!selected || event.nativeEvent.shiftKey) onSelect(id, event.nativeEvent.shiftKey);
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
          event.nativeEvent.preventDefault();
          onSelect(id);
          onOpenContextMenu(id, event.nativeEvent.clientX, event.nativeEvent.clientY, event.point.toArray() as Vec3Tuple);
        }}
      >
        {children}
      </group>
      {active && !locked && controlObject && (
        <TransformControls
          ref={(controls) => {
            const helper = (controls as unknown as { getHelper?: () => THREE.Object3D } | null)?.getHelper?.();
            helper?.traverse((object) => {
              object.renderOrder = 20;
            });
          }}
          object={controlObject}
          mode={transformMode}
          size={0.72}
          showX
          showY
          showZ
          rotationSnap={Math.PI / 2}
          scaleSnap={0.1}
          onMouseDown={() => {
            const duplicateOnDrag = modifierDuplicate || document.documentElement.dataset.axisframeModifierDuplicate === "true";
            if (duplicateOnDrag) onModifierDuplicate(id);
            if (transformMode === "translate") referenceGuides?.report(id, controlObject.position.toArray() as Vec3Tuple);
            onTransformPreview(duplicateOnDrag
              ? "ALT/OPTION 拖拽复制：原位置已保留副本"
              : transformMode === "scale"
                ? "缩放预览 / 10% 步进"
                : transformMode === "rotate"
                  ? "90° 旋转预览"
                  : "自由移动；接近其他组件时启用智能参考线与连接吸附");
          }}
          onObjectChange={() => {
            const group = groupRef.current;
            if (!group) return;
            const position = group.position.toArray() as Vec3Tuple;
            const currentRotation: Vec3Tuple = [radToDeg(group.rotation.x), radToDeg(group.rotation.y), radToDeg(group.rotation.z)];
            const surfaceContact = resolvePanelSurface?.(position, currentRotation, group.scale.toArray() as Vec3Tuple);
            if (surfaceContact?.correctedPenetration) group.position.set(...surfaceContact.position);
            if (transformMode === "scale") {
              onTransformPreview(surfaceContact?.correctedPenetration
                ? `已阻止嵌入：连接件贴合层板 ${surfaceContact.panelId}`
                : `缩放 X ${group.scale.x.toFixed(1)} / Y ${group.scale.y.toFixed(1)} / Z ${group.scale.z.toFixed(1)}`);
              return;
            }
            referenceGuides?.report(id, position);
            const referenceMatch = referenceGuides?.resolve(id, position);
            const candidate = resolveSmartSnap?.(
              [group.position.x, group.position.y, group.position.z],
              currentRotation,
            );
            const directionLabel = candidate?.shaftOrientation === "vertical" ? "垂直光轴" : candidate?.shaftOrientation === "horizontal" ? "水平光轴" : "斜向光轴";
            onTransformPreview(surfaceContact?.correctedPenetration
              ? `已阻止嵌入：连接件贴合层板 ${surfaceContact.panelId}`
              : candidate
              ? candidate.panelHole
                ? `穿孔吸附：光轴穿过 ${candidate.panelHole.panelId} / ${candidate.panelHole.holeId} / 共 ${candidate.connections.length} 个孔`
                : candidate.panelContact
                ? `限位贴合：保持${directionLabel} / 贴合层板 ${candidate.panelContact.panelId} / 不改变当前方向`
                : candidate.orientationLocked
                  ? `轴向限位：保持${directionLabel}${candidate.preferredShaftPreserved ? "与原光轴" : ""} / 仅沿轴移动 / ${candidate.distanceMm.toFixed(1)} MM`
                  : `智能连接：保持当前姿态 / ${directionLabel} / ${candidate.connections.length} 个端口 / ${candidate.distanceMm.toFixed(1)} MM`
              : referenceMatch && referenceMatch.guides.length > 0
                ? `智能参考线：${referenceMatch.guides.map(({ axis, referenceId }) => `${axis.toUpperCase()} → ${referenceId}`).join(" / ")}`
                : resolveSmartSnap
                  ? "自由移动；当前未触发兼容连接吸附"
                  : "自由移动；当前未触发参考线吸附");
          }}
          onMouseUp={commitTransform}
        />
      )}
    </>
  );
}

function ShaftLengthHandles({
  id,
  basePosition,
  baseLengthScene,
  localAxis,
  transform,
  radius,
  onEditStart,
  onPreview,
  onTransformPreview,
}: {
  id: string;
  basePosition: Vec3Tuple;
  baseLengthScene: number;
  localAxis: Vec3Tuple;
  transform: PartTransform;
  radius: number;
  onEditStart: (id: string) => void;
  onPreview: ShaftLengthPreviewHandler;
  onTransformPreview: (message: string | null) => void;
}) {
  const startRef = useRef<THREE.Mesh>(null);
  const endRef = useRef<THREE.Mesh>(null);
  const { camera, controls, gl, invalidate, size } = useThree();
  const dragging = useRef<{
    pointerId: number;
    fixedEndpoint: THREE.Vector3;
    axis: THREE.Vector3;
    plane: THREE.Plane;
    visualUnitsPerPhysicalUnit: number;
  } | null>(null);
  const axis = useMemo(() => new THREE.Vector3(...localAxis).normalize(), [localAxis]);
  const currentLengthScene = baseLengthScene * Math.max(0.15, transform.sizeX / 100);
  const startPosition = axis.clone().multiplyScalar(-currentLengthScene / 2);
  const endPosition = axis.clone().multiplyScalar(currentLengthScene / 2);
  const endpointFaceQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis),
    [axis],
  );
  const endpointHitQuaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis),
    [axis],
  );
  const hitRadius = THREE.MathUtils.clamp(radius * 1.65, 0.065, 0.11);
  const hitDepth = THREE.MathUtils.clamp(radius * 0.9, 0.035, 0.07);
  const ringThickness = THREE.MathUtils.clamp(radius * 0.12, 0.004, 0.012);
  const ringInnerRadius = Math.max(radius - ringThickness, radius * 0.72);
  const faceOffset = Math.min(0.006, radius * 0.12);

  const publishHandlePositions = useCallback(() => {
    const publish = (mesh: THREE.Mesh | null) => {
      if (!mesh) return "";
      mesh.updateWorldMatrix(true, false);
      const projected = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return [
        (((projected.x + 1) / 2) * size.width).toFixed(1),
        (((1 - projected.y) / 2) * size.height).toFixed(1),
      ].join(",");
    };
    gl.domElement.dataset.shaftLengthPart = id;
    gl.domElement.dataset.shaftLengthStart = publish(startRef.current);
    gl.domElement.dataset.shaftLengthEnd = publish(endRef.current);
    gl.domElement.dataset.shaftLengthMm = String(Math.round(baseLengthScene / mmToScene(1) * transform.sizeX / 100));
    gl.domElement.dataset.shaftEndpointHandleShape = "circular-face";
    gl.domElement.dataset.shaftEndpointFaceDiameterMm = String(
      Math.round(radius * 2 / mmToScene(1) * 10) / 10,
    );
  }, [
    baseLengthScene,
    camera,
    gl.domElement,
    id,
    size.height,
    size.width,
    radius,
    transform.rotX,
    transform.rotY,
    transform.rotZ,
    transform.scaleX,
    transform.scaleY,
    transform.scaleZ,
    transform.sizeX,
    transform.x,
    transform.y,
    transform.z,
  ]);

  useEffect(() => {
    invalidate();
    const frame = window.requestAnimationFrame(publishHandlePositions);
    return () => window.cancelAnimationFrame(frame);
  }, [invalidate, publishHandlePositions, startPosition.x, startPosition.y, startPosition.z, endPosition.x, endPosition.y, endPosition.z]);

  useEffect(() => () => {
    if (controls && "enabled" in controls) controls.enabled = true;
    gl.domElement.style.cursor = "";
    delete gl.domElement.dataset.shaftLengthPart;
    delete gl.domElement.dataset.shaftLengthStart;
    delete gl.domElement.dataset.shaftLengthEnd;
    delete gl.domElement.dataset.shaftLengthMm;
    delete gl.domElement.dataset.shaftEndpointHandleShape;
    delete gl.domElement.dataset.shaftEndpointFaceDiameterMm;
  }, [controls, gl.domElement]);

  const beginDrag = (endpoint: "start" | "end", event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const draggedMesh = endpoint === "start" ? startRef.current : endRef.current;
    const fixedMesh = endpoint === "start" ? endRef.current : startRef.current;
    if (!draggedMesh || !fixedMesh) return;
    draggedMesh.updateWorldMatrix(true, false);
    fixedMesh.updateWorldMatrix(true, false);
    const draggedEndpoint = draggedMesh.getWorldPosition(new THREE.Vector3());
    const fixedEndpoint = fixedMesh.getWorldPosition(new THREE.Vector3());
    const worldAxis = draggedEndpoint.clone().sub(fixedEndpoint).normalize();
    const initialVisualLength = draggedEndpoint.distanceTo(fixedEndpoint);
    const currentPhysicalLength = baseLengthScene * Math.max(0.15, transform.sizeX / 100);
    const visualUnitsPerPhysicalUnit = initialVisualLength / Math.max(currentPhysicalLength, 0.0001);
    const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
    let planeNormal = cameraDirection.clone().sub(worldAxis.clone().multiplyScalar(cameraDirection.dot(worldAxis)));
    if (planeNormal.lengthSq() < 0.000001) {
      planeNormal = camera.up.clone().sub(worldAxis.clone().multiplyScalar(camera.up.dot(worldAxis)));
    }
    if (planeNormal.lengthSq() < 0.000001) planeNormal.set(0, 1, 0);
    planeNormal.normalize();
    dragging.current = {
      pointerId: event.pointerId,
      fixedEndpoint,
      axis: worldAxis,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, fixedEndpoint),
      visualUnitsPerPhysicalUnit,
    };
    (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
    if (controls && "enabled" in controls) controls.enabled = false;
    onEditStart(id);
    onTransformPreview(`拖动端点调整光轴长度 · 当前 ${Math.round(currentPhysicalLength / mmToScene(1))} MM`);
  };

  const dragEndpoint = (event: ThreeEvent<PointerEvent>) => {
    const state = dragging.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    const intersection = event.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!intersection) return;
    const visualLength = intersection.clone().sub(state.fixedEndpoint).dot(state.axis);
    const physicalLengthMm = visualLength / Math.max(state.visualUnitsPerPhysicalUnit, 0.0001) / mmToScene(1);
    const next = resizeShaftFromEndpoint({
      baseCenter: basePosition,
      baseLengthScene,
      transform,
      fixedEndpoint: state.fixedEndpoint.toArray() as Vec3Tuple,
      axisFromFixedEndpoint: state.axis.toArray() as Vec3Tuple,
      physicalLengthMm,
      visualUnitsPerPhysicalUnit: state.visualUnitsPerPhysicalUnit,
    });
    onPreview(id, next);
    onTransformPreview(`光轴长度 ${Math.round(baseLengthScene / mmToScene(1) * next.sizeX / 100)} MM · 另一端保持固定`);
    invalidate();
  };

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    const state = dragging.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    dragging.current = null;
    (event.target as unknown as { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(event.pointerId);
    if (controls && "enabled" in controls) controls.enabled = true;
    gl.domElement.style.cursor = "";
    onTransformPreview(null);
    invalidate();
  };

  const handle = (endpoint: "start" | "end", position: THREE.Vector3, ref: React.RefObject<THREE.Mesh | null>) => {
    const outwardDirection = endpoint === "start" ? -1 : 1;
    const visualOffset = axis.clone().multiplyScalar(faceOffset * outwardDirection);
    return (
      <group position={position}>
        <mesh
          ref={ref}
          quaternion={endpointHitQuaternion}
          renderOrder={20}
          onPointerDown={(event) => beginDrag(endpoint, event)}
          onPointerMove={dragEndpoint}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerOver={() => { gl.domElement.style.cursor = "ew-resize"; }}
          onPointerOut={() => {
            if (!dragging.current) gl.domElement.style.cursor = "";
          }}
        >
          <cylinderGeometry args={[hitRadius, hitRadius, hitDepth, 24]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
        <group position={visualOffset} quaternion={endpointFaceQuaternion}>
          <mesh renderOrder={21} raycast={() => null}>
            <circleGeometry args={[radius, 40]} />
            <meshBasicMaterial
              color="#39e66d"
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              transparent
              opacity={0.2}
            />
          </mesh>
          <mesh renderOrder={22} raycast={() => null}>
            <ringGeometry args={[ringInnerRadius, radius, 40]} />
            <meshBasicMaterial
              color="#39e66d"
              depthTest={false}
              depthWrite={false}
              side={THREE.DoubleSide}
              transparent
              opacity={0.96}
            />
          </mesh>
        </group>
      </group>
    );
  };

  return (
    <>
      <Line
        points={[startPosition.toArray() as Vec3Tuple, endPosition.toArray() as Vec3Tuple]}
        color="#39e66d"
        lineWidth={1}
        transparent
        opacity={0.68}
        depthTest={false}
      />
      {handle("start", startPosition, startRef)}
      {handle("end", endPosition, endRef)}
    </>
  );
}

function ShaftRod({
  id,
  start,
  end,
  transform,
  material,
  selected,
  active,
  locked,
  wireframe,
  transformMode,
  modifierDuplicate,
  resolveSmartSnap,
  onSelect,
  onOpenContextMenu,
  onModifierDuplicate,
  onTransformChange,
  onShaftLengthEditStart,
  onShaftLengthPreview,
  onTransformPreview,
}: {
  id: string;
  start: Vec3Tuple;
  end: Vec3Tuple;
  transform: PartTransform;
  material: MetalMaterial;
  selected: boolean;
  active: boolean;
  locked: boolean;
  wireframe: boolean;
  transformMode: TransformMode;
  modifierDuplicate: boolean;
  resolveSmartSnap?: (position: Vec3Tuple, rotation: Vec3Tuple) => SmartSnapResult | null;
  onSelect: (id: string, additive?: boolean) => void;
  onOpenContextMenu: PartContextMenuHandler;
  onModifierDuplicate: (id: string) => void;
  onTransformChange: (id: string, transform: PartTransform) => void;
  onShaftLengthEditStart: (id: string) => void;
  onShaftLengthPreview: ShaftLengthPreviewHandler;
  onTransformPreview: (message: string | null) => void;
}) {
  const { midpoint, length, quaternion } = useMemo(() => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(b, a);
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.clone().normalize(),
    );
    return { midpoint: mid, length: direction.length(), quaternion: quat };
  }, [start, end]);

  const radius = Math.max(0.025, mmToScene(transform.sizeY) / 2);
  const lengthScale = Math.max(0.15, transform.sizeX / 100);
  const materialSpec = metalMaterialSpecs[material];
  const localAxis = useMemo(
    () => new THREE.Vector3(...end).sub(new THREE.Vector3(...start)).normalize().toArray() as Vec3Tuple,
    [end, start],
  );

  return (
    <EditablePartGroup
      id={id}
      basePosition={midpoint}
      transform={transform}
      selected={selected}
      active={active}
      locked={locked}
      transformMode={transformMode}
      modifierDuplicate={modifierDuplicate}
      resolveSmartSnap={resolveSmartSnap}
      onSelect={onSelect}
      onOpenContextMenu={onOpenContextMenu}
      onModifierDuplicate={onModifierDuplicate}
      onTransformChange={onTransformChange}
      onTransformPreview={onTransformPreview}
    >
      <mesh quaternion={quaternion}>
      <cylinderGeometry args={[radius, radius, length * lengthScale, 28]} />
      <meshStandardMaterial
        color={materialSpec.color}
        emissive={selected ? "#ffffff" : "#000000"}
        emissiveIntensity={selected ? 0.18 : 0}
        metalness={materialSpec.metalness}
        roughness={materialSpec.roughness}
        wireframe={wireframe}
      />
      </mesh>
      {active && !locked && (
        <ShaftLengthHandles
          id={id}
          basePosition={midpoint.toArray() as Vec3Tuple}
          baseLengthScene={length}
          localAxis={localAxis}
          transform={transform}
          radius={radius}
          onEditStart={onShaftLengthEditStart}
          onPreview={onShaftLengthPreview}
          onTransformPreview={onTransformPreview}
        />
      )}
    </EditablePartGroup>
  );
}

function ConnectorNode({
  id,
  position,
  transform,
  material,
  selected,
  active,
  locked,
  snapPoints,
  resolveSmartSnap,
  resolvePanelSurface,
  warning,
  showTags,
  transformMode,
  modifierDuplicate,
  onSelect,
  onOpenContextMenu,
  onModifierDuplicate,
  onTransformChange,
  onTransformPreview,
}: {
  id: string;
  position: Vec3Tuple;
  transform: PartTransform;
  material: MetalMaterial;
  selected: boolean;
  active: boolean;
  locked: boolean;
  snapPoints: Vec3Tuple[];
  resolveSmartSnap?: (position: Vec3Tuple, rotation: Vec3Tuple) => SmartSnapResult | null;
  resolvePanelSurface?: (position: Vec3Tuple, rotation: Vec3Tuple, scale: Vec3Tuple) => ConnectorPanelSurfaceContact | null;
  warning?: boolean;
  showTags: boolean;
  transformMode: TransformMode;
  modifierDuplicate: boolean;
  onSelect: (id: string, additive?: boolean) => void;
  onOpenContextMenu: PartContextMenuHandler;
  onModifierDuplicate: (id: string) => void;
  onTransformChange: TransformChangeHandler;
  onTransformPreview: (message: string | null) => void;
}) {
  const basePosition = useMemo(() => new THREE.Vector3(...position), [position]);
  const size: Vec3Tuple = [
    Math.max(0.12, mmToScene(transform.sizeX)),
    Math.max(0.12, mmToScene(transform.sizeY)),
    Math.max(0.12, mmToScene(transform.sizeZ)),
  ];
  const renderedPart = useMemo<LibraryPart>(() => ({
    ...defaultCrossConnectorPart,
    material: material === "matteBlack" ? "黑色金属" : material === "whiteMetal" ? "白色金属" : "不锈钢",
    dimensions: { width: transform.sizeX, length: transform.sizeZ, height: transform.sizeY },
  }), [material, transform.sizeX, transform.sizeY, transform.sizeZ]);

  return (
    <EditablePartGroup
      id={id}
      basePosition={basePosition}
      transform={transform}
      selected={selected}
      active={active}
      locked={locked}
      snapPoints={snapPoints}
      resolveSmartSnap={resolveSmartSnap}
      resolvePanelSurface={resolvePanelSurface}
      transformMode={transformMode}
      modifierDuplicate={modifierDuplicate}
      onSelect={onSelect}
      onOpenContextMenu={onOpenContextMenu}
      onModifierDuplicate={onModifierDuplicate}
      onTransformChange={onTransformChange}
      onTransformPreview={onTransformPreview}
    >
      <ComponentModel part={renderedPart} displayMode="scene" />
      {(selected || warning) && (
        <mesh>
          <boxGeometry args={[size[0] + 0.14, size[1] + 0.14, size[2] + 0.14]} />
          <meshBasicMaterial color={warning ? "#f5a623" : "#ffffff"} wireframe transparent opacity={0.95} />
        </mesh>
      )}
      {(showTags || warning || selected) && (
        <Html
          distanceFactor={9}
          position={id === "J-010" ? [-0.55, 0.36, 0] : [0.2, 0.36, 0]}
          center
        >
          <div className={`node-label ${warning ? "warning" : ""}`}>
            {id === "J-010" ? "N10" : id}
          </div>
        </Html>
      )}
    </EditablePartGroup>
  );
}

type PanelEdgeName = "x-negative" | "x-positive" | "z-negative" | "z-positive";

function PanelEdgeHandles({
  id,
  basePosition,
  transform,
  onEditStart,
  onPreview,
  onTransformPreview,
}: {
  id: string;
  basePosition: Vec3Tuple;
  transform: PartTransform;
  onEditStart: (id: string) => void;
  onPreview: PanelEdgePreviewHandler;
  onTransformPreview: (message: string | null) => void;
}) {
  const xNegativeRef = useRef<THREE.Mesh>(null);
  const xPositiveRef = useRef<THREE.Mesh>(null);
  const zNegativeRef = useRef<THREE.Mesh>(null);
  const zPositiveRef = useRef<THREE.Mesh>(null);
  const { camera, controls, gl, invalidate, size } = useThree();
  const dragging = useRef<{
    pointerId: number;
    axis: PanelResizeAxis;
    fixedEdge: THREE.Vector3;
    axisFromFixedEdge: THREE.Vector3;
    plane: THREE.Plane;
    visualUnitsPerPhysicalUnit: number;
    latestTransform: PartTransform;
  } | null>(null);
  const lengthScene = Math.max(0.4, mmToScene(transform.sizeX));
  const widthScene = Math.max(0.3, mmToScene(transform.sizeZ));
  const thicknessScene = Math.max(0.025, mmToScene(transform.sizeY));
  const handleY = thicknessScene / 2 + 0.055;
  const edgeRefs: Record<PanelEdgeName, React.RefObject<THREE.Mesh | null>> = {
    "x-negative": xNegativeRef,
    "x-positive": xPositiveRef,
    "z-negative": zNegativeRef,
    "z-positive": zPositiveRef,
  };

  const publishHandlePositions = useCallback(() => {
    const publish = (mesh: THREE.Mesh | null) => {
      if (!mesh) return "";
      mesh.updateWorldMatrix(true, false);
      const projected = mesh.getWorldPosition(new THREE.Vector3()).project(camera);
      return [
        (((projected.x + 1) / 2) * size.width).toFixed(1),
        (((1 - projected.y) / 2) * size.height).toFixed(1),
      ].join(",");
    };
    gl.domElement.dataset.panelResizePart = id;
    gl.domElement.dataset.panelEdgeXNegative = publish(xNegativeRef.current);
    gl.domElement.dataset.panelEdgeXPositive = publish(xPositiveRef.current);
    gl.domElement.dataset.panelEdgeZNegative = publish(zNegativeRef.current);
    gl.domElement.dataset.panelEdgeZPositive = publish(zPositiveRef.current);
    gl.domElement.dataset.panelLengthMm = String(Math.round(transform.sizeX));
    gl.domElement.dataset.panelWidthMm = String(Math.round(transform.sizeZ));
  }, [
    camera,
    gl.domElement,
    id,
    size.height,
    size.width,
    transform.rotX,
    transform.rotY,
    transform.rotZ,
    transform.scaleX,
    transform.scaleY,
    transform.scaleZ,
    transform.sizeX,
    transform.sizeY,
    transform.sizeZ,
    transform.x,
    transform.y,
    transform.z,
  ]);

  useEffect(() => {
    invalidate();
    const frame = window.requestAnimationFrame(publishHandlePositions);
    return () => window.cancelAnimationFrame(frame);
  }, [handleY, invalidate, lengthScene, publishHandlePositions, widthScene]);
  useFrame(publishHandlePositions);

  useEffect(() => () => {
    if (controls && "enabled" in controls) controls.enabled = true;
    gl.domElement.style.cursor = "";
    delete gl.domElement.dataset.panelResizePart;
    delete gl.domElement.dataset.panelEdgeXNegative;
    delete gl.domElement.dataset.panelEdgeXPositive;
    delete gl.domElement.dataset.panelEdgeZNegative;
    delete gl.domElement.dataset.panelEdgeZPositive;
    delete gl.domElement.dataset.panelLengthMm;
    delete gl.domElement.dataset.panelWidthMm;
    delete gl.domElement.dataset.panelResizeDragging;
    delete gl.domElement.dataset.panelResizePreviewMm;
  }, [controls, gl.domElement]);

  const beginDrag = (edge: PanelEdgeName, event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const [axis] = edge.split("-") as [PanelResizeAxis];
    const oppositeEdge = `${axis}-${edge.endsWith("negative") ? "positive" : "negative"}` as PanelEdgeName;
    const draggedMesh = edgeRefs[edge].current;
    const fixedMesh = edgeRefs[oppositeEdge].current;
    if (!draggedMesh || !fixedMesh) return;
    draggedMesh.updateWorldMatrix(true, false);
    fixedMesh.updateWorldMatrix(true, false);
    const draggedEdge = draggedMesh.getWorldPosition(new THREE.Vector3());
    const fixedEdge = fixedMesh.getWorldPosition(new THREE.Vector3());
    const axisFromFixedEdge = draggedEdge.clone().sub(fixedEdge).normalize();
    const initialVisualSize = draggedEdge.distanceTo(fixedEdge);
    const currentPhysicalSize = mmToScene(axis === "x" ? transform.sizeX : transform.sizeZ);
    const visualUnitsPerPhysicalUnit = initialVisualSize / Math.max(currentPhysicalSize, 0.0001);
    const cameraDirection = camera.getWorldDirection(new THREE.Vector3());
    let planeNormal = cameraDirection.clone().sub(
      axisFromFixedEdge.clone().multiplyScalar(cameraDirection.dot(axisFromFixedEdge)),
    );
    if (planeNormal.lengthSq() < 0.000001) {
      planeNormal = camera.up.clone().sub(
        axisFromFixedEdge.clone().multiplyScalar(camera.up.dot(axisFromFixedEdge)),
      );
    }
    if (planeNormal.lengthSq() < 0.000001) planeNormal.set(0, 1, 0);
    planeNormal.normalize();
    dragging.current = {
      pointerId: event.pointerId,
      axis,
      fixedEdge,
      axisFromFixedEdge,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, fixedEdge),
      visualUnitsPerPhysicalUnit,
      latestTransform: transform,
    };
    (event.target as unknown as { setPointerCapture: (pointerId: number) => void }).setPointerCapture(event.pointerId);
    if (controls && "enabled" in controls) controls.enabled = false;
    gl.domElement.dataset.panelResizeDragging = edge;
    onEditStart(id);
    const dimensionLabel = axis === "x" ? "长" : "宽";
    const currentSizeMm = axis === "x" ? transform.sizeX : transform.sizeZ;
    onTransformPreview(`拖动层板边缘调整${dimensionLabel} · 当前 ${Math.round(currentSizeMm)} MM`);
  };

  const dragEdge = (event: ThreeEvent<PointerEvent>) => {
    const state = dragging.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const intersection = event.ray.intersectPlane(state.plane, new THREE.Vector3());
    if (!intersection) return;
    const visualSize = intersection.clone().sub(state.fixedEdge).dot(state.axisFromFixedEdge);
    const physicalSizeMm = visualSize / Math.max(state.visualUnitsPerPhysicalUnit, 0.0001) / mmToScene(1);
    const next = resizePanelFromEdge({
      baseCenter: basePosition,
      transform,
      axis: state.axis,
      fixedEdge: state.fixedEdge.toArray() as Vec3Tuple,
      axisFromFixedEdge: state.axisFromFixedEdge.toArray() as Vec3Tuple,
      physicalSizeMm,
      visualUnitsPerPhysicalUnit: state.visualUnitsPerPhysicalUnit,
    });
    gl.domElement.dataset.panelResizePreviewMm = String(
      Math.round(state.axis === "x" ? next.sizeX : next.sizeZ),
    );
    state.latestTransform = next;
    onPreview(id, next);
    onTransformPreview(
      `层板${state.axis === "x" ? "长" : "宽"} ${Math.round(state.axis === "x" ? next.sizeX : next.sizeZ)} MM · 对侧边保持固定`,
    );
    invalidate();
  };

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    const state = dragging.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();
    const finalTransform = state.latestTransform;
    dragging.current = null;
    (event.target as unknown as { releasePointerCapture: (pointerId: number) => void }).releasePointerCapture(event.pointerId);
    if (controls && "enabled" in controls) controls.enabled = true;
    gl.domElement.style.cursor = "";
    onTransformPreview(null);
    invalidate();
    window.requestAnimationFrame(() => onPreview(id, finalTransform));
    window.setTimeout(() => {
      delete gl.domElement.dataset.panelResizeDragging;
    }, 0);
  };

  const handle = (
    edge: PanelEdgeName,
    position: Vec3Tuple,
    handleSize: Vec3Tuple,
    ref: React.RefObject<THREE.Mesh | null>,
  ) => {
    const axis = edge.startsWith("x") ? "x" : "z";
    return (
      <mesh
        ref={ref}
        position={position}
        renderOrder={21}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => beginDrag(edge, event)}
        onPointerMove={dragEdge}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerOver={() => { gl.domElement.style.cursor = axis === "x" ? "ew-resize" : "ns-resize"; }}
        onPointerOut={() => {
          if (!dragging.current) gl.domElement.style.cursor = "";
        }}
      >
        <boxGeometry args={handleSize} />
        <meshBasicMaterial color="#39e66d" depthTest={false} transparent opacity={0.92} />
      </mesh>
    );
  };

  return (
    <>
      {handle(
        "x-negative",
        [-lengthScene / 2, handleY, 0],
        [0.12, 0.09, widthScene + 0.18],
        xNegativeRef,
      )}
      {handle(
        "x-positive",
        [lengthScene / 2, handleY, 0],
        [0.12, 0.09, widthScene + 0.18],
        xPositiveRef,
      )}
      {handle(
        "z-negative",
        [0, handleY, -widthScene / 2],
        [lengthScene + 0.18, 0.09, 0.12],
        zNegativeRef,
      )}
      {handle(
        "z-positive",
        [0, handleY, widthScene / 2],
        [lengthScene + 0.18, 0.09, 0.12],
        zPositiveRef,
      )}
    </>
  );
}

function PanelCutoutMesh({
  widthMm,
  lengthMm,
  thicknessMm,
  cutouts,
  material,
  selected,
  wireframe = false,
}: {
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  cutouts: PanelCutout[];
  material: PanelMaterial;
  selected: boolean;
  wireframe?: boolean;
}) {
  const size = useMemo<Vec3Tuple>(() => [
    Math.max(0.4, mmToScene(widthMm)),
    Math.max(0.025, mmToScene(thicknessMm)),
    Math.max(0.3, mmToScene(lengthMm)),
  ], [lengthMm, thicknessMm, widthMm]);
  const woodTexture = useMemo(
    () => (material === "acrylic" ? null : createWoodTexture(material)),
    [material],
  );
  const acrylicTexture = useMemo(
    () => material === "acrylic" ? createAcrylicLiquidGlassTexture() : null,
    [material],
  );
  const drilledGeometry = useMemo(() => {
    if (cutouts.length === 0) return null;
    const primitives: ComponentPrimitive[] = [
      { shape: "box", size, position: [0, 0, 0] },
      ...normalizePanelCutouts(cutouts, { widthMm, lengthMm, thicknessMm }).map((cutout) => ({
        shape: "cylinder" as const,
        size: [mmToScene(cutout.diameterMm), Math.max(size[1] * 1.6, 0.06), mmToScene(cutout.diameterMm)] as Vec3Tuple,
        position: [mmToScene(cutout.xMm - widthMm / 2), 0, mmToScene(cutout.zMm - lengthMm / 2)] as Vec3Tuple,
        appearance: "cutout" as const,
        feature: "drilled-hole" as const,
      })),
    ];
    return getCachedHollowComponentGeometry(primitives);
  }, [cutouts, lengthMm, size, thicknessMm, widthMm]);

  useEffect(() => () => {
    woodTexture?.dispose();
    acrylicTexture?.dispose();
  }, [acrylicTexture, woodTexture]);

  return (
    <mesh geometry={drilledGeometry ?? undefined}>
      {!drilledGeometry && <boxGeometry args={size} />}
      {material === "acrylic" ? (
        <meshPhysicalMaterial
          color={acrylicLiquidGlassMaterial.color}
          map={acrylicTexture ?? undefined}
          roughnessMap={acrylicTexture ?? undefined}
          transparent
          opacity={selected ? acrylicLiquidGlassMaterial.selectedOpacity : acrylicLiquidGlassMaterial.normalOpacity}
          transmission={acrylicLiquidGlassMaterial.transmission}
          thickness={acrylicLiquidGlassMaterial.thickness}
          roughness={acrylicLiquidGlassMaterial.roughness}
          metalness={acrylicLiquidGlassMaterial.metalness}
          ior={acrylicLiquidGlassMaterial.ior}
          clearcoat={acrylicLiquidGlassMaterial.clearcoat}
          clearcoatRoughness={acrylicLiquidGlassMaterial.clearcoatRoughness}
          reflectivity={acrylicLiquidGlassMaterial.reflectivity}
          envMapIntensity={acrylicLiquidGlassMaterial.envMapIntensity}
          attenuationColor={acrylicLiquidGlassMaterial.attenuationColor}
          attenuationDistance={acrylicLiquidGlassMaterial.attenuationDistance}
          emissive={selected ? "#ffffff" : "#000000"}
          emissiveIntensity={selected ? 0.06 : 0}
          wireframe={wireframe}
        />
      ) : (
        <meshStandardMaterial
          map={woodTexture ?? undefined}
          color="#ffffff"
          roughness={0.52}
          metalness={0.02}
          emissive={selected ? "#ffffff" : "#000000"}
          emissiveIntensity={selected ? 0.1 : 0}
          wireframe={wireframe}
        />
      )}
    </mesh>
  );
}

function ShelfPanel({
  id,
  y,
  transform,
  material,
  selected,
  active,
  locked,
  wireframe,
  transformMode,
  modifierDuplicate,
  onSelect,
  onOpenContextMenu,
  onModifierDuplicate,
  onTransformChange,
  onPanelEdgeEditStart,
  onPanelEdgePreview,
  onTransformPreview,
  cutouts = [],
}: {
  id: string;
  y: number;
  transform: PartTransform;
  material: PanelMaterial;
  selected: boolean;
  active: boolean;
  locked: boolean;
  wireframe: boolean;
  transformMode: TransformMode;
  modifierDuplicate: boolean;
  onSelect: (id: string, additive?: boolean) => void;
  onOpenContextMenu: PartContextMenuHandler;
  onModifierDuplicate: (id: string) => void;
  onTransformChange: (id: string, transform: PartTransform) => void;
  onPanelEdgeEditStart: (id: string) => void;
  onPanelEdgePreview: PanelEdgePreviewHandler;
  onTransformPreview: (message: string | null) => void;
  cutouts?: PanelCutout[];
}) {
  const basePosition = useMemo(() => new THREE.Vector3(0, y, 0), [y]);

  return (
    <EditablePartGroup
      id={id}
      basePosition={basePosition}
      transform={transform}
      selected={selected}
      active={active}
      locked={locked}
      transformMode={transformMode}
      modifierDuplicate={modifierDuplicate}
      onSelect={onSelect}
      onOpenContextMenu={onOpenContextMenu}
      onModifierDuplicate={onModifierDuplicate}
      onTransformChange={onTransformChange}
      onTransformPreview={onTransformPreview}
    >
      <PanelCutoutMesh
        widthMm={transform.sizeX}
        lengthMm={transform.sizeZ}
        thicknessMm={transform.sizeY}
        cutouts={cutouts}
        material={material}
        selected={selected}
        wireframe={wireframe}
      />
      {active && !locked && (
        <PanelEdgeHandles
          id={id}
          basePosition={basePosition.toArray() as Vec3Tuple}
          transform={transform}
          onEditStart={onPanelEdgeEditStart}
          onPreview={onPanelEdgePreview}
          onTransformPreview={onTransformPreview}
        />
      )}
    </EditablePartGroup>
  );
}

function DimensionLabels({
  bounds,
}: {
  bounds: OverallDesignBounds;
}) {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const sideX = maxX + 0.65;
  const widthY = minY - 0.55;
  const widthZ = minZ - 0.5;
  const depthY = minY - 0.35;
  const label = (axis: "W" | "H" | "D", value: number) => (
    <span
      className="dimension-label dynamic-dimension-label"
      data-overall-axis={axis}
      aria-label={`${axis} overall design dimension ${value} millimeters`}
    >
      {axis} {value} MM
    </span>
  );

  return (
    <>
      <Line points={[[minX, widthY, widthZ], [maxX, widthY, widthZ]]} color="#ffffff" lineWidth={1} dashed />
      <Line points={[[sideX, minY, maxZ + 0.35], [sideX, maxY, maxZ + 0.35]]} color="#ffffff" lineWidth={1} dashed />
      <Line points={[[sideX - 0.2, depthY, minZ], [sideX - 0.2, depthY, maxZ]]} color="#ffffff" lineWidth={1} dashed />
      <Html position={[centerX, widthY - 0.27, widthZ - 0.1]} center pointerEvents="none" style={{ pointerEvents: "none" }}>
        {label("W", bounds.dimensionsMm.width)}
      </Html>
      <Html position={[sideX + 0.3, centerY, maxZ + 0.37]} center pointerEvents="none" style={{ pointerEvents: "none" }}>
        {label("H", bounds.dimensionsMm.height)}
      </Html>
      <Html position={[sideX + 0.05, depthY - 0.2, centerZ]} center pointerEvents="none" style={{ pointerEvents: "none" }}>
        {label("D", bounds.dimensionsMm.depth)}
      </Html>
    </>
  );
}

function SmartReferenceGuides({ moving, alignment }: { moving: Vec3Tuple; alignment: ReferenceAlignment }) {
  const colors: Record<AlignmentAxis, string> = { x: "#ff6464", y: "#7ed957", z: "#4aa8ff" };
  const axisVector: Record<AlignmentAxis, Vec3Tuple> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  return (
    <group name="smart-reference-guides">
      {alignment.guides.map((guide) => {
        const target = guide.referencePosition;
        const separation = Math.hypot(target[0] - moving[0], target[1] - moving[1], target[2] - moving[2]);
        const direction = axisVector[guide.axis];
        const points: [Vec3Tuple, Vec3Tuple] = separation > 0.02
          ? [moving, target]
          : [
              moving.map((value, index) => value - direction[index] * 0.7) as Vec3Tuple,
              moving.map((value, index) => value + direction[index] * 0.7) as Vec3Tuple,
            ];
        const midpoint = points[0].map((value, index) => (value + points[1][index]) / 2) as Vec3Tuple;
        return (
          <group key={`${guide.axis}-${guide.referenceId}`}>
            <Line points={points} color={colors[guide.axis]} lineWidth={1.5} dashed dashSize={0.08} gapSize={0.045} depthTest={false} />
            <Html position={addVec3(midpoint, [0, 0.16, 0])} center pointerEvents="none" style={{ pointerEvents: "none" }}>
              <span className="smart-reference-label" data-guide-axis={guide.axis}>
                {guide.axis.toUpperCase()} 对齐 · {guide.referenceId}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function PairDistanceGuides({
  firstId,
  secondId,
  first,
  second,
}: {
  firstId: string;
  secondId: string;
  first: Vec3Tuple;
  second: Vec3Tuple;
}) {
  const guides = useMemo(() => createPairDistanceGuides(first, second), [
    first[0],
    first[1],
    first[2],
    second[0],
    second[1],
    second[2],
  ]);
  const colors: Record<PairDistanceAxis, string> = {
    x: "#d86b6b",
    y: "#79b96b",
    z: "#6293c7",
  };
  const tickVectors: Record<PairDistanceAxis, Vec3Tuple> = {
    x: [0, 0.05, 0],
    y: [0.05, 0, 0],
    z: [0, 0.05, 0],
  };
  const labelOffsets: Record<PairDistanceAxis, Vec3Tuple> = {
    x: [0, 0.14, 0],
    y: [0.14, 0, 0],
    z: [0, 0, 0.14],
  };
  const tickPoints = (point: Vec3Tuple, tick: Vec3Tuple): [Vec3Tuple, Vec3Tuple] => [
    point.map((value, index) => value - tick[index]) as Vec3Tuple,
    point.map((value, index) => value + tick[index]) as Vec3Tuple,
  ];

  return (
    <group name="pair-distance-guides">
      {guides.map((guide) => {
        const tick = tickVectors[guide.axis];
        const labelPosition = addVec3(guide.midpoint, labelOffsets[guide.axis]);
        return (
          <group key={guide.axis}>
            <Line
              points={[guide.start, guide.end]}
              color={colors[guide.axis]}
              lineWidth={0.75}
              transparent
              opacity={0.82}
              depthTest={false}
              renderOrder={25}
            />
            <Line points={tickPoints(guide.start, tick)} color={colors[guide.axis]} lineWidth={0.75} depthTest={false} renderOrder={25} />
            <Line points={tickPoints(guide.end, tick)} color={colors[guide.axis]} lineWidth={0.75} depthTest={false} renderOrder={25} />
            <Html position={labelPosition} center pointerEvents="none" style={{ pointerEvents: "none" }}>
              <span
                className={`pair-distance-label axis-${guide.axis}`}
                data-pair-distance-axis={guide.axis.toUpperCase()}
                data-distance-mm={guide.distanceMm}
                aria-label={`${guide.axis.toUpperCase()} distance between ${firstId} and ${secondId}: ${guide.distanceMm} millimeters`}
              >
                <b>{guide.axis.toUpperCase()}</b>
                {guide.distanceMm.toFixed(1)} <small>MM</small>
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function GroupTransformController({
  memberIds,
  pivot,
  memberPositions,
  memberTransforms,
  dimensions,
  addedParts,
  transformMode,
  locked,
  onPreviewTransforms,
  onCommitTransforms,
  onTransformPreview,
}: {
  memberIds: string[];
  pivot: Vec3Tuple;
  memberPositions: Record<string, Vec3Tuple>;
  memberTransforms: Record<string, PartTransform>;
  dimensions: FrameDimensions;
  addedParts: AddedPart[];
  transformMode: TransformMode;
  locked: boolean;
  onPreviewTransforms: (transforms: Record<string, PartTransform> | null) => void;
  onCommitTransforms: GroupTransformChangeHandler;
  onTransformPreview: (message: string | null) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [controlObject, setControlObject] = useState<THREE.Group | null>(null);
  const resetKey = `${memberIds.join("|")}::${pivot.join(",")}::${transformMode}`;
  const setGroupRef = useCallback((node: THREE.Group | null) => {
    groupRef.current = node;
    setControlObject((current) => current === node ? current : node);
  }, []);

  const resetControl = useCallback(() => {
    const group = groupRef.current;
    if (!group) return;
    group.position.set(...pivot);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
    group.updateMatrixWorld();
  }, [pivot]);

  useEffect(() => {
    resetControl();
    onPreviewTransforms(null);
  }, [resetKey]);

  const resolveTransforms = useCallback(() => {
    const group = groupRef.current;
    if (!group) return null;
    const placements = transformGroupMembers({
      pivot,
      controlPosition: group.position.toArray() as Vec3Tuple,
      controlRotation: [radToDeg(group.rotation.x), radToDeg(group.rotation.y), radToDeg(group.rotation.z)],
      controlScale: group.scale.toArray() as Vec3Tuple,
      memberIds,
      memberPositions,
      memberTransforms,
    });
    return Object.fromEntries(placements.map(({ id, position, transform }) => [
      id,
      transformAtWorldPoint(id, position, dimensions, addedParts, transform),
    ])) as Record<string, PartTransform>;
  }, [addedParts, dimensions, memberIds, memberPositions, memberTransforms, pivot]);

  return (
    <>
      <group ref={setGroupRef} name="group-transform-pivot" />
      {!locked && controlObject && (
        <TransformControls
          object={controlObject}
          mode={transformMode}
          size={0.82}
          showX
          showY
          showZ
          rotationSnap={Math.PI / 2}
          scaleSnap={0.1}
          onMouseDown={() => {
            onTransformPreview(transformMode === "translate"
              ? `整体移动 ${memberIds.length} 个编组组件`
              : transformMode === "rotate"
                ? `围绕编组中心旋转 ${memberIds.length} 个组件`
                : `围绕编组中心缩放 ${memberIds.length} 个组件`);
          }}
          onObjectChange={() => {
            const next = resolveTransforms();
            if (next) onPreviewTransforms(next);
          }}
          onMouseUp={() => {
            const next = resolveTransforms();
            if (next) onCommitTransforms(next);
            onPreviewTransforms(null);
            onTransformPreview(null);
            resetControl();
          }}
        />
      )}
    </>
  );
}

function ThreeRackScene({
  selectedId,
  selectedIds,
  activeGroupPartIds,
  addedParts,
  renderMode,
  view,
  background,
  transformMode,
  modifierDuplicate,
  explodedViewActive,
  explosionFactor,
  dimensions,
  overallBounds,
  transforms,
  materials,
  panelCutouts,
  resolvedRiskIds,
  deletedIds,
  hiddenIds,
  lockedIds,
  isolatedIds,
  assemblyConnections,
  focusRequest,
  selectionRect,
  onSelect,
  onSelectMany,
  onClearSelection,
  onOpenContextMenu,
  onModifierDuplicate,
  onTransformChange,
  onGroupTransformChange,
  onShaftLengthEditStart,
  onShaftLengthPreview,
  onPanelEdgeEditStart,
  onPanelEdgePreview,
  onTransformPreview,
  onMirrorAxisChange,
}: {
  selectedId: string;
  selectedIds: string[];
  activeGroupPartIds: string[];
  addedParts: AddedPart[];
  renderMode: RenderMode;
  view: ViewMode;
  background: CanvasBg;
  transformMode: TransformMode;
  modifierDuplicate: boolean;
  explodedViewActive: boolean;
  explosionFactor: number;
  dimensions: FrameDimensions;
  overallBounds: OverallDesignBounds | null;
  transforms: Record<string, PartTransform>;
  materials: Record<string, PartMaterial>;
  panelCutouts: Record<string, PanelCutout[]>;
  resolvedRiskIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  isolatedIds: ReadonlySet<string>;
  assemblyConnections: AssemblyConnection[];
  focusRequest: number;
  selectionRect: SelectionRect | null;
  onSelect: (id: string, additive?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
  onOpenContextMenu: PartContextMenuHandler;
  onModifierDuplicate: (id: string) => void;
  onTransformChange: TransformChangeHandler;
  onGroupTransformChange: GroupTransformChangeHandler;
  onShaftLengthEditStart: (id: string) => void;
  onShaftLengthPreview: ShaftLengthPreviewHandler;
  onPanelEdgeEditStart: (id: string) => void;
  onPanelEdgePreview: PanelEdgePreviewHandler;
  onTransformPreview: (message: string | null) => void;
  onMirrorAxisChange: (axis: MirrorAxis) => void;
}) {
  const wireframe = renderMode === "wireframe";
  const showTags = renderMode === "tags";
  const isImageBackground = background === "room" || background === "custom";
  const bgColor = background === "black" ? "#050505" : background === "gray" ? "#929292" : "#f4f4f4";
  const fogFar = background === "black" ? 28 : 40;
  const groundGridSize = Math.max(14, Math.ceil(Math.max(mmToScene(dimensions.width), mmToScene(dimensions.depth)) + 4));
  const sceneNodes = useMemo<Record<string, Vec3Tuple>>(() => sceneNodesForDimensions(dimensions), [dimensions]);
  const sceneHeight = mmToScene(dimensions.height);
  const isVisible = (id: string) =>
    !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id));
  const shaftSegments = useMemo<ShaftSegment[]>(() => buildVisibleShaftSegments({
    dimensions,
    addedParts,
    transforms,
    deletedIds,
    hiddenIds,
    isolatedIds,
  }), [addedParts, deletedIds, dimensions, hiddenIds, isolatedIds, transforms]);
  const panelContactTargets = useMemo<PanelContactTarget[]>(() => {
    return buildPanelContactTargets({ dimensions, addedParts, transforms, deletedIds, hiddenIds, isolatedIds });
  }, [addedParts, deletedIds, dimensions, hiddenIds, isolatedIds, transforms]);
  const panelHoleTargets = useMemo<PanelHoleTarget[]>(() => buildPanelHoleTargets({
    dimensions,
    addedParts,
    transforms,
    panelCutouts,
    deletedIds,
    hiddenIds,
    isolatedIds,
  }), [addedParts, deletedIds, dimensions, hiddenIds, isolatedIds, panelCutouts, transforms]);
  const smartSnapResolver = useCallback((
    connectorId: string,
    ports: ComponentPort[],
  ) => (position: Vec3Tuple, rotation: Vec3Tuple) => {
    const stopPorts = ports.filter((port) => isShaftAssemblyPort(port) && port.behavior === "stop");
    const lockAxialStop = stopPorts.length > 0;
    const connectedShaftIds = lockAxialStop
      ? assemblyConnections
          .filter((connection) => connection.connectorId === connectorId && connection.behavior === "stop")
          .map((connection) => connection.shaftId)
      : [];
    const snap = findBestSmartSnap({
      connectorId,
      proposedPosition: position,
      proposedRotation: rotation,
      ports,
      shafts: shaftSegments,
      occupiedConnections: assemblyConnections,
      lockPortOrientation: lockAxialStop,
      requiredShaftIds: connectedShaftIds,
    });
    if (!snap || !lockAxialStop) return snap;
    const stopConnection = snap.connections.find((connection) => stopPorts.some((port) => port.id === connection.portId));
    const shaft = shaftSegments.find((candidate) => candidate.partId === stopConnection?.shaftId);
    const part = addedParts.find((candidate) => candidate.id === connectorId)?.libraryPart;
    if (!shaft || !part) return snap;
    const transform = getPartTransform(transforms, connectorId);
    const stopHalfThickness = mmToScene(Math.min(part.dimensions.width, part.dimensions.height, part.dimensions.length))
      * Math.max(Math.abs(transform.scaleX), Math.abs(transform.scaleY), Math.abs(transform.scaleZ)) / 2;
    const panelContact = snapAxialStopToPanelSurface({
      position: snap.position,
      shaft,
      panels: panelContactTargets,
      stopHalfThickness,
      maxDistanceMm: 45,
    });
    return panelContact
      ? {
          ...snap,
          position: panelContact.position,
          panelContact: {
            panelId: panelContact.panelId,
            distanceMm: panelContact.distanceMm,
          },
        }
      : snap;
  }, [addedParts, assemblyConnections, panelContactTargets, shaftSegments, transforms]);
  const panelSurfaceResolver = useCallback((connectorId: string, transform: PartTransform) => (
    position: Vec3Tuple,
    rotation: Vec3Tuple,
    scale: Vec3Tuple,
  ) => snapConnectorToPanelSurface({
    position,
    rotation,
    size: [
      mmToScene(transform.sizeX) * Math.abs(scale[0]),
      mmToScene(transform.sizeY) * Math.abs(scale[1]),
      mmToScene(transform.sizeZ) * Math.abs(scale[2]),
    ],
    panels: panelContactTargets.filter((panel) => panel.partId !== connectorId),
  }), [panelContactTargets]);
  const shaftHoleSnapResolver = useCallback((shaftId: string, localAxis: Vec3Tuple) => {
    const segment = shaftSegments.find((candidate) => candidate.partId === shaftId);
    if (!segment) return undefined;
    const shaftLength = new THREE.Vector3(...segment.end).distanceTo(new THREE.Vector3(...segment.start));
    return (position: Vec3Tuple, rotation: Vec3Tuple) => findBestShaftPanelHoleSnap({
      shaftId,
      proposedPosition: position,
      proposedRotation: rotation,
      localAxis,
      shaftDiameterMm: segment.diameter,
      shaftLength,
      holes: panelHoleTargets,
    });
  }, [panelHoleTargets, shaftSegments]);
  const activeVisibleGroupIds = activeGroupPartIds.filter((id) =>
    !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id)),
  );
  const activeGroupKey = activeVisibleGroupIds.join("|");
  const [groupPreviewTransforms, setGroupPreviewTransforms] = useState<Record<string, PartTransform> | null>(null);
  useEffect(() => setGroupPreviewTransforms(null), [activeGroupKey]);
  const effectiveTransforms = useMemo(() => ({
    ...transforms,
    ...(groupPreviewTransforms ?? {}),
  }), [groupPreviewTransforms, transforms]);
  const basePartCenters = useMemo(() => {
    const centers: Record<string, Vec3Tuple> = {};
    const include = (id: string) =>
      !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id));
    [...allPartIds, ...addedParts.map(({ id }) => id)].forEach((id) => {
      if (include(id)) centers[id] = getPartWorldPosition(id, dimensions, addedParts, transforms);
    });
    return centers;
  }, [addedParts, deletedIds, dimensions, hiddenIds, isolatedIds, transforms]);
  const actualPartCenters = useMemo(() => Object.fromEntries(
    Object.keys(basePartCenters).map((id) => [id, getPartWorldPosition(id, dimensions, addedParts, effectiveTransforms)]),
  ) as Record<string, Vec3Tuple>, [addedParts, basePartCenters, dimensions, effectiveTransforms]);
  const groupPivot = useMemo(() => calculateGroupPivot(
    activeVisibleGroupIds.flatMap((id) => basePartCenters[id] ? [basePartCenters[id]] : []),
  ), [activeGroupKey, basePartCenters]);
  const groupBaseTransforms = useMemo(() => Object.fromEntries(activeVisibleGroupIds.map((id) => [
    id,
    id.startsWith("P-") && !transforms[id]
      ? { ...getPartTransform(transforms, id), sizeX: Math.max(40, dimensions.width - 20), sizeZ: Math.max(40, dimensions.depth - 15) }
      : getPartTransform(transforms, id),
  ])) as Record<string, PartTransform>, [activeGroupKey, dimensions.depth, dimensions.width, transforms]);
  const explosionOffsets = useMemo(() => new Map(generateExplodedView(
    Object.entries(actualPartCenters).map(([id, center]) => ({
      id,
      kind: addedParts.find((part) => part.id === id)?.kind ?? (id.startsWith("R-") ? "rod" : id.startsWith("P-") ? "panel" : "joint"),
      centerMm: center.map((value) => value * 100) as Vec3Tuple,
    })),
    explosionFactor,
  ).map(({ id, offsetMm }) => [id, offsetMm])), [actualPartCenters, addedParts, explosionFactor]);
  const displayTransforms = useMemo(() => Object.fromEntries(
    Object.keys(actualPartCenters).map((id) => {
      const transform = id.startsWith("P-") && !effectiveTransforms[id]
        ? { ...getPartTransform(effectiveTransforms, id), sizeX: Math.max(40, dimensions.width - 20), sizeZ: Math.max(40, dimensions.depth - 15) }
        : getPartTransform(effectiveTransforms, id);
      const offset = explosionOffsets.get(id) ?? [0, 0, 0];
      return [id, { ...transform, x: transform.x + offset[0], y: transform.y + offset[1], z: transform.z + offset[2] }];
    }),
  ) as Record<string, PartTransform>, [actualPartCenters, dimensions.depth, dimensions.width, effectiveTransforms, explosionOffsets]);
  const partCenters = useMemo(() => Object.fromEntries(
    Object.keys(actualPartCenters).map((id) => [id, getPartWorldPosition(id, dimensions, addedParts, displayTransforms)]),
  ) as Record<string, Vec3Tuple>, [actualPartCenters, addedParts, dimensions, displayTransforms]);
  const [referenceDrag, setReferenceDrag] = useState<ReferenceDrag | null>(null);
  const resolveReferenceGuides = useCallback((id: string, position: Vec3Tuple) => findReferenceAlignment({
    movingId: id,
    position,
    references: actualPartCenters,
    thresholdMm: 18,
  }), [actualPartCenters]);
  const referenceGuideContext = useMemo<ReferenceGuideContextValue>(() => ({
    report: (id, position) => setReferenceDrag(position ? { id, position } : null),
    resolve: resolveReferenceGuides,
  }), [resolveReferenceGuides]);
  const activeReferenceAlignment = useMemo(() => referenceDrag
    ? resolveReferenceGuides(referenceDrag.id, referenceDrag.position)
    : null, [referenceDrag, resolveReferenceGuides]);
  const renderTransform = (id: string) => getPartTransform(displayTransforms, id);
  const exploded = explodedViewActive;
  const groupTransforming = activeVisibleGroupIds.length >= 2;
  const groupLocked = activeVisibleGroupIds.some((id) => lockedIds.has(id));
  const selectedLibraryPart = addedParts.find((part) => part.id === selectedId)?.libraryPart;
  const selectedFocusSize = selectedLibraryPart
    ? Math.max(...componentSceneSize(
        selectedLibraryPart.shaftParameters
          ? parameterizedShaftLibraryPart(selectedLibraryPart, renderTransform(selectedId)).dimensions
          : selectedLibraryPart.kind === "panel"
            ? parameterizedPanelLibraryPart(selectedLibraryPart, renderTransform(selectedId)).dimensions
            : selectedLibraryPart.dimensions,
      ))
    : selectedId.startsWith("R-")
      ? mmToScene(getRodBaseLengthMm(selectedId, dimensions, addedParts) * renderTransform(selectedId).sizeX / 100)
      : selectedId.startsWith("P-")
        ? Math.max(mmToScene(renderTransform(selectedId).sizeX), mmToScene(renderTransform(selectedId).sizeZ))
        : 0.34;
  const defaultCameraTarget = useMemo<Vec3Tuple>(() => [0, sceneHeight / 2, 0], [sceneHeight]);
  const presentationBounds = useMemo(() => {
    const centers = Object.values(partCenters);
    if (centers.length === 0) return { target: defaultCameraTarget, size: 1 };
    const min = [0, 1, 2].map((axis) => Math.min(...centers.map((center) => center[axis]))) as Vec3Tuple;
    const max = [0, 1, 2].map((axis) => Math.max(...centers.map((center) => center[axis]))) as Vec3Tuple;
    return {
      target: min.map((value, axis) => (value + max[axis]) / 2) as Vec3Tuple,
      size: Math.max(...max.map((value, axis) => value - min[axis])),
    };
  }, [defaultCameraTarget, partCenters]);

  return (
    <Canvas
      className="r3f-canvas"
      frameloop="demand"
      camera={{ position: [12, 8.5, 14], fov: 42, near: 0.1, far: 100 }}
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={(event) => {
        if (event.button === 0) onClearSelection();
      }}
    >
      {!isImageBackground && <color attach="background" args={[bgColor]} />}
      <ambientLight intensity={isImageBackground ? 0.8 : 0.55} />
      <directionalLight position={[5, 9, 6]} intensity={1.5} />
      <pointLight position={[-6, 5, -4]} intensity={0.8} color="#ffffff" />
      {!isImageBackground && <fog attach="fog" args={[bgColor, 12, fogFar]} />}
      <GroundReferenceGrid background={background} size={groundGridSize} />
      <CameraRig
        view={view}
        focusRequest={focusRequest}
        defaultTarget={defaultCameraTarget}
        focusTarget={partCenters[selectedId]}
        focusSize={selectedFocusSize}
        presentationFactor={explosionFactor}
        presentationTarget={presentationBounds.target}
        presentationSize={presentationBounds.size}
        onMirrorAxisChange={onMirrorAxisChange}
      />
      <BoxSelectionProjector selectionRect={selectionRect} partCenters={partCenters} onSelectMany={onSelectMany} />
      <TransformHandleProbe
        position={groupTransforming ? groupPivot : partCenters[selectedId]}
        enabled={!exploded && (groupTransforming ? !groupLocked : selectedIds.includes(selectedId) && !lockedIds.has(selectedId))}
      />
      <SceneModeMetadata explosionFactor={explosionFactor} />
      <PanelCutoutMetadata selectedId={selectedId} cutouts={panelCutouts} />
      <StudioEnvironment />
      <ViewOrientationGizmo />

      {!exploded && groupTransforming && (
        <GroupTransformController
          memberIds={activeVisibleGroupIds}
          pivot={groupPivot}
          memberPositions={basePartCenters}
          memberTransforms={groupBaseTransforms}
          dimensions={dimensions}
          addedParts={addedParts}
          transformMode={transformMode}
          locked={groupLocked}
          onPreviewTransforms={setGroupPreviewTransforms}
          onCommitTransforms={onGroupTransformChange}
          onTransformPreview={onTransformPreview}
        />
      )}

      {referenceDrag && activeReferenceAlignment && activeReferenceAlignment.guides.length > 0 && (
        <SmartReferenceGuides moving={referenceDrag.position} alignment={activeReferenceAlignment} />
      )}

      {!exploded && selectedIds.length === 2 && partCenters[selectedIds[0]] && partCenters[selectedIds[1]] && (
        <PairDistanceGuides
          firstId={selectedIds[0]}
          secondId={selectedIds[1]}
          first={partCenters[selectedIds[0]]}
          second={partCenters[selectedIds[1]]}
        />
      )}

      <ReferenceGuideContext.Provider value={referenceGuideContext}>
      {panels.filter((panel) => isVisible(panel.id)).map((panel) => (
        <ShelfPanel
          key={panel.id}
          id={panel.id}
          y={builtInPanelYs(dimensions)[Number(panel.id.slice(-1)) - 1]}
          transform={exploded
            ? renderTransform(panel.id)
            : transforms[panel.id] ?? {
              ...getDefaultTransform(panel.id),
              sizeX: Math.max(100, dimensions.width - 20),
              sizeZ: Math.max(100, dimensions.depth - 15),
            }
          }
          material={getPartMaterial(materials, panel.id) as PanelMaterial}
          selected={selectedIds.includes(panel.id)}
          active={!groupTransforming && selectedIds.includes(panel.id) && selectedId === panel.id}
          locked={exploded || lockedIds.has(panel.id)}
          wireframe={wireframe}
          transformMode={transformMode}
          modifierDuplicate={modifierDuplicate}
          onSelect={onSelect}
          onOpenContextMenu={onOpenContextMenu}
          onModifierDuplicate={onModifierDuplicate}
          onTransformChange={onTransformChange}
          onPanelEdgeEditStart={onPanelEdgeEditStart}
          onPanelEdgePreview={onPanelEdgePreview}
          onTransformPreview={onTransformPreview}
          cutouts={panelCutouts[panel.id] ?? []}
        />
      ))}

      {rods.filter(([id]) => isVisible(id)).map(([id, startNode, endNode]) => (
        <ShaftRod
          key={id}
          id={id}
          start={sceneNodes[startNode]}
          end={sceneNodes[endNode]}
          transform={renderTransform(id)}
          material={getPartMaterial(materials, id) as MetalMaterial}
          selected={selectedIds.includes(id)}
          active={!groupTransforming && selectedIds.includes(id) && selectedId === id}
          locked={exploded || lockedIds.has(id)}
          wireframe={wireframe}
          transformMode={transformMode}
          modifierDuplicate={modifierDuplicate}
          resolveSmartSnap={shaftHoleSnapResolver(
            id,
            new THREE.Vector3(...sceneNodes[endNode]).sub(new THREE.Vector3(...sceneNodes[startNode])).normalize().toArray() as Vec3Tuple,
          )}
          onSelect={onSelect}
          onOpenContextMenu={onOpenContextMenu}
          onModifierDuplicate={onModifierDuplicate}
          onTransformChange={onTransformChange}
          onShaftLengthEditStart={onShaftLengthEditStart}
          onShaftLengthPreview={onShaftLengthPreview}
          onTransformPreview={onTransformPreview}
        />
      ))}

      {joints.filter((joint) => isVisible(joint.id)).map((joint) => (
        <ConnectorNode
          key={joint.id}
          id={joint.id}
          position={sceneNodes[joint.nodeId]}
          transform={renderTransform(joint.id)}
          material={getPartMaterial(materials, joint.id) as MetalMaterial}
          selected={selectedIds.includes(joint.id)}
          active={!groupTransforming && selectedIds.includes(joint.id) && selectedId === joint.id}
          locked={exploded || lockedIds.has(joint.id)}
          snapPoints={Object.values(sceneNodes)}
          resolveSmartSnap={smartSnapResolver(joint.id, fittedComponentPorts(defaultCrossConnectorPart))}
          resolvePanelSurface={panelSurfaceResolver(joint.id, renderTransform(joint.id))}
          warning={joint.warning && !resolvedRiskIds.has(joint.id)}
          showTags={showTags}
          transformMode={transformMode}
          modifierDuplicate={modifierDuplicate}
          onSelect={onSelect}
          onOpenContextMenu={onOpenContextMenu}
          onModifierDuplicate={onModifierDuplicate}
          onTransformChange={onTransformChange}
          onTransformPreview={onTransformPreview}
        />
      ))}

      {addedParts
        .filter(({ id, libraryPart }) => Boolean(libraryPart) && isVisible(id))
        .map((part) => {
          const transform = renderTransform(part.id);
          const parameterizedPart = part.kind === "rod"
            ? parameterizedShaftLibraryPart(part.libraryPart!, transform)
            : part.kind === "panel"
              ? parameterizedPanelLibraryPart(part.libraryPart!, transform)
              : part.libraryPart!;
          const renderedPart = applyInstanceMaterial(parameterizedPart, getPartMaterial(materials, part.id));
          const renderedPorts = fittedComponentPorts(renderedPart);
          const basePosition = new THREE.Vector3(...getPartBasePosition(part.id, dimensions, addedParts));
          return (
            <EditablePartGroup
              key={part.id}
              id={part.id}
              basePosition={basePosition}
              transform={transform}
              selected={selectedIds.includes(part.id)}
              active={!groupTransforming && selectedIds.includes(part.id) && selectedId === part.id}
              locked={exploded || lockedIds.has(part.id)}
              snapPoints={Object.values(sceneNodes)}
              resolveSmartSnap={part.kind === "joint"
                ? smartSnapResolver(part.id, renderedPorts)
                : part.kind === "rod"
                  ? shaftHoleSnapResolver(part.id, [0, 0, 1])
                  : undefined}
              resolvePanelSurface={part.kind === "joint" ? panelSurfaceResolver(part.id, transform) : undefined}
              transformMode={transformMode}
              modifierDuplicate={modifierDuplicate}
              onSelect={onSelect}
              onOpenContextMenu={onOpenContextMenu}
              onModifierDuplicate={onModifierDuplicate}
              onTransformChange={onTransformChange}
              onTransformPreview={onTransformPreview}
            >
              <group>
                <Suspense fallback={null}>
                  {part.kind === "panel" && (panelCutouts[part.id]?.length ?? 0) > 0 ? (
                    <PanelCutoutMesh
                      widthMm={transform.sizeX}
                      lengthMm={transform.sizeZ}
                      thicknessMm={transform.sizeY}
                      cutouts={panelCutouts[part.id]}
                      material={getPartMaterial(materials, part.id) as PanelMaterial}
                      selected={selectedIds.includes(part.id)}
                      wireframe={wireframe}
                    />
                  ) : renderedPart.modelAssetUrl ? <ImportedComponentModel part={renderedPart} displayMode="scene" /> : <ComponentModel part={renderedPart} displayMode="scene" />}
                </Suspense>
                {selectedIds.includes(part.id) && part.kind === "joint" && <ComponentPortMarkers ports={renderedPorts} unitsPerMm={componentDisplayUnitsPerMm(renderedPart, "scene")} />}
                {selectedIds.includes(part.id) && <mesh><boxGeometry args={componentSceneSize(renderedPart.dimensions, 0.02)} /><meshBasicMaterial color="#f2b21b" wireframe transparent opacity={0.58} /></mesh>}
                {part.kind === "rod" && !exploded && !groupTransforming && selectedIds.includes(part.id) && selectedId === part.id && !lockedIds.has(part.id) && (
                  <ShaftLengthHandles
                    id={part.id}
                    basePosition={basePosition.toArray() as Vec3Tuple}
                    baseLengthScene={mmToScene(part.libraryPart!.shaftParameters?.length ?? part.libraryPart!.dimensions.length)}
                    localAxis={[0, 0, 1]}
                    transform={transform}
                    radius={Math.max(0.025, mmToScene(transform.sizeY) / 2)}
                    onEditStart={onShaftLengthEditStart}
                    onPreview={onShaftLengthPreview}
                    onTransformPreview={onTransformPreview}
                  />
                )}
                {part.kind === "panel" && !exploded && !groupTransforming && selectedIds.includes(part.id) && selectedId === part.id && !lockedIds.has(part.id) && (
                  <PanelEdgeHandles
                    id={part.id}
                    basePosition={basePosition.toArray() as Vec3Tuple}
                    transform={transform}
                    onEditStart={onPanelEdgeEditStart}
                    onPreview={onPanelEdgePreview}
                    onTransformPreview={onTransformPreview}
                  />
                )}
              </group>
            </EditablePartGroup>
          );
        })}

      {addedParts
        .filter(({ id, kind, libraryPart }) => !libraryPart && kind === "panel" && isVisible(id))
        .map((part) => (
          <ShelfPanel
            key={part.id}
            id={part.id}
            y={getPartBasePosition(part.id, dimensions, addedParts)[1]}
            transform={renderTransform(part.id)}
            material={getPartMaterial(materials, part.id) as PanelMaterial}
            selected={selectedIds.includes(part.id)}
            active={!groupTransforming && selectedIds.includes(part.id) && selectedId === part.id}
            locked={exploded || lockedIds.has(part.id)}
            wireframe={wireframe}
            transformMode={transformMode}
            modifierDuplicate={modifierDuplicate}
            onSelect={onSelect}
            onOpenContextMenu={onOpenContextMenu}
            onModifierDuplicate={onModifierDuplicate}
            onTransformChange={onTransformChange}
            onPanelEdgeEditStart={onPanelEdgeEditStart}
            onPanelEdgePreview={onPanelEdgePreview}
            onTransformPreview={onTransformPreview}
          />
        ))}

      {addedParts
        .filter(({ id, kind, libraryPart }) => !libraryPart && kind === "rod" && isVisible(id))
        .map((part) => (
          <ShaftRod
            key={part.id}
            id={part.id}
            start={addVec3(getPartBasePosition(part.id, dimensions, addedParts), [-1.5, 0, 0])}
            end={addVec3(getPartBasePosition(part.id, dimensions, addedParts), [1.5, 0, 0])}
            transform={renderTransform(part.id)}
            material={getPartMaterial(materials, part.id) as MetalMaterial}
            selected={selectedIds.includes(part.id)}
            active={!groupTransforming && selectedIds.includes(part.id) && selectedId === part.id}
            locked={exploded || lockedIds.has(part.id)}
            wireframe={wireframe}
            transformMode={transformMode}
            modifierDuplicate={modifierDuplicate}
            resolveSmartSnap={shaftHoleSnapResolver(part.id, [1, 0, 0])}
            onSelect={onSelect}
            onOpenContextMenu={onOpenContextMenu}
            onModifierDuplicate={onModifierDuplicate}
            onTransformChange={onTransformChange}
            onShaftLengthEditStart={onShaftLengthEditStart}
            onShaftLengthPreview={onShaftLengthPreview}
            onTransformPreview={onTransformPreview}
          />
        ))}

      {addedParts
        .filter(({ id, kind, libraryPart }) => !libraryPart && kind === "joint" && isVisible(id))
        .map((part) => (
          <ConnectorNode
            key={part.id}
            id={part.id}
            position={getPartBasePosition(part.id, dimensions, addedParts)}
            transform={renderTransform(part.id)}
            material={getPartMaterial(materials, part.id) as MetalMaterial}
            selected={selectedIds.includes(part.id)}
            active={!groupTransforming && selectedIds.includes(part.id) && selectedId === part.id}
            locked={exploded || lockedIds.has(part.id)}
            snapPoints={Object.values(sceneNodes)}
            resolveSmartSnap={smartSnapResolver(part.id, fittedComponentPorts(defaultCrossConnectorPart))}
            resolvePanelSurface={panelSurfaceResolver(part.id, renderTransform(part.id))}
            warning={false}
            showTags={showTags}
            transformMode={transformMode}
            modifierDuplicate={modifierDuplicate}
            onSelect={onSelect}
            onOpenContextMenu={onOpenContextMenu}
            onModifierDuplicate={onModifierDuplicate}
            onTransformChange={onTransformChange}
            onTransformPreview={onTransformPreview}
          />
        ))}
      </ReferenceGuideContext.Provider>

      {!exploded && overallBounds && (
        <DimensionLabels bounds={overallBounds} />
      )}
    </Canvas>
  );
}

function CanvasPanel({
  selectedId,
  selectedIds,
  activeGroupPartIds,
  addedParts,
  background,
  customBackgroundUrl,
  referenceImageDataUrl,
  referenceImageVisible,
  transforms,
  materials,
  panelCutouts,
  resolvedRiskIds,
  deletedIds,
  hiddenIds,
  lockedIds,
  isolatedIds,
  assemblyConnections,
  preciseAssemblyRelations,
  focusRequest,
  onSelect,
  onSelectMany,
  onClearSelection,
  onSelectAllVisible,
  onShowAllParts,
  onAddPart,
  onSmartAlign,
  canSmartAlign,
  onAlignPair,
  onConnectPair,
  canConnectPair,
  onSurfaceContact,
  onSurfaceGap,
  canSurfacePair,
  onExchangePair,
  onMirrorSelection,
  onFlipSelection,
  onRotateSelection,
  onModifierDuplicate,
  onCopySelection,
  onPasteClipboard,
  canPaste,
  onOpenPartPicker,
  onOpenTemplatePicker,
  onSaveProject,
  onQuickFix,
  onResetTransform,
  onDeletePart,
  onTransformChange,
  onGroupTransformChange,
  onShaftLengthEditStart,
  onShaftLengthPreview,
  onPanelEdgeEditStart,
  onPanelEdgePreview,
  onBackgroundChange,
  onBackgroundUpload,
  onReferenceImageUpload,
  onReferenceImageVisibleChange,
  onReferenceImageClear,
  dimensions,
  overallBounds,
  onMirrorAxisChange,
  lang,
}: {
  selectedId: string;
  selectedIds: string[];
  activeGroupPartIds: string[];
  addedParts: AddedPart[];
  background: CanvasBg;
  customBackgroundUrl: string | null;
  referenceImageDataUrl: string | null;
  referenceImageVisible: boolean;
  transforms: Record<string, PartTransform>;
  materials: Record<string, PartMaterial>;
  panelCutouts: Record<string, PanelCutout[]>;
  resolvedRiskIds: ReadonlySet<string>;
  deletedIds: ReadonlySet<string>;
  hiddenIds: ReadonlySet<string>;
  lockedIds: ReadonlySet<string>;
  isolatedIds: ReadonlySet<string>;
  assemblyConnections: AssemblyConnection[];
  preciseAssemblyRelations: PreciseAssemblyRelation[];
  focusRequest: number;
  onSelect: (id: string, additive?: boolean) => void;
  onSelectMany: (ids: string[]) => void;
  onClearSelection: () => void;
  onSelectAllVisible: () => void;
  onShowAllParts: () => void;
  onAddPart: (kind: PartKind, placement?: SmartPlacement) => void;
  onSmartAlign: () => void;
  canSmartAlign: boolean;
  onAlignPair: (axis: AlignmentAxis) => void;
  onConnectPair: () => void;
  canConnectPair: boolean;
  onSurfaceContact: () => void;
  onSurfaceGap: (gapMm: number) => void;
  canSurfacePair: boolean;
  onExchangePair: () => void;
  onMirrorSelection: () => void;
  onFlipSelection: (direction: FlipDirection) => void;
  onRotateSelection: (axis: QuickRotateAxis, direction: QuickRotateDirection) => void;
  onModifierDuplicate: (id: string) => void;
  onCopySelection: () => void;
  onPasteClipboard: () => void;
  canPaste: boolean;
  onOpenPartPicker: (placement?: SmartPlacement) => void;
  onOpenTemplatePicker: () => void;
  onSaveProject: () => void;
  onQuickFix: (id: string) => void;
  onResetTransform: (id: string) => void;
  onDeletePart: (id: string) => void;
  onTransformChange: TransformChangeHandler;
  onGroupTransformChange: GroupTransformChangeHandler;
  onShaftLengthEditStart: (id: string) => void;
  onShaftLengthPreview: ShaftLengthPreviewHandler;
  onPanelEdgeEditStart: (id: string) => void;
  onPanelEdgePreview: PanelEdgePreviewHandler;
  onBackgroundChange: (background: CanvasBg) => void;
  onBackgroundUpload: (file: File) => void;
  onReferenceImageUpload: (file: File) => Promise<void>;
  onReferenceImageVisibleChange: (visible: boolean) => void;
  onReferenceImageClear: () => void;
  dimensions: FrameDimensions;
  overallBounds: OverallDesignBounds | null;
  onMirrorAxisChange: (axis: MirrorAxis) => void;
  lang: Lang;
}) {
  const [view, setView] = useState<ViewMode>("perspective");
  const [pairGapMm, setPairGapMm] = useState(5);
  const [renderMode, setRenderMode] = useState<RenderMode>("solid");
  const [expandedToolbar, setExpandedToolbar] = useState<"view" | "render" | "background" | "selection" | "transform" | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>("translate");
  const [modifierDuplicate, setModifierDuplicate] = useState(false);
  const [explodedViewActive, setExplodedViewActive] = useState(false);
  const [explosionPercent, setExplosionPercent] = useState(0);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("click");
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionDragRect, setSelectionDragRect] = useState<SelectionRect | null>(null);
  const [completedSelectionRect, setCompletedSelectionRect] = useState<SelectionRect | null>(null);
  const [transformPreview, setTransformPreview] = useState<string | null>(null);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [referenceImageError, setReferenceImageError] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
    worldPoint: Vec3Tuple;
  } | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number } | null>(null);
  const canvasPanelRef = useRef<HTMLElement>(null);
  const t = copy[lang];
  const sceneIsEmpty = [...allPartIds, ...addedParts.map(({ id }) => id)].every((id) => deletedIds.has(id));
  const contextPart = contextMenu
    ? getPartInfo(contextMenu.id, lang, resolvedRiskIds, addedParts)
    : null;
  const imageBackgroundUrl =
    background === "custom" && customBackgroundUrl
      ? customBackgroundUrl
      : "/assets/images/living-room-default.webp";
  const imageBackgroundStyle =
    background === "room" || background === "custom"
      ? {
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.1), rgba(0, 0, 0, 0.1)), url("${imageBackgroundUrl}")`,
        }
      : undefined;
  const enterExplodedView = () => {
    setExplodedViewActive(true);
    setExplosionPercent(65);
  };
  const restoreAssemblyView = () => {
    setExplosionPercent(0);
    setExplodedViewActive(false);
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "BUTTON" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }

      if (event.key.toLowerCase() === "g") setTransformMode("translate");
      if (event.key.toLowerCase() === "r") setTransformMode("rotate");
      if (event.key.toLowerCase() === "s") setTransformMode("scale");
      if (event.key.toLowerCase() === "v") setSelectionMode("click");
      if (event.key.toLowerCase() === "b") setSelectionMode("box");
      if (event.key === "0") setView("perspective");
      if (event.key === "1") setView("front");
      if (event.key === "2") setView("side");
      if (event.key === "3") setView("top");
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const updateModifier = (event: KeyboardEvent) => {
      document.documentElement.dataset.axisframeModifierDuplicate = String(event.altKey);
      setModifierDuplicate(event.altKey);
    };
    const clearModifier = () => {
      document.documentElement.dataset.axisframeModifierDuplicate = "false";
      setModifierDuplicate(false);
    };
    window.addEventListener("keydown", updateModifier);
    window.addEventListener("keyup", updateModifier);
    window.addEventListener("blur", clearModifier);
    return () => {
      window.removeEventListener("keydown", updateModifier);
      window.removeEventListener("keyup", updateModifier);
      window.removeEventListener("blur", clearModifier);
      delete document.documentElement.dataset.axisframeModifierDuplicate;
    };
  }, []);

  useEffect(() => {
    if (!contextMenu && !canvasContextMenu) return;
    const closeMenu = () => {
      setContextMenu(null);
      setCanvasContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [canvasContextMenu, contextMenu]);

  const openContextMenu: PartContextMenuHandler = (id, clientX, clientY, worldPoint) => {
    const rect = canvasPanelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCanvasContextMenu(null);
    setContextMenu({
      id,
      x: Math.min(Math.max(8, clientX - rect.left), rect.width - 196),
      y: Math.min(Math.max(8, clientY - rect.top), Math.max(8, rect.height - 410)),
      worldPoint,
    });
  };

  const openCanvasContextMenu = (clientX: number, clientY: number) => {
    const rect = canvasPanelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setContextMenu(null);
    setCanvasContextMenu({
      x: Math.min(Math.max(8, clientX - rect.left), rect.width - 214),
      y: Math.min(Math.max(8, clientY - rect.top), Math.max(8, rect.height - 416)),
    });
  };

  const selectionPoint = (event: React.PointerEvent<HTMLElement>) => {
    const bounds = canvasPanelRef.current?.getBoundingClientRect();
    return bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null;
  };

  const selectionRectFromPoints = (start: { x: number; y: number }, end: { x: number; y: number }): SelectionRect => ({
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  });

  return (
    <main
      ref={canvasPanelRef}
      className={`canvas-panel ${background === "room" || background === "custom" ? "image-background" : ""}`}
      aria-label="3D designer canvas"
      style={imageBackgroundStyle}
      onContextMenu={(event) => {
        if (event.defaultPrevented) return;
        event.preventDefault();
        if ((event.target as HTMLElement).closest(".canvas-toolbar, .part-context-menu, .reference-image-dock, .canvas-add-component-fab")) return;
        openCanvasContextMenu(event.clientX, event.clientY);
      }}
    >
      <div className="canvas-command-bar" aria-label="Canvas tools">
        <div className="canvas-toolbar smart-align-toolbar">
          <button
            type="button"
            data-testid="smart-align-button"
            disabled={!canSmartAlign}
            aria-label={lang === "zh" ? "智能对齐已添加零件" : "SMART ALIGN ADDED PARTS"}
            title={lang === "zh" ? "整理全部可见、未锁定的已添加零件；模板原件和锁定零件保持不动" : "Align all visible unlocked added parts while preserving template and locked parts"}
            onClick={onSmartAlign}
          >
            <WandSparkles size={14} />{lang === "zh" ? "智能对齐" : "SMART ALIGN"}
          </button>
        </div>
        <div className="canvas-toolbar exploded-view-toolbar">
          <button
            type="button"
            className={explodedViewActive ? "active" : ""}
            aria-pressed={explodedViewActive}
            aria-label={lang === "zh" ? (explodedViewActive ? "复原装配视图" : "自动生成爆炸图") : (explodedViewActive ? "RESTORE ASSEMBLY VIEW" : "GENERATE EXPLODED VIEW")}
            onClick={explodedViewActive ? restoreAssemblyView : enterExplodedView}
          >
            {explodedViewActive ? <Group size={14} /> : <Ungroup size={14} />}
            {lang === "zh" ? (explodedViewActive ? "复原" : "爆炸图") : (explodedViewActive ? "RESTORE" : "EXPLODE")}
          </button>
        </div>
        <div className={`canvas-toolbar hover-select-toolbar view-toolbar ${expandedToolbar === "view" ? "expanded" : ""}`} onPointerEnter={() => setExpandedToolbar("view")} onPointerLeave={() => setExpandedToolbar((current) => current === "view" ? null : current)}>
          <button className="toolbar-current" type="button" aria-haspopup="menu" aria-expanded={expandedToolbar === "view"} onClick={() => setExpandedToolbar((current) => current === "view" ? null : "view")}><span>{t.view}</span><strong>{t.views[view]}</strong><ChevronDown size={12} /></button>
          <div className="toolbar-dropdown" role="menu">
            {(["perspective", "top", "front", "side"] as const).map((item) => <button type="button" role="menuitem" key={item} className={view === item ? "active" : ""} onClick={() => { setView(item); setExpandedToolbar(null); }}>{t.views[item]}</button>)}
          </div>
        </div>
        <div className={`canvas-toolbar hover-select-toolbar render-toolbar ${expandedToolbar === "render" ? "expanded" : ""}`} onPointerEnter={() => setExpandedToolbar("render")} onPointerLeave={() => setExpandedToolbar((current) => current === "render" ? null : current)}>
          <button className="toolbar-current" type="button" aria-haspopup="menu" aria-expanded={expandedToolbar === "render"} onClick={() => setExpandedToolbar((current) => current === "render" ? null : "render")}><span>{t.mode}</span><strong>{t.modes[renderMode]}</strong><ChevronDown size={12} /></button>
          <div className="toolbar-dropdown" role="menu">
            {(["wireframe", "solid", "tags"] as const).map((item) => <button type="button" role="menuitem" key={item} className={renderMode === item ? "active" : ""} onClick={() => { setRenderMode(item); setExpandedToolbar(null); }}>{t.modes[item]}</button>)}
          </div>
        </div>
        <div className={`canvas-toolbar hover-select-toolbar bg-toolbar ${expandedToolbar === "background" ? "expanded" : ""}`} onPointerEnter={() => setExpandedToolbar("background")} onPointerLeave={() => setExpandedToolbar((current) => current === "background" ? null : current)}>
          <button className="toolbar-current" type="button" aria-haspopup="menu" aria-expanded={expandedToolbar === "background"} onClick={() => setExpandedToolbar((current) => current === "background" ? null : "background")}><span>{t.background}</span><strong>{background === "custom" ? t.uploadBackground : t.backgrounds[background]}</strong><ChevronDown size={12} /></button>
          <div className="toolbar-dropdown" role="menu">
            {(["black", "gray", "white", "room"] as const).map((item) => <button type="button" role="menuitem" key={item} className={background === item ? "active" : ""} onClick={() => { onBackgroundChange(item); setExpandedToolbar(null); }}>{t.backgrounds[item]}</button>)}
            <label className={`background-upload ${background === "custom" ? "active" : ""}`} title={t.uploadBackground} aria-label={t.uploadBackground}><ImageUp size={14} /><span>{t.uploadBackground}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) onBackgroundUpload(file); setExpandedToolbar(null); event.target.value = ""; }} /></label>
          </div>
        </div>
        <div className={`canvas-toolbar hover-select-toolbar selection-toolbar ${expandedToolbar === "selection" ? "expanded" : ""}`} onPointerEnter={() => setExpandedToolbar("selection")} onPointerLeave={() => setExpandedToolbar((current) => current === "selection" ? null : current)}>
          <button className="toolbar-current" type="button" aria-haspopup="menu" aria-expanded={expandedToolbar === "selection"} onClick={() => setExpandedToolbar((current) => current === "selection" ? null : "selection")}><span>{t.selection}</span><strong>{selectionMode === "click" ? t.clickSelect : t.boxSelect}</strong><ChevronDown size={12} /></button>
          <div className="toolbar-dropdown" role="menu">
            <button type="button" role="menuitem" className={selectionMode === "click" ? "active" : ""} onClick={() => { setSelectionMode("click"); setExpandedToolbar(null); }}><MousePointer2 size={13} />{t.clickSelect}<kbd>V</kbd></button>
            <button type="button" role="menuitem" className={selectionMode === "box" ? "active" : ""} onClick={() => { setSelectionMode("box"); setExpandedToolbar(null); }}><ScanSearch size={13} />{t.boxSelect}<kbd>B</kbd></button>
          </div>
        </div>
        <div className={`canvas-toolbar hover-select-toolbar transform-toolbar ${expandedToolbar === "transform" ? "expanded" : ""}`} onPointerEnter={() => setExpandedToolbar("transform")} onPointerLeave={() => setExpandedToolbar((current) => current === "transform" ? null : current)}>
          <button className="toolbar-current" type="button" aria-haspopup="menu" aria-expanded={expandedToolbar === "transform"} onClick={() => setExpandedToolbar((current) => current === "transform" ? null : "transform")}><span>3D</span><strong>{transformMode === "translate" ? t.move : transformMode === "rotate" ? t.rotateMode : t.scaleMode}</strong><ChevronDown size={12} /></button>
          <div className="toolbar-dropdown" role="menu">
            <button type="button" role="menuitem" className={transformMode === "translate" ? "active" : ""} onClick={() => { setTransformMode("translate"); setExpandedToolbar(null); }}>{t.move}<kbd>G</kbd></button>
            <button type="button" role="menuitem" className={transformMode === "rotate" ? "active" : ""} onClick={() => { setTransformMode("rotate"); setExpandedToolbar(null); }}>{t.rotateMode}<kbd>R</kbd></button>
            <button type="button" role="menuitem" className={transformMode === "scale" ? "active" : ""} onClick={() => { setTransformMode("scale"); setExpandedToolbar(null); }}>{t.scaleMode}<kbd>S</kbd></button>
          </div>
        </div>
      </div>
      <aside
        className={`reference-image-dock ${referencePanelOpen ? "open" : ""}`}
        aria-label={lang === "zh" ? "参考图" : "REFERENCE IMAGE"}
      >
        <button
          className="reference-image-tab"
          type="button"
          aria-expanded={referencePanelOpen}
          aria-controls="reference-image-panel"
          onClick={() => setReferencePanelOpen((current) => !current)}
        >
          <ImageUp size={15} />
          <span>{lang === "zh" ? "参考图" : "REFERENCE"}</span>
          {referenceImageDataUrl && referenceImageVisible && <i aria-label={lang === "zh" ? "参考图已开启" : "REFERENCE IMAGE ON"} />}
        </button>
        {referencePanelOpen && (
          <section id="reference-image-panel" className="reference-image-card">
            <header>
              <div>
                <span>{lang === "zh" ? "设计辅助" : "DESIGN AID"}</span>
                <strong>{lang === "zh" ? "参考图" : "REFERENCE IMAGE"}</strong>
              </div>
              <button
                type="button"
                aria-label={lang === "zh" ? "收起参考图" : "COLLAPSE REFERENCE IMAGE"}
                onClick={() => setReferencePanelOpen(false)}
              >
                <ChevronLeft size={15} />
              </button>
            </header>
            <div className={`reference-image-preview ${referenceImageDataUrl && referenceImageVisible ? "has-image" : ""}`}>
              {referenceImageDataUrl && referenceImageVisible ? (
                <img src={referenceImageDataUrl} alt={lang === "zh" ? "设计参考图" : "DESIGN REFERENCE"} />
              ) : (
                <div className="reference-image-empty">
                  {referenceImageDataUrl ? <EyeOff size={22} /> : <ImageUp size={22} />}
                  <strong>{referenceImageDataUrl
                    ? (lang === "zh" ? "参考图已关闭" : "REFERENCE HIDDEN")
                    : (lang === "zh" ? "还没有参考图" : "NO REFERENCE YET")}</strong>
                  <span>{lang === "zh" ? "图片仅辅助设计，不改变模型坐标" : "FOR VISUAL GUIDANCE ONLY"}</span>
                </div>
              )}
            </div>
            <div className="reference-image-actions">
              <label className="reference-image-upload">
                <ImageUp size={14} />
                <span>{referenceImageDataUrl
                  ? (lang === "zh" ? "更换图片" : "REPLACE")
                  : (lang === "zh" ? "选择图片" : "CHOOSE IMAGE")}</span>
                <input
                  data-testid="reference-image-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setReferenceImageError("");
                    try {
                      await onReferenceImageUpload(file);
                    } catch (error) {
                      setReferenceImageError(error instanceof Error ? error.message : (lang === "zh" ? "图片读取失败" : "IMAGE LOAD FAILED"));
                    }
                  }}
                />
              </label>
              <button
                className={`reference-image-switch ${referenceImageVisible ? "active" : ""}`}
                type="button"
                role="switch"
                aria-checked={referenceImageVisible}
                disabled={!referenceImageDataUrl}
                onClick={() => onReferenceImageVisibleChange(!referenceImageVisible)}
              >
                {referenceImageVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{lang === "zh" ? "显示" : "SHOW"}</span>
                <i aria-hidden="true" />
              </button>
            </div>
            {referenceImageDataUrl && (
              <button className="reference-image-clear" type="button" onClick={onReferenceImageClear}>
                <Trash2 size={13} />{lang === "zh" ? "移除参考图" : "REMOVE REFERENCE"}
              </button>
            )}
            {referenceImageError && <p className="reference-image-error" role="alert">{referenceImageError}</p>}
          </section>
        )}
      </aside>
      <button
        className={`canvas-add-component-fab ${explodedViewActive ? "raised" : ""}`}
        data-testid="canvas-add-component"
        type="button"
        title={lang === "zh" ? "添加组件" : "ADD COMPONENT"}
        aria-label={lang === "zh" ? "添加组件" : "ADD COMPONENT"}
        onClick={() => onOpenPartPicker()}
      >
        <Plus size={24} strokeWidth={2.2} />
      </button>
      {selectedIds.length === 2 && activeGroupPartIds.length === 0 && !explodedViewActive && (
        <div className="pair-constraint-toolbar" role="group" aria-label={lang === "zh" ? "双组件对齐与连接" : "PAIR ALIGNMENT AND CONNECTION"}>
          <div className="pair-constraint-summary">
            <Target size={14} />
            <span>{selectedIds[0]} {lang === "zh" ? "固定" : "FIXED"}</span>
            <strong>→ {selectedIds[1]} {lang === "zh" ? "适应" : "ADAPTS"}</strong>
            <em>{preciseAssemblyRelations.filter((relation) =>
              selectedIds.includes(relation.fixedPartId) && selectedIds.includes(relation.movingPartId)).length} {lang === "zh" ? "关系" : "REL"}</em>
          </div>
          <div className="pair-align-actions" role="group" aria-label={lang === "zh" ? "中心对齐" : "CENTER ALIGNMENT"}>
            {(["x", "y", "z"] as const).map((axis) => (
              <button key={axis} type="button" data-testid={`pair-align-${axis}`} onClick={() => onAlignPair(axis)}>
                {axis.toUpperCase()} {lang === "zh" ? "对齐" : "ALIGN"}
              </button>
            ))}
          </div>
          <div className="pair-precise-actions" role="group" aria-label={lang === "zh" ? "精确装配" : "PRECISE ASSEMBLY"}>
            <button
              type="button"
              data-testid="pair-surface-contact"
              disabled={!canSurfacePair}
              title={lang === "zh" ? "保持 A 不动，使 B 的相对表面贴合" : "KEEP A FIXED AND FIT B TO THE OPPOSING FACE"}
              onClick={onSurfaceContact}
            >
              {lang === "zh" ? "表面贴合" : "CONTACT"}
            </button>
            <label className="pair-gap-field">
              <span>{lang === "zh" ? "间距" : "GAP"}</span>
              <input
                data-testid="pair-surface-gap-input"
                type="number"
                min="0"
                step="0.1"
                value={pairGapMm}
                disabled={!canSurfacePair}
                aria-label={lang === "zh" ? "表面间距毫米" : "SURFACE GAP MILLIMETERS"}
                onChange={(event) => setPairGapMm(Math.max(0, Number(event.target.value) || 0))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSurfacePair) onSurfaceGap(pairGapMm);
                }}
              />
              <b>mm</b>
            </label>
            <button
              type="button"
              data-testid="pair-apply-surface-gap"
              disabled={!canSurfacePair}
              onClick={() => onSurfaceGap(pairGapMm)}
            >
              {lang === "zh" ? "应用" : "APPLY"}
            </button>
          </div>
          <button
            className="pair-connect-button"
            type="button"
            data-testid="pair-smart-connect"
            disabled={!canConnectPair}
            title={canConnectPair
              ? (lang === "zh" ? "保持先选组件不动，仅调整后选组件" : "KEEP THE FIRST COMPONENT FIXED AND ADJUST ONLY THE SECOND")
              : (lang === "zh" ? "请选择光轴与连接件，或两个连接件" : "SELECT A SHAFT AND CONNECTOR, OR TWO CONNECTORS")}
            onClick={onConnectPair}
          >
            <WandSparkles size={14} />{lang === "zh" ? "智能连接" : "SMART CONNECT"}
          </button>
          <button
            className="pair-swap-button"
            type="button"
            data-testid="pair-swap-anchor"
            title={lang === "zh" ? "交换固定组件和移动组件" : "SWAP FIXED AND MOVING PARTS"}
            onClick={onExchangePair}
          >
            {lang === "zh" ? "交换基准" : "SWAP"}
          </button>
        </div>
      )}
      <ThreeRackScene
        selectedId={selectedId}
        selectedIds={selectedIds}
        activeGroupPartIds={activeGroupPartIds}
        addedParts={addedParts}
        renderMode={renderMode}
        view={view}
        background={background}
        transformMode={transformMode}
        modifierDuplicate={modifierDuplicate}
        explodedViewActive={explodedViewActive}
        explosionFactor={explosionPercent / 100}
        dimensions={dimensions}
        overallBounds={overallBounds}
        transforms={transforms}
        materials={materials}
        panelCutouts={panelCutouts}
        resolvedRiskIds={resolvedRiskIds}
        deletedIds={deletedIds}
        hiddenIds={hiddenIds}
        lockedIds={lockedIds}
        isolatedIds={isolatedIds}
        assemblyConnections={assemblyConnections}
        focusRequest={focusRequest}
        selectionRect={completedSelectionRect}
        onSelect={onSelect}
        onSelectMany={onSelectMany}
        onClearSelection={onClearSelection}
        onOpenContextMenu={openContextMenu}
        onModifierDuplicate={onModifierDuplicate}
        onTransformChange={onTransformChange}
        onGroupTransformChange={onGroupTransformChange}
        onShaftLengthEditStart={onShaftLengthEditStart}
        onShaftLengthPreview={onShaftLengthPreview}
        onPanelEdgeEditStart={onPanelEdgeEditStart}
        onPanelEdgePreview={onPanelEdgePreview}
        onTransformPreview={setTransformPreview}
        onMirrorAxisChange={onMirrorAxisChange}
      />
      <div
        className="view-orientation-gizmo-frame"
        data-testid="view-orientation-gizmo"
        role="img"
        aria-label={lang === "zh" ? "三维视图方向球：红色 X 轴、绿色 Y 轴、蓝色 Z 轴" : "3D VIEW ORIENTATION: RED X, GREEN Y, BLUE Z"}
      >
        <span>{lang === "zh" ? "视图方向" : "VIEW AXES"}</span>
        <div aria-hidden="true"><i className="axis-x">X</i><i className="axis-y">Y</i><i className="axis-z">Z</i></div>
      </div>
      {explodedViewActive && (
        <div className="exploded-view-controls" role="group" aria-label={lang === "zh" ? "爆炸图间距" : "EXPLODED VIEW SPACING"}>
          <div><Ungroup size={15} /><span>{lang === "zh" ? "爆炸距离" : "EXPLOSION"}</span><strong>{explosionPercent}%</strong></div>
          <input aria-label={lang === "zh" ? "爆炸距离" : "EXPLOSION DISTANCE"} type="range" min="0" max="100" step="5" value={explosionPercent} onChange={(event) => setExplosionPercent(Number(event.target.value))} />
          <button type="button" onClick={restoreAssemblyView}><Group size={14} />{lang === "zh" ? "复原装配" : "RESTORE"}</button>
          <p>{lang === "zh" ? "展示模式不会修改零件坐标；已锁定编辑操作。" : "PRESENTATION ONLY. PART COORDINATES ARE UNCHANGED AND EDITING IS LOCKED."}</p>
        </div>
      )}
      {sceneIsEmpty && (
        <section className="designer-empty-state" aria-labelledby="designer-empty-title">
          <div className="designer-empty-icon"><Box size={28} strokeWidth={1.4} /></div>
          <span>{lang === "zh" ? "空白设计台" : "BLANK WORKSPACE"}</span>
          <h2 id="designer-empty-title">{lang === "zh" ? "从第一个组件开始搭建" : "START WITH YOUR FIRST COMPONENT"}</h2>
          <p>{lang === "zh" ? "从模板列表选择基础结构快速修改，或从组件库选择光轴、连接件和层板自由创建。" : "Choose a starting structure from the template list, or build freely with shafts, connectors, and panels."}</p>
          <div className="designer-empty-actions">
            <button className="primary-button" type="button" onClick={onOpenTemplatePicker}><Layers3 size={16} />{lang === "zh" ? "从模板创建" : "CREATE FROM TEMPLATE"}</button>
            <button type="button" onClick={() => onOpenPartPicker()}><Plus size={16} />{lang === "zh" ? "添加组件" : "ADD COMPONENT"}</button>
          </div>
        </section>
      )}
      {selectionMode === "box" && (
        <div
          className="box-selection-layer"
          aria-label={t.boxSelectHint}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const point = selectionPoint(event);
            if (!point) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setSelectionStart(point);
            setSelectionDragRect({ left: point.x, top: point.y, right: point.x, bottom: point.y });
          }}
          onPointerMove={(event) => {
            if (!selectionStart) return;
            const point = selectionPoint(event);
            if (point) setSelectionDragRect(selectionRectFromPoints(selectionStart, point));
          }}
          onPointerUp={(event) => {
            if (!selectionStart) return;
            const point = selectionPoint(event);
            const rect = point ? selectionRectFromPoints(selectionStart, point) : selectionDragRect;
            setSelectionStart(null);
            setSelectionDragRect(null);
            if (!rect || rect.right - rect.left < 4 || rect.bottom - rect.top < 4) {
              onClearSelection();
              return;
            }
            setCompletedSelectionRect({ ...rect });
          }}
        >
          {selectionDragRect && (
            <div
              className="selection-marquee"
              style={{
                left: selectionDragRect.left,
                top: selectionDragRect.top,
                width: selectionDragRect.right - selectionDragRect.left,
                height: selectionDragRect.bottom - selectionDragRect.top,
              }}
            />
          )}
          {!selectionStart && <div className="box-select-hint"><ScanSearch size={14} />{t.boxSelectHint}</div>}
        </div>
      )}
      <div className={`constraint-feedback ${transformPreview ? "active" : ""}`} aria-live="polite">
        <Target size={13} />
        {transformPreview ?? (assemblyConnections.length > 0
          ? `${lang === "zh" ? "智能连接" : "SMART CONNECTIONS"} ${assemblyConnections.length}`
          : t.snapActive)}
      </div>
      {canvasContextMenu && (
        <div
          className="part-context-menu canvas-context-menu"
          role="menu"
          aria-label={t.canvasActions}
          style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="context-menu-heading"><span>{t.canvasActions}</span><strong>3D</strong></div>
          <button type="button" role="menuitem" onClick={() => { onSelectAllVisible(); setCanvasContextMenu(null); }}>
            <ScanSearch size={14} />{t.selectAllVisible}<kbd>Ctrl/Cmd+A</kbd>
          </button>
          <button type="button" role="menuitem" disabled={selectedIds.length === 0} onClick={() => { onClearSelection(); setCanvasContextMenu(null); }}>
            <MousePointer2 size={14} />{t.clearSelection}
          </button>
          <button type="button" role="menuitem" disabled={!canPaste} onClick={() => { onPasteClipboard(); setCanvasContextMenu(null); }}>
            <ClipboardPaste size={14} />{t.pasteParts}<kbd>Ctrl/Cmd+V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => { setSelectionMode("box"); setCanvasContextMenu(null); }}>
            <ScanSearch size={14} />{t.boxSelect}
          </button>
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { onShowAllParts(); setCanvasContextMenu(null); }}>
            <Eye size={14} />{t.showAllParts}
          </button>
          <button type="button" role="menuitem" onClick={() => { setView("perspective"); setCanvasContextMenu(null); }}>
            <RotateCcw size={14} />{t.resetView}
          </button>
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { onAddPart("rod"); setCanvasContextMenu(null); }}>
            <Layers3 size={14} />{t.addRod}
          </button>
          <button type="button" role="menuitem" onClick={() => { onAddPart("panel"); setCanvasContextMenu(null); }}>
            <Grid3X3 size={14} />{t.addPanel}
          </button>
          <button type="button" role="menuitem" onClick={() => { onAddPart("joint"); setCanvasContextMenu(null); }}>
            <Target size={14} />{t.addJoint}
          </button>
          <div className="context-menu-separator" />
          <button type="button" role="menuitem" onClick={() => { onSaveProject(); setCanvasContextMenu(null); }}>
            <Save size={14} />{t.saveProject}
          </button>
        </div>
      )}
      {contextMenu && contextPart && (
        <div
          className="part-context-menu"
          role="menu"
          aria-label={t.contextActions}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="context-menu-heading">
            <span>{t.contextActions}</span>
            <strong>{contextPart.id}</strong>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpenPartPicker({ worldPoint: contextMenu.worldPoint, anchorId: contextMenu.id });
              setContextMenu(null);
            }}
          >
            <Plus size={14} />
            {t.addComponentHere}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onMirrorSelection();
              setContextMenu(null);
            }}
          >
            <FlipHorizontal2 size={14} />
            {t.mirrorDuplicate}
          </button>
          <div className="context-menu-separator" />
          <div className="context-menu-section" role="group" aria-label={t.quickRotate}>
            <div className="context-menu-section-title">{t.quickRotate}</div>
            {(["x", "y", "z"] as const).map((axis) => (
              <div className="context-menu-rotate-row" key={axis}>
                <span>{axis.toUpperCase()}</span>
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`${axis.toUpperCase()} ${t.rotateCounterClockwise90}`}
                  onClick={() => {
                    onRotateSelection(axis, "ccw");
                    setContextMenu(null);
                  }}
                >
                  <RotateCcw size={13} />
                  -90°
                </button>
                <button
                  type="button"
                  role="menuitem"
                  aria-label={`${axis.toUpperCase()} ${t.rotateClockwise90}`}
                  onClick={() => {
                    onRotateSelection(axis, "cw");
                    setContextMenu(null);
                  }}
                >
                  <RotateCw size={13} />
                  +90°
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onFlipSelection("horizontal");
              setContextMenu(null);
            }}
          >
            <FlipHorizontal2 size={14} />
            {t.flipHorizontal}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onFlipSelection("vertical");
              setContextMenu(null);
            }}
          >
            <FlipVertical2 size={14} />
            {t.flipVertical}
          </button>
          <div className="context-menu-separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopySelection();
              setContextMenu(null);
            }}
          >
            <Copy size={14} />
            {t.copyParts}
            <kbd>Ctrl/Cmd+C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canPaste}
            onClick={() => {
              onPasteClipboard();
              setContextMenu(null);
            }}
          >
            <ClipboardPaste size={14} />
            {t.pasteParts}
            <kbd>Ctrl/Cmd+V</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!contextPart.warning}
            onClick={() => {
              onQuickFix(contextPart.id);
              setContextMenu(null);
            }}
          >
            <WandSparkles size={14} />
            {t.autoFix}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onResetTransform(contextPart.id);
              setContextMenu(null);
            }}
          >
            <RotateCcw size={14} />
            {t.resetTransform}
          </button>
          <button
            className="danger"
            type="button"
            role="menuitem"
            onClick={() => {
              onDeletePart(contextPart.id);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            {t.deletePart}
          </button>
        </div>
      )}
    </main>
  );
}

function MaterialSelector({
  kind,
  material,
  onChange,
  lang,
  showLabel = true,
}: {
  kind: PartKind;
  material: PartMaterial;
  onChange: (material: PartMaterial) => void;
  lang: Lang;
  showLabel?: boolean;
}) {
  const t = copy[lang];
  const options: PartMaterial[] =
    kind === "panel"
      ? ["oak", "walnut", "acrylic"]
      : ["stainless", "matteBlack", "whiteMetal"];

  return (
    <div className="material-selector">
      {showLabel && <div className="section-label">{t.material}</div>}
      <div className="material-options">
        {options.map((option) => (
          <button
            className={material === option ? "active" : ""}
            type="button"
            key={option}
            aria-pressed={material === option}
            onClick={() => onChange(option)}
          >
            <span className={`material-swatch material-${option}`} aria-hidden="true" />
            <span>{t.materials[option]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

type InspectorSectionId = "structure" | "assembly" | "identity" | "material" | "drilling" | "transform" | "rotation" | "actions";

function InspectorSection({
  id,
  title,
  summary,
  open,
  tone = "neutral",
  onToggle,
  children,
}: {
  id: InspectorSectionId;
  title: string;
  summary?: string;
  open: boolean;
  tone?: "neutral" | "warning" | "danger" | "success";
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const contentId = `inspector-section-${id}`;
  return (
    <section className={`inspector-section inspector-section-${tone}`} data-inspector-section={id}>
      <button
        className="inspector-section-toggle"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={onToggle}
      >
        <span className="inspector-section-title">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <strong>{title}</strong>
        </span>
        {summary && <span className="inspector-section-summary">{summary}</span>}
      </button>
      <div id={contentId} className="inspector-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}

function StructuralStatusCard({
  analysis,
  issues = analysis.issues,
  lang,
  compact = false,
}: {
  analysis: StructuralAnalysis;
  issues?: StructuralIssue[];
  lang: Lang;
  compact?: boolean;
}) {
  const visibleIssues = issues.slice(0, compact ? 3 : 4);
  const isEmpty = analysis.totalMassKg === 0;
  const hasErrors = issues.some(({ severity }) => severity === "error");
  const hasWarnings = issues.some(({ severity }) => severity === "warning");
  const tone: StatusTone = isEmpty ? "neutral" : hasErrors ? "danger" : hasWarnings ? "warning" : "success";
  const status = isEmpty
    ? (lang === "zh" ? "等待零件" : "WAITING FOR PARTS")
    : hasErrors
    ? (lang === "zh" ? "需要修正" : "ACTION REQUIRED")
    : hasWarnings
      ? (lang === "zh" ? "建议优化" : "REVIEW")
      : (lang === "zh" ? "受力路径通过" : "LOAD PATH PASSED");
  return (
    <section
      className={`structural-status structural-status-${tone} ${compact ? "compact" : ""}`}
      aria-label={lang === "zh" ? "结构与重力校验" : "STRUCTURE AND GRAVITY CHECK"}
      aria-live="polite"
      data-testid="structural-status"
      data-structural-error-count={analysis.errorCount}
      data-structural-warning-count={analysis.warningCount}
    >
      <div className="structural-status-heading">
        <div className="structural-status-icon">
          {hasErrors || hasWarnings ? <TriangleAlert size={18} /> : <Gauge size={18} />}
        </div>
        <div>
          <span>{lang === "zh" ? "简化自重校验" : "SELF-WEIGHT CHECK"}</span>
          <strong>{lang === "zh" ? "结构与重力" : "STRUCTURE & GRAVITY"}</strong>
        </div>
        <Badge tone={tone}>{status}</Badge>
      </div>
      {!compact && analysis.centerOfMassMm && (
        <dl className="structural-metrics">
          <div><dt>{lang === "zh" ? "估算自重" : "MASS"}</dt><dd>{analysis.totalMassKg}<span>KG</span></dd></div>
          <div><dt>{lang === "zh" ? "重心高度" : "COM HEIGHT"}</dt><dd>{Math.round(analysis.centerOfMassMm[1])}<span>MM</span></dd></div>
          <div><dt>{lang === "zh" ? "落地节点" : "GROUNDED"}</dt><dd>{analysis.groundedPartIds.length}<span>{lang === "zh" ? "个" : "PCS"}</span></dd></div>
        </dl>
      )}
      {isEmpty ? (
        <p className="structural-empty-message">
          {lang === "zh" ? "添加光轴、连接件或层板后，将自动检查连接与自重。" : "ADD SHAFTS, CONNECTORS, OR PANELS TO START THE AUTOMATIC CHECK."}
        </p>
      ) : visibleIssues.length > 0 ? (
        <ul className="structural-issue-list">
          {visibleIssues.map((issue) => (
            <li key={issue.id} className={issue.severity}>
              <span aria-hidden="true" />
              <p>{lang === "zh" ? issue.messageZh : issue.messageEn}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="structural-pass-message">
          {lang === "zh" ? "已识别完整连接、落地支撑和稳定的重心投影。" : "CONNECTIONS, GROUND SUPPORTS, AND CENTER-OF-MASS PROJECTION PASS THE CURRENT RULES."}
        </p>
      )}
      {issues.length > visibleIssues.length && (
        <p className="structural-more">{lang === "zh" ? `另有 ${issues.length - visibleIssues.length} 项问题` : `${issues.length - visibleIssues.length} MORE ISSUES`}</p>
      )}
      {!compact && (
        <p className="structural-disclaimer">
          {lang === "zh" ? "用于搭建阶段的准静态自重检查，不替代承重认证或有限元分析。" : "QUASI-STATIC DESIGN AID; NOT A SUBSTITUTE FOR LOAD CERTIFICATION OR FEA."}
        </p>
      )}
    </section>
  );
}

const panelCutoutReferences: PanelCutoutReference[] = ["front-left", "front-right", "back-left", "back-right", "center"];

function PanelCutoutPlaneEditor({
  cutouts,
  dimensions,
  onMove,
  lang,
}: {
  cutouts: PanelCutout[];
  dimensions: { widthMm: number; lengthMm: number; thicknessMm: number };
  onMove: (id: string, point: { xMm: number; zMm: number }) => void;
  lang: Lang;
}) {
  const [dragPreview, setDragPreview] = useState<PanelCutout | null>(null);
  const normalizedCutouts = normalizePanelCutouts(cutouts, dimensions);
  const width = Math.max(1, dimensions.widthMm);
  const length = Math.max(1, dimensions.lengthMm);
  const gridMm = Math.max(width, length) <= 240 ? 10 : Math.max(width, length) <= 600 ? 25 : 50;
  const markerRadius = Math.max(3, Math.min(width, length) * 0.018);
  const pointerToPanelPoint = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const matrix = svg.getScreenCTM();
    if (matrix) {
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return { xMm: point.x, zMm: point.y };
    }
    const rect = svg.getBoundingClientRect();
    return { xMm: (clientX - rect.left) / rect.width * width, zMm: (clientY - rect.top) / rect.height * length };
  };
  const beginDrag = (event: React.PointerEvent<SVGGElement>, cutout: PanelCutout) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
    setDragPreview(cutout);
  };
  const moveDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragPreview) return;
    const point = pointerToPanelPoint(event.currentTarget, event.clientX, event.clientY);
    setDragPreview(normalizePanelCutout({ ...dragPreview, ...point }, dimensions));
  };
  const finishDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragPreview) return;
    onMove(dragPreview.id, { xMm: dragPreview.xMm, zMm: dragPreview.zMm });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragPreview(null);
  };
  const displayedCutouts = normalizedCutouts.map((cutout) => dragPreview?.id === cutout.id ? dragPreview : cutout);
  const referencePoints: Record<PanelCutoutReference, [number, number]> = {
    "front-left": [0, 0],
    "front-right": [width, 0],
    "back-left": [0, length],
    "back-right": [width, length],
    center: [width / 2, length / 2],
  };
  return (
    <div className="panel-cutout-plane-wrap">
      <svg
        className={`panel-cutout-plane ${dragPreview ? "dragging-hole" : ""}`}
        role="img"
        aria-label={lang === "zh" ? "层板打孔俯视加工图" : "PANEL DRILLING TOP VIEW"}
        viewBox={`0 0 ${width} ${length}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <defs>
          <pattern id="panel-drill-grid" width={gridMm} height={gridMm} patternUnits="userSpaceOnUse">
            <path d={`M ${gridMm} 0 L 0 0 0 ${gridMm}`} fill="none" vectorEffect="non-scaling-stroke" />
          </pattern>
        </defs>
        <rect className="panel-cutout-plane-surface" x="0" y="0" width={width} height={length} rx={Math.min(width, length) * 0.018} />
        <rect className="panel-cutout-plane-grid" x="0" y="0" width={width} height={length} rx={Math.min(width, length) * 0.018} fill="url(#panel-drill-grid)" />
        <line className="panel-cutout-center-line" x1={width / 2} x2={width / 2} y1="0" y2={length} />
        <line className="panel-cutout-center-line" x1="0" x2={width} y1={length / 2} y2={length / 2} />
        {panelCutoutReferences.map((reference) => {
          const [x, z] = referencePoints[reference];
          return <circle className={`panel-reference-marker ${reference}`} key={reference} cx={x} cy={z} r={markerRadius} />;
        })}
        {dragPreview && panelCutoutReferences.map((reference) => {
          const [x, z] = referencePoints[reference];
          return <line className="panel-cutout-reference-guide" key={reference} x1={dragPreview.xMm} y1={dragPreview.zMm} x2={x} y2={z} />;
        })}
        {displayedCutouts.map((cutout, index) => (
          <g
            className="panel-cutout-draggable"
            role="button"
            aria-label={lang === "zh" ? `拖拽孔 ${index + 1}` : `DRAG HOLE ${index + 1}`}
            tabIndex={0}
            key={cutout.id}
            transform={`translate(${cutout.xMm} ${cutout.zMm})`}
            onPointerDown={(event) => beginDrag(event, cutout)}
            onKeyDown={(event) => {
              if (!event.key.startsWith("Arrow")) return;
              event.preventDefault();
              const step = event.shiftKey ? 10 : 1;
              const next = normalizePanelCutout({
                ...cutout,
                xMm: cutout.xMm + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                zMm: cutout.zMm + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
              }, dimensions);
              onMove(cutout.id, { xMm: next.xMm, zMm: next.zMm });
            }}
          >
            <circle className="panel-cutout-hit-target" r={Math.max(cutout.diameterMm / 2, markerRadius * 2.2)} />
            <circle className="panel-cutout-hole-shape" r={cutout.diameterMm / 2} />
            <text y={-Math.max(cutout.diameterMm / 2, markerRadius) - markerRadius * 0.5} textAnchor="middle" style={{ fontSize: markerRadius * 1.25 }}>Ø{cutout.diameterMm}</text>
          </g>
        ))}
      </svg>
      <div className="panel-cutout-plane-legend"><span>GRID {gridMm} MM</span><span>{lang === "zh" ? "拖拽圆孔调整位置 · 方向键微调" : "DRAG HOLES · USE ARROW KEYS TO NUDGE"}</span></div>
    </div>
  );
}

function PanelDrillingEditor({
  cutouts,
  dimensions,
  onAdd,
  onUpdate,
  onRemove,
  lang,
}: {
  cutouts: PanelCutout[];
  dimensions: { widthMm: number; lengthMm: number; thicknessMm: number };
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<PanelCutout, "id">>) => void;
  onRemove: (id: string) => void;
  lang: Lang;
}) {
  const [referenceByHole, setReferenceByHole] = useState<Record<string, PanelCutoutReference>>({});
  const normalizedCutouts = normalizePanelCutouts(cutouts, dimensions);
  const referenceLabels: Record<PanelCutoutReference, string> = lang === "zh"
    ? { "front-left": "左前角", "front-right": "右前角", "back-left": "左后角", "back-right": "右后角", center: "中心" }
    : { "front-left": "FRONT LEFT", "front-right": "FRONT RIGHT", "back-left": "BACK LEFT", "back-right": "BACK RIGHT", center: "CENTER" };
  return (
    <div className="panel-drilling-editor" data-testid="panel-drilling-editor">
      <div className="panel-drilling-intro">
        <p>{lang === "zh" ? "在俯视加工图中拖拽孔位；也可选择四个角或中心作为参考点，输入精确偏移。所有距离单位均为毫米。" : "DRAG HOLES IN THE TOP VIEW, OR CHOOSE ANY CORNER OR THE CENTER AS A REFERENCE FOR PRECISE OFFSETS. ALL DISTANCES ARE IN MM."}</p>
        <button className="secondary-button panel-add-cutout" type="button" onClick={onAdd}>
          <Plus size={14} />{lang === "zh" ? "添加圆孔" : "ADD ROUND HOLE"}
        </button>
      </div>
      {normalizedCutouts.length === 0 ? (
        <div className="panel-drilling-empty">
          <Target size={19} />
          <span>{lang === "zh" ? "暂无孔位" : "NO HOLES"}</span>
        </div>
      ) : (
        <>
        <PanelCutoutPlaneEditor cutouts={normalizedCutouts} dimensions={dimensions} onMove={(id, point) => onUpdate(id, point)} lang={lang} />
        <div className="panel-cutout-list">
          {normalizedCutouts.map((cutout, index) => {
            const reference = referenceByHole[cutout.id] ?? "center";
            const offset = panelCutoutReferenceOffset(cutout, dimensions, reference);
            const distances = panelCutoutReferenceDistances(cutout, dimensions);
            const number = String(index + 1).padStart(2, "0");
            return (
              <article className="panel-cutout-card" key={cutout.id} data-panel-cutout-id={cutout.id}>
                <header>
                  <div><Target size={14} /><strong>{lang === "zh" ? `孔 ${number}` : `HOLE ${number}`}</strong></div>
                  <button type="button" aria-label={lang === "zh" ? `删除孔 ${number}` : `DELETE HOLE ${number}`} onClick={() => onRemove(cutout.id)}>
                    <Trash2 size={14} />
                  </button>
                </header>
                <div className="panel-cutout-reference-picker" role="group" aria-label={lang === "zh" ? `孔 ${number} 参考点` : `HOLE ${number} REFERENCE`}>
                  {panelCutoutReferences.map((option) => <button type="button" key={option} className={reference === option ? "active" : ""} aria-pressed={reference === option} onClick={() => setReferenceByHole((current) => ({ ...current, [cutout.id]: option }))}>{referenceLabels[option]}</button>)}
                </div>
                <div className="numeric-grid panel-cutout-fields">
                  <NumberField label={lang === "zh" ? "横向距离" : "HORIZONTAL"} unit="mm" step={1} value={offset.horizontalMm} onChange={(value) => { const next = movePanelCutoutFromReference(cutout, dimensions, reference, { ...offset, horizontalMm: Number(value) }); onUpdate(cutout.id, { xMm: next.xMm, zMm: next.zMm }); }} />
                  <NumberField label={lang === "zh" ? "纵向距离" : "VERTICAL"} unit="mm" step={1} value={offset.verticalMm} onChange={(value) => { const next = movePanelCutoutFromReference(cutout, dimensions, reference, { ...offset, verticalMm: Number(value) }); onUpdate(cutout.id, { xMm: next.xMm, zMm: next.zMm }); }} />
                  <NumberField label={lang === "zh" ? "孔径" : "DIAMETER"} unit="mm" step={1} value={cutout.diameterMm} onChange={(value) => onUpdate(cutout.id, { diameterMm: Number(value) })} />
                </div>
                <p className="panel-cutout-reference-hint">{reference === "center" ? (lang === "zh" ? "中心偏移可使用正负值。" : "CENTER OFFSETS MAY BE POSITIVE OR NEGATIVE.") : (lang === "zh" ? `当前以${referenceLabels[reference]}向层板内部测量。` : `MEASURED INWARD FROM ${referenceLabels[reference]}.`)}</p>
                <dl className="panel-cutout-reference-distances" aria-label={lang === "zh" ? `孔 ${number} 到参考点的距离` : `HOLE ${number} REFERENCE DISTANCES`}>
                  {panelCutoutReferences.map((option) => <div key={option} className={reference === option ? "active" : ""}><dt>{referenceLabels[option]}</dt><dd>{distances[option]} mm</dd></div>)}
                </dl>
              </article>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}

function OverallDimensionsPanel({
  dimensions,
  actualDimensions,
  onApply,
  lang,
}: {
  dimensions: FrameDimensions;
  actualDimensions: FrameDimensions;
  onApply: (dimensions: FrameDimensions) => void;
  lang: Lang;
}) {
  const [draft, setDraft] = useState(dimensions);
  useEffect(() => setDraft(dimensions), [dimensions]);
  const isZh = lang === "zh";
  const fields = [
    { axis: "width", label: isZh ? "宽度" : "WIDTH" },
    { axis: "depth", label: isZh ? "深度" : "DEPTH" },
    { axis: "height", label: isZh ? "高度" : "HEIGHT" },
  ] as const;

  return (
    <aside className="right-panel panel overall-dimensions-panel" aria-label={isZh ? "整体尺寸修改" : "RESIZE OVERALL DESIGN"}>
      <div className="panel-heading">
        <div><p className="eyebrow">{isZh ? "设计范围" : "DESIGN ENVELOPE"}</p><h2>{isZh ? "整体尺寸" : "OVERALL SIZE"}</h2></div>
        <div className="object-symbol"><Maximize2 size={21} /></div>
      </div>
      <div className="overall-resize-intro">
        <strong>{isZh ? "修改所有组件的整体外包络" : "EDIT THE COMPLETE COMPONENT ENVELOPE"}</strong>
        <p>{isZh
          ? "宽度、长度和高度均以全部可见组件合并后的边界计算。应用后杆件、层板、孔位和组件位置自适应，标准连接件本体与孔径保持不变。"
          : "WIDTH, DEPTH, AND HEIGHT USE THE MERGED BOUNDS OF ALL VISIBLE PARTS. RODS, PANELS, HOLES, AND POSITIONS ADAPT WHILE STANDARD CONNECTOR BODIES AND BORES STAY UNCHANGED."}</p>
      </div>
      <form className="overall-resize-form" onSubmit={(event) => { event.preventDefault(); onApply(draft); }}>
        <div className="overall-resize-fields">
          {fields.map(({ axis, label }) => (
            <label key={axis}>
              <span>{label}</span>
              <div><input
                type="number"
                min={OVERALL_DIMENSION_MIN_MM}
                max={OVERALL_DIMENSION_MAX_MM}
                step={1}
                value={draft[axis]}
                aria-label={label}
                data-overall-resize-axis={axis}
                onChange={(event) => setDraft((current) => ({ ...current, [axis]: Number(event.target.value) }))}
              /><em>MM</em></div>
            </label>
          ))}
        </div>
        <button className="primary-button full" type="submit"><Maximize2 size={15} />{isZh ? "应用并自适应" : "APPLY & ADAPT"}</button>
      </form>
      <section className="overall-target-comparison" aria-label={isZh ? "目标与实际尺寸差值" : "TARGET AND ACTUAL SIZE DELTA"}>
        <div>
          <span>{isZh ? "目标尺寸" : "TARGET"}</span>
          <strong>{draft.width.toFixed(1)} × {draft.depth.toFixed(1)} × {draft.height.toFixed(1)} MM</strong>
        </div>
        <div>
          <span>{isZh ? "与实际差值" : "DELTA TO ACTUAL"}</span>
          <strong>
            W {(draft.width - actualDimensions.width).toFixed(1)}
            {" · "}D {(draft.depth - actualDimensions.depth).toFixed(1)}
            {" · "}H {(draft.height - actualDimensions.height).toFixed(1)} MM
          </strong>
        </div>
      </section>
      <section className="overall-actual-envelope">
        <span>{isZh ? "当前实际外包络" : "CURRENT OUTER ENVELOPE"}</span>
        <strong>{actualDimensions.width} × {actualDimensions.depth} × {actualDimensions.height} MM</strong>
        <p>{isZh ? "实际外包络包含连接件、底座和突出结构，因此可能略大于框架基准尺寸。" : "THE OUTER ENVELOPE INCLUDES CONNECTORS, BASES, AND PROTRUDING PARTS, SO IT MAY BE SLIGHTLY LARGER."}</p>
      </section>
    </aside>
  );
}

function InspectorPanel({
  selected,
  selectedCount,
  overallDimensions,
  structuralAnalysis,
  structuralIssues,
  preciseRelations,
  mixedKinds,
  transform,
  shaftLength,
  parallelClampParameters,
  equalBoreCrossClampDiameter,
  equalBoreTClampDiameter,
  roundFixedBaseInnerDiameter,
  verticalFixedBaseShaftDiameter,
  shaftStopParameters,
  panelCutouts = [],
  canDrillPanel = false,
  material,
  onTransformChange,
  onShaftParametersChange,
  onParallelClampParametersChange,
  onEqualBoreCrossClampModelChange,
  onEqualBoreTClampModelChange,
  onRoundFixedBaseInnerDiameterChange,
  onVerticalFixedBaseModelChange,
  onShaftStopParametersChange,
  onAddPanelCutout,
  onUpdatePanelCutout,
  onRemovePanelCutout,
  onMaterialChange,
  onQuickFix,
  onQuickRotate,
  onLocateBom,
  onRemovePreciseRelation,
  onUpdatePreciseRelation,
  collapsed,
  onToggleCollapsed,
  lang,
}: {
  selected: PartInfo;
  selectedCount: number;
  overallDimensions: FrameDimensions;
  structuralAnalysis: StructuralAnalysis;
  structuralIssues: StructuralIssue[];
  preciseRelations: PreciseAssemblyRelation[];
  mixedKinds: boolean;
  transform: PartTransform;
  shaftLength?: number;
  parallelClampParameters?: ParallelClampParameters;
  equalBoreCrossClampDiameter?: number;
  equalBoreTClampDiameter?: number;
  roundFixedBaseInnerDiameter?: number;
  verticalFixedBaseShaftDiameter?: number;
  shaftStopParameters?: ShaftStopParameters;
  panelCutouts?: PanelCutout[];
  canDrillPanel?: boolean;
  material: PartMaterial;
  onTransformChange: (next: PartTransform) => void;
  onShaftParametersChange?: (diameter: number, length: number) => void;
  onParallelClampParametersChange?: (parameter: ParallelClampParameterKey, value: number) => void;
  onEqualBoreCrossClampModelChange?: (diameter: number) => void;
  onEqualBoreTClampModelChange?: (diameter: number) => void;
  onRoundFixedBaseInnerDiameterChange?: (innerDiameter: number) => void;
  onVerticalFixedBaseModelChange?: (model: string) => void;
  onShaftStopParametersChange?: (parameter: ShaftStopParameterKey, value: number) => void;
  onAddPanelCutout?: () => void;
  onUpdatePanelCutout?: (id: string, patch: Partial<Omit<PanelCutout, "id">>) => void;
  onRemovePanelCutout?: (id: string) => void;
  onMaterialChange: (material: PartMaterial) => void;
  onQuickFix: () => void;
  onQuickRotate: (axis: QuickRotateAxis, direction: QuickRotateDirection) => void;
  onLocateBom: () => void;
  onRemovePreciseRelation: (relationId: string) => void;
  onUpdatePreciseRelation: (
    relationId: string,
    patch: Partial<Pick<PreciseAssemblyRelation, "gapMm" | "axialReference" | "axialOffsetMm">>,
  ) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  lang: Lang;
}) {
  const t = copy[lang];
  const equalBoreCrossClampVariant = equalBoreCrossClampDiameter === undefined
    ? null
    : resolveEqualBoreCrossClampVariant(equalBoreCrossClampDiameter);
  const equalBoreTClampVariant = equalBoreTClampDiameter === undefined
    ? null
    : resolveEqualBoreTClampVariant(equalBoreTClampDiameter);
  const roundFixedBaseVariant = roundFixedBaseInnerDiameter === undefined
    ? null
    : resolveRoundFixedBaseVariant(roundFixedBaseInnerDiameter);
  const verticalFixedBaseVariant = verticalFixedBaseShaftDiameter === undefined
    ? null
    : resolveVerticalFixedBaseVariant(verticalFixedBaseShaftDiameter);
  const parallelClampVariant = parallelClampParameters
    ? resolveParallelClampVariant(parallelClampParameters)
    : null;
  const shaftStopVariant = shaftStopParameters
    ? resolveShaftStopVariant(shaftStopParameters)
    : null;
  const hasStructuralError = structuralIssues.some((issue) => issue.severity === "error");
  const hasStructuralWarning = structuralIssues.some((issue) => issue.severity === "warning");
  const [openSections, setOpenSections] = useState<Record<InspectorSectionId, boolean>>({
    structure: false,
    assembly: true,
    identity: true,
    material: false,
    drilling: true,
    transform: true,
    rotation: false,
    actions: false,
  });
  useEffect(() => {
    if (selectedCount === 0) return;
    setOpenSections((current) => ({
      ...current,
      structure: selected.warning || hasStructuralError || hasStructuralWarning,
    }));
  }, [hasStructuralError, hasStructuralWarning, selected.id, selected.warning, selectedCount]);
  const toggleSection = (id: InspectorSectionId) => {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  };
  if (collapsed) {
    return (
      <aside className="right-panel panel panel-collapsed">
        <button className="panel-expand-button" type="button" title={t.expandInspector} aria-label={t.expandInspector} onClick={onToggleCollapsed}>
          <ChevronLeft size={18} />
        </button>
        <span className="collapsed-panel-label">{t.inspector}</span>
      </aside>
    );
  }
  if (selectedCount === 0) {
    return (
      <aside className="right-panel panel empty-inspector">
        <div className="panel-heading">
          <div><p className="eyebrow">{t.object}</p><h2>{t.inspector}</h2></div>
          <button className="panel-collapse-button" type="button" title={t.collapseInspector} aria-label={t.collapseInspector} onClick={onToggleCollapsed}>
            <ChevronRight size={16} />
          </button>
        </div>
        <section className="inspector-overall-state" aria-label={lang === "zh" ? "整体尺寸" : "OVERALL DIMENSIONS"}>
          <div className="inspector-overall-heading">
            <div className="object-symbol"><Maximize2 size={21} /></div>
            <div><span>{lang === "zh" ? "当前设计" : "CURRENT DESIGN"}</span><strong>{lang === "zh" ? "整体尺寸" : "OVERALL DIMENSIONS"}</strong></div>
          </div>
          <dl className="inspector-overall-grid">
            <div><dt>{lang === "zh" ? "宽度" : "WIDTH"}</dt><dd>{overallDimensions.width}<span>MM</span></dd></div>
            <div><dt>{lang === "zh" ? "深度" : "DEPTH"}</dt><dd>{overallDimensions.depth}<span>MM</span></dd></div>
            <div><dt>{lang === "zh" ? "高度" : "HEIGHT"}</dt><dd>{overallDimensions.height}<span>MM</span></dd></div>
          </dl>
        </section>
        <StructuralStatusCard analysis={structuralAnalysis} lang={lang} />
      </aside>
    );
  }
  const updateValue = (key: keyof PartTransform, value: string) => {
    const parsed = Number(value);
    const finiteValue = Number.isFinite(parsed) ? parsed : 0;
    const constrainedValue = key.startsWith("rot")
      ? Math.round(finiteValue / 90) * 90
      : key.startsWith("scale")
        ? Math.sign(finiteValue || 1) * Math.max(0.1, Math.round(Math.abs(finiteValue) * 10) / 10)
      : key === "x" || key === "y" || key === "z"
        ? roundFreePositionMm(finiteValue)
        : Math.max(1, finiteValue);
    onTransformChange({
      ...transform,
      [key]: constrainedValue,
    });
  };
  const updateShaftParameter = (parameter: "diameter" | "length", value: string) => {
    const parsed = Number(value);
    const nextValue = Math.max(1, Number.isFinite(parsed) ? parsed : 1);
    onShaftParametersChange?.(
      parameter === "diameter" ? nextValue : transform.sizeY,
      parameter === "length" ? nextValue : shaftLength ?? transform.sizeX,
    );
  };
  const updateParallelClampParameter = (parameter: ParallelClampParameterKey, value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) onParallelClampParametersChange?.(parameter, parsed);
  };

  return (
    <aside className="right-panel panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t.object}</p>
          <h2>{t.inspector}</h2>
        </div>
        <div className="panel-heading-actions">
          <Badge tone={selected.warning ? "warning" : "success"}>
            {selectedCount > 1 ? `${selectedCount} ${lang === "zh" ? "个零件" : "PARTS"}` : selected.status}
          </Badge>
          <button className="panel-collapse-button" type="button" title={t.collapseInspector} aria-label={t.collapseInspector} onClick={onToggleCollapsed}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="selected-object">
        <div className="object-symbol">
          <Wrench size={23} />
        </div>
        <div>
          <span>{selectedCount > 1 ? `${selected.id} +${selectedCount - 1}` : selected.id}</span>
          <strong>{selectedCount > 1 ? (lang === "zh" ? "多选" : "MULTIPLE SELECTION") : selected.title}</strong>
        </div>
      </div>

      <div className="inspector-sections">
        <InspectorSection
          id="structure"
          title={lang === "zh" ? "结构与重力" : "STRUCTURE & GRAVITY"}
          summary={hasStructuralError
            ? (lang === "zh" ? `${structuralIssues.length} 项需修正` : `${structuralIssues.length} ISSUES`)
            : hasStructuralWarning || selected.warning
              ? (lang === "zh" ? `${Math.max(1, structuralIssues.length)} 项建议` : `${Math.max(1, structuralIssues.length)} REVIEWS`)
              : (lang === "zh" ? "通过" : "PASSED")}
          tone={hasStructuralError ? "danger" : hasStructuralWarning || selected.warning ? "warning" : "success"}
          open={openSections.structure}
          onToggle={() => toggleSection("structure")}
        >
          <StructuralStatusCard analysis={structuralAnalysis} issues={structuralIssues} lang={lang} compact />
        </InspectorSection>

        <InspectorSection
          id="assembly"
          title={lang === "zh" ? "装配关系" : "ASSEMBLY RELATIONS"}
          summary={lang === "zh" ? `${preciseRelations.length} 条关系` : `${preciseRelations.length} RELATION${preciseRelations.length === 1 ? "" : "S"}`}
          tone={preciseRelations.some(({ status }) => status === "invalid")
            ? "danger"
            : preciseRelations.some(({ status }) => status === "warning")
              ? "warning"
              : preciseRelations.length > 0 ? "success" : "neutral"}
          open={openSections.assembly}
          onToggle={() => toggleSection("assembly")}
        >
          {preciseRelations.length === 0 ? (
            <p className="assembly-relation-empty">{lang === "zh"
              ? "双选组件后，可建立表面贴合、毫米间距或孔轴同心关系。"
              : "SELECT TWO PARTS TO CREATE CONTACT, GAP, OR SHAFT-BORE RELATIONS."}</p>
          ) : (
            <div className="assembly-relation-list">
              {preciseRelations.map((relation) => (
                <article key={relation.id} data-relation-status={relation.status}>
                  <div>
                    <strong>{relation.type === "surface-contact"
                      ? (lang === "zh" ? "表面贴合" : "SURFACE CONTACT")
                      : relation.type === "surface-gap"
                        ? (lang === "zh" ? `表面间距 ${relation.gapMm?.toFixed(1) ?? "0.0"} mm` : `SURFACE GAP ${relation.gapMm?.toFixed(1) ?? "0.0"} MM`)
                        : (lang === "zh" ? "孔轴同心" : "SHAFT / BORE")}</strong>
                    <span>{relation.fixedPartId} → {relation.movingPartId}</span>
                    <small>{relation.fixedFeatureId} ↔ {relation.movingFeatureId} · {relation.residualMm.toFixed(1)} mm</small>
                    {relation.message && <em>{relation.message}</em>}
                    {relation.type === "shaft-bore" ? (
                      <div className="assembly-relation-editor">
                        <select
                          aria-label={lang === "zh" ? "轴向位置模式" : "AXIAL POSITION MODE"}
                          value={relation.axialReference ?? "preserve"}
                          onChange={(event) => onUpdatePreciseRelation(relation.id, {
                            axialReference: event.target.value as PreciseAssemblyRelation["axialReference"],
                          })}
                        >
                          <option value="preserve">{lang === "zh" ? "保持当前位置" : "PRESERVE"}</option>
                          <option value="shaft-center">{lang === "zh" ? "孔对齐轴中心" : "SHAFT CENTER"}</option>
                          <option value="shaft-start">{lang === "zh" ? "距轴起点" : "FROM START"}</option>
                          <option value="shaft-end">{lang === "zh" ? "距轴终点" : "FROM END"}</option>
                        </select>
                        {(relation.axialReference === "shaft-start" || relation.axialReference === "shaft-end") && (
                          <label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={relation.axialOffsetMm ?? 0}
                              aria-label={lang === "zh" ? "轴向偏移毫米" : "AXIAL OFFSET MILLIMETERS"}
                              onChange={(event) => onUpdatePreciseRelation(relation.id, {
                                axialOffsetMm: Math.max(0, Number(event.target.value) || 0),
                              })}
                            />
                            <span>mm</span>
                          </label>
                        )}
                      </div>
                    ) : (
                      <label className="assembly-relation-gap-editor">
                        <span>{lang === "zh" ? "净距" : "GAP"}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={relation.gapMm ?? 0}
                          aria-label={lang === "zh" ? "装配关系表面间距毫米" : "RELATION SURFACE GAP MILLIMETERS"}
                          onChange={(event) => onUpdatePreciseRelation(relation.id, {
                            gapMm: Math.max(0, Number(event.target.value) || 0),
                          })}
                        />
                        <b>mm</b>
                      </label>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${lang === "zh" ? "解除装配关系" : "REMOVE ASSEMBLY RELATION"} ${relation.id}`}
                    onClick={() => onRemovePreciseRelation(relation.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </article>
              ))}
            </div>
          )}
        </InspectorSection>

        <InspectorSection
          id="identity"
          title={lang === "zh" ? "基础信息" : "BASIC INFORMATION"}
          summary={selected.componentId}
          open={openSections.identity}
          onToggle={() => toggleSection("identity")}
        >
          <div className="field-list">
            <Field label={t.fields.componentId} value={selected.componentId} />
            <Field label={t.fields.sku} value={selected.sku} />
            <Field label={t.fields.orientation} value={selected.orientation} />
            <Field label={t.fields.compatibleRod} value={selected.compatibleRod} />
            <Field label={t.fields.centerOffset} value={selected.centerOffset} warning={selected.warning} />
            <Field label={t.fields.linkedRods} value={selected.linkedRods} />
            <Field label={t.fields.fastener} value={selected.fastener} />
          </div>
          <div className={`rule-check ${selected.warning ? "" : "resolved"}`}>
            <div className="section-label">{t.ruleCheck}</div>
            <p>{selected.rule}</p>
            {selected.warning && (
              <button className="quick-fix-button" type="button" onClick={onQuickFix}>
                <WandSparkles size={15} />
                {t.autoFix}
              </button>
            )}
          </div>
        </InspectorSection>

        {!mixedKinds && (
          <InspectorSection
            id="material"
            title={t.material}
            summary={t.materials[material]}
            open={openSections.material}
            onToggle={() => toggleSection("material")}
          >
            <MaterialSelector
              kind={selected.kind}
              material={material}
              onChange={onMaterialChange}
              lang={lang}
              showLabel={false}
            />
          </InspectorSection>
        )}

        {canDrillPanel && selected.kind === "panel" && !mixedKinds && (
          <InspectorSection
            id="drilling"
            title={lang === "zh" ? "层板打孔" : "PANEL DRILLING"}
            summary={lang === "zh" ? `${panelCutouts.length} 个圆孔` : `${panelCutouts.length} ROUND HOLE${panelCutouts.length === 1 ? "" : "S"}`}
            open={openSections.drilling}
            onToggle={() => toggleSection("drilling")}
          >
            <PanelDrillingEditor
              cutouts={panelCutouts}
              dimensions={{ widthMm: transform.sizeX, lengthMm: transform.sizeZ, thicknessMm: transform.sizeY }}
              onAdd={() => onAddPanelCutout?.()}
              onUpdate={(id, patch) => onUpdatePanelCutout?.(id, patch)}
              onRemove={(id) => onRemovePanelCutout?.(id)}
              lang={lang}
            />
          </InspectorSection>
        )}

        <InspectorSection
          id="transform"
          title={lang === "zh" ? "位置与尺寸" : "POSITION & SIZE"}
          summary={`${Math.round(transform.x)}, ${Math.round(transform.y)}, ${Math.round(transform.z)} MM`}
          open={openSections.transform}
          onToggle={() => toggleSection("transform")}
        >
          <div className="numeric-editor">
        <div className="numeric-group">
          <span>{t.position}</span>
          <div className="numeric-grid">
            <NumberField label={t.x} unit="mm" step={0.1} value={transform.x} onChange={(value) => updateValue("x", value)} />
            <NumberField label={t.y} unit="mm" step={0.1} value={transform.y} onChange={(value) => updateValue("y", value)} />
            <NumberField label={t.z} unit="mm" step={0.1} value={transform.z} onChange={(value) => updateValue("z", value)} />
          </div>
        </div>
        {selected.kind === "rod" && !mixedKinds ? <div className="numeric-group shaft-parameter-group">
          <span>{t.shaftParameters}</span>
          <div className="numeric-grid shaft-parameter-grid">
            <label className="number-field shaft-diameter-select">
              <span>{t.diameter}</span>
              <select aria-label={t.diameter} value={transform.sizeY} onChange={(event) => updateShaftParameter("diameter", event.target.value)}>
                {!shaftDiameterOptions.includes(transform.sizeY as typeof shaftDiameterOptions[number]) && <option value={transform.sizeY} disabled>{lang === "zh" ? `当前 Ø${transform.sizeY} mm（非标准）` : `CURRENT Ø${transform.sizeY} MM (NON-STANDARD)`}</option>}
                {shaftDiameterOptions.map((diameter) => <option key={diameter} value={diameter}>Ø{diameter} mm</option>)}
              </select>
            </label>
            <NumberField label={t.length} unit="mm" step={10} value={shaftLength ?? transform.sizeX} onChange={(value) => updateShaftParameter("length", value)} />
          </div>
        </div> : selected.kind === "panel" && !mixedKinds ? <div className="numeric-group panel-dimension-group">
          <span>{t.size}</span>
          <div className="numeric-grid">
            <NumberField label={t.panelLength} unit="mm" value={transform.sizeX} onChange={(value) => updateValue("sizeX", value)} />
            <NumberField label={t.panelWidth} unit="mm" value={transform.sizeZ} onChange={(value) => updateValue("sizeZ", value)} />
            <NumberField label={t.thickness} unit="mm" value={transform.sizeY} onChange={(value) => updateValue("sizeY", value)} />
          </div>
        </div> : shaftStopVariant && !mixedKinds ? <div className="numeric-group shaft-stop-instance-parameters">
          <span>{lang === "zh" ? "限位器规格" : "SHAFT STOP SPECS"}</span>
          <label className="number-field equal-bore-instance-model"><span>{lang === "zh" ? "内径" : "INNER DIAMETER"}</span><select aria-label={lang === "zh" ? "限位器实例内径" : "SHAFT STOP INSTANCE INNER DIAMETER"} value={shaftStopVariant.innerDiameter} onChange={(event) => onShaftStopParametersChange?.("innerDiameter", Number(event.target.value))}>{shaftStopInnerDiameterOptions().map((diameter) => <option value={diameter} key={diameter}>Ø{diameter} mm</option>)}</select></label>
          <label className="number-field equal-bore-instance-model"><span>{lang === "zh" ? "厚度" : "THICKNESS"}</span><select aria-label={lang === "zh" ? "限位器实例厚度" : "SHAFT STOP INSTANCE THICKNESS"} value={shaftStopVariant.thickness} onChange={(event) => onShaftStopParametersChange?.("thickness", Number(event.target.value))}>{shaftStopThicknessOptions(shaftStopVariant.innerDiameter).map((thickness) => <option value={thickness} key={thickness}>{thickness} mm</option>)}</select></label>
          <dl className="equal-bore-derived-specs compact"><div><dt>D1 · {lang === "zh" ? "外径" : "OUTER DIA."}</dt><dd>Ø{shaftStopVariant.outerDiameter} mm</dd></div><div><dt>M · {lang === "zh" ? "粗螺纹" : "THREAD"}</dt><dd>{shaftStopVariant.thread}</dd></div><div><dt>d · {lang === "zh" ? "通孔" : "THROUGH HOLE"}</dt><dd>Ø{shaftStopVariant.throughHoleDiameter} mm</dd></div><div><dt>H · {lang === "zh" ? "沉孔" : "COUNTERBORE"}</dt><dd>Ø{shaftStopVariant.counterboreDiameter} mm</dd></div><div><dt>X / Y</dt><dd>{shaftStopVariant.screwCenterOffset} / {shaftStopVariant.counterboreDepth} mm</dd></div><div><dt>W · {lang === "zh" ? "开口宽" : "SLIT WIDTH"}</dt><dd>{shaftStopVariant.slitWidth} mm</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "选择库存规格后，外径、螺纹、孔位、3D几何、端口、外包络和清单同步更新。" : "THE STOCK ROW UPDATES THE OUTER DIAMETER, THREAD, HOLES, GEOMETRY, PORTS, ENVELOPE, AND BOM."}</p>
        </div> : verticalFixedBaseVariant && !mixedKinds ? <div className="numeric-group vertical-fixed-base-instance-parameters">
          <span>{lang === "zh" ? "立式固定座规格" : "VERTICAL FIXED BASE SPECS"}</span>
          <label className="number-field equal-bore-instance-model">
            <span>{lang === "zh" ? "型号" : "MODEL"}</span>
            <select aria-label={lang === "zh" ? "立式固定座实例型号" : "VERTICAL FIXED BASE INSTANCE MODEL"} value={verticalFixedBaseVariant.model} onChange={(event) => onVerticalFixedBaseModelChange?.(event.target.value)}>
              {verticalFixedBaseVariants.map(({ model, shaftDiameter }) => <option value={model} key={model}>{model} · Ø{shaftDiameter} mm</option>)}
            </select>
          </label>
          <dl className="equal-bore-derived-specs compact"><div><dt>{lang === "zh" ? "轴径" : "SHAFT DIA."}</dt><dd>Ø{verticalFixedBaseVariant.shaftDiameter} mm</dd></div><div><dt>H · {lang === "zh" ? "轴心高" : "CENTER H"}</dt><dd>{verticalFixedBaseVariant.h} mm</dd></div><div><dt>E · {lang === "zh" ? "上座宽" : "TOP W"}</dt><dd>{verticalFixedBaseVariant.e} mm</dd></div><div><dt>W × L × F</dt><dd>{verticalFixedBaseVariant.w} × {verticalFixedBaseVariant.l} × {verticalFixedBaseVariant.f} mm</dd></div><div><dt>G / P</dt><dd>{verticalFixedBaseVariant.g} / {verticalFixedBaseVariant.p} mm</dd></div><div><dt>B · {lang === "zh" ? "安装孔距" : "MOUNT PITCH"}</dt><dd>{verticalFixedBaseVariant.b} mm</dd></div><div><dt>S · {lang === "zh" ? "安装孔径" : "MOUNT HOLE"}</dt><dd>Ø{verticalFixedBaseVariant.s} mm</dd></div><div><dt>{lang === "zh" ? "螺栓" : "BOLTS"}</dt><dd>{verticalFixedBaseVariant.lockingBolt} / {verticalFixedBaseVariant.mountingBolt}</dd></div><div><dt>{lang === "zh" ? "重量" : "WEIGHT"}</dt><dd>{verticalFixedBaseVariant.weightKg.toFixed(3)} kg</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "选择型号后，全部表格尺寸、3D几何、端口、外包络和清单同步更新。" : "MODEL CHANGES UPDATE ALL TABLE DIMENSIONS, GEOMETRY, PORTS, ENVELOPE, AND BOM."}</p>
        </div> : roundFixedBaseVariant && !mixedKinds ? <div className="numeric-group round-fixed-base-instance-parameters">
          <span>{lang === "zh" ? "圆形固定底座规格" : "ROUND FIXED BASE SPECS"}</span>
          <label className="number-field equal-bore-instance-model">
            <span>{lang === "zh" ? "内径" : "INNER DIAMETER"}</span>
            <select aria-label={lang === "zh" ? "圆形固定底座实例内径" : "ROUND FIXED BASE INSTANCE INNER DIAMETER"} value={roundFixedBaseVariant.innerDiameter} onChange={(event) => onRoundFixedBaseInnerDiameterChange?.(Number(event.target.value))}>
              {roundFixedBaseVariants.map(({ innerDiameter }) => <option value={innerDiameter} key={innerDiameter}>Ø{innerDiameter} mm</option>)}
            </select>
          </label>
          <dl className="equal-bore-derived-specs compact"><div><dt>{lang === "zh" ? "法兰外径" : "FLANGE OD"}</dt><dd>Ø{roundFixedBaseVariant.flangeDiameter} mm</dd></div><div><dt>{lang === "zh" ? "凸台直径" : "BOSS OD"}</dt><dd>Ø{roundFixedBaseVariant.bossDiameter} mm</dd></div><div><dt>{lang === "zh" ? "总高" : "TOTAL H"}</dt><dd>{roundFixedBaseVariant.hubProjection + roundFixedBaseVariant.flangeThickness} mm</dd></div><div><dt>{lang === "zh" ? "安装孔距" : "MOUNT PCD"}</dt><dd>{roundFixedBaseVariant.mountingHolePcd} mm</dd></div><div><dt>{lang === "zh" ? "安装孔径" : "MOUNT HOLE"}</dt><dd>Ø{roundFixedBaseVariant.mountingHoleDiameter} mm</dd></div><div><dt>{lang === "zh" ? "紧定螺钉" : "SET SCREW"}</dt><dd>{roundFixedBaseVariant.setScrew}</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "只调整内径；外形、孔位、智能端口和清单按库存规格同步更新。" : "ONLY INNER DIAMETER IS SELECTABLE; ENVELOPE, HOLES, PORTS, AND BOM STAY SYNCHRONIZED."}</p>
        </div> : equalBoreTClampVariant && !mixedKinds ? <div className="numeric-group equal-bore-t-clamp-instance-parameters">
          <span>{lang === "zh" ? "同径 T 型夹规格" : "EQUAL-BORE T-CLAMP SPECS"}</span>
          <label className="number-field equal-bore-instance-model"><span>{lang === "zh" ? "型号" : "MODEL"}</span><select aria-label={lang === "zh" ? "同径T型夹实例型号" : "EQUAL-BORE T-CLAMP INSTANCE MODEL"} value={equalBoreTClampVariant.diameter} onChange={(event) => onEqualBoreTClampModelChange?.(Number(event.target.value))}>{equalBoreTClampVariants.map(({ diameter }) => <option value={diameter} key={diameter}>{diameter}×{diameter}</option>)}</select></label>
          <dl className="equal-bore-derived-specs compact"><div><dt>A · {lang === "zh" ? "长" : "LENGTH"}</dt><dd>{equalBoreTClampVariant.a} mm</dd></div><div><dt>B · {lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{equalBoreTClampVariant.b} mm</dd></div><div><dt>C · {lang === "zh" ? "宽" : "DEPTH"}</dt><dd>{equalBoreTClampVariant.c} mm</dd></div><div><dt>E · {lang === "zh" ? "左孔中心" : "LEFT CENTER"}</dt><dd>{equalBoreTClampVariant.e} mm</dd></div><div><dt>F · {lang === "zh" ? "右孔中心" : "RIGHT CENTER"}</dt><dd>{equalBoreTClampVariant.f} mm</dd></div><div><dt>{lang === "zh" ? "锁紧螺栓" : "LOCKING BOLT"}</dt><dd>{equalBoreTClampVariant.lockingBolt}</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "选择型号后，外形、正交孔位、锁紧孔、智能端口和清单同步更新。" : "MODEL CHANGES UPDATE ENVELOPE, PERPENDICULAR BORES, LOCKING HOLES, SMART PORTS, AND BOM."}</p>
        </div> : equalBoreCrossClampVariant && !mixedKinds ? <div className="numeric-group equal-bore-cross-clamp-instance-parameters">
          <span>{lang === "zh" ? "同径双孔十字夹规格" : "EQUAL-BORE CROSS-CLAMP SPECS"}</span>
          <label className="number-field equal-bore-instance-model">
            <span>{lang === "zh" ? "型号" : "MODEL"}</span>
            <select aria-label={lang === "zh" ? "同径双孔十字夹实例型号" : "EQUAL-BORE CROSS-CLAMP INSTANCE MODEL"} value={equalBoreCrossClampVariant.diameter} onChange={(event) => onEqualBoreCrossClampModelChange?.(Number(event.target.value))}>
              {equalBoreCrossClampVariants.map(({ diameter }) => <option value={diameter} key={diameter}>{diameter}×{diameter}</option>)}
            </select>
          </label>
          <dl className="equal-bore-derived-specs compact"><div><dt>A · {lang === "zh" ? "长" : "LENGTH"}</dt><dd>{equalBoreCrossClampVariant.length} mm</dd></div><div><dt>B · {lang === "zh" ? "宽" : "WIDTH"}</dt><dd>{equalBoreCrossClampVariant.width} mm</dd></div><div><dt>C · {lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{equalBoreCrossClampVariant.height} mm</dd></div><div><dt>D · {lang === "zh" ? "孔距" : "PITCH"}</dt><dd>{equalBoreCrossClampVariant.holeCenterDistance} mm</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "选择型号后，外形、孔径、孔距、智能端口和清单同步更新。" : "MODEL CHANGES UPDATE ENVELOPE, BORES, PITCH, SMART PORTS, AND BOM."}</p>
        </div> : parallelClampVariant && !mixedKinds ? <div className="numeric-group parallel-clamp-instance-parameters">
          <span>{lang === "zh" ? "平行夹参数" : "PARALLEL CLAMP PARAMETERS"}</span>
          <label className="number-field equal-bore-instance-model"><span>{lang === "zh" ? "同径孔径" : "EQUAL BORE DIA."}</span><select aria-label={lang === "zh" ? "平行夹实例孔径" : "PARALLEL CLAMP INSTANCE BORE DIAMETER"} value={parallelClampVariant.boreDiameter} onChange={(event) => updateParallelClampParameter("hole1Diameter", event.target.value)}>{parallelClampDiameterOptions().map((diameter) => <option value={diameter} key={diameter}>Ø{diameter} × Ø{diameter} mm</option>)}</select></label>
          <label className="number-field equal-bore-instance-model"><span>{lang === "zh" ? "中心距" : "CENTER DISTANCE"}</span><select aria-label={lang === "zh" ? "平行夹实例中心距" : "PARALLEL CLAMP INSTANCE CENTER DISTANCE"} value={parallelClampVariant.holeCenterDistance} onChange={(event) => updateParallelClampParameter("holeCenterDistance", event.target.value)}>{parallelClampCenterDistanceOptions(parallelClampVariant.boreDiameter).map((distance) => <option value={distance} key={distance}>{distance} mm</option>)}</select></label>
          <dl className="equal-bore-derived-specs compact"><div><dt>{lang === "zh" ? "长" : "LENGTH"}</dt><dd>{parallelClampVariant.length} mm</dd></div><div><dt>{lang === "zh" ? "宽" : "WIDTH"}</dt><dd>{parallelClampVariant.width} mm</dd></div><div><dt>{lang === "zh" ? "高" : "HEIGHT"}</dt><dd>{parallelClampVariant.height} mm</dd></div><div><dt>{lang === "zh" ? "适用螺丝" : "FASTENER"}</dt><dd>{parallelClampVariant.screw}</dd></div></dl>
          <p className="instance-parameter-note">{lang === "zh" ? "只选择有效库存组合；孔位、端口、外形、型号与清单同步更新。" : "ONLY VALID STOCK COMBINATIONS ARE AVAILABLE; PORTS, ENVELOPE, MODEL ID, AND BOM UPDATE TOGETHER."}</p>
        </div> : <div className="numeric-group">
          <span>{t.size}</span>
          <div className="numeric-grid">
            <NumberField label={t.width} unit="mm" value={transform.sizeX} onChange={(value) => updateValue("sizeX", value)} />
            <NumberField label={t.length} unit="mm" value={transform.sizeY} onChange={(value) => updateValue("sizeY", value)} />
            <NumberField label={t.height} unit="mm" value={transform.sizeZ} onChange={(value) => updateValue("sizeZ", value)} />
          </div>
        </div>}
        <div className="numeric-group">
          <span>{t.scale}</span>
          <div className="numeric-grid">
            <NumberField label={t.x} unit="×" value={transform.scaleX} onChange={(value) => updateValue("scaleX", value)} />
            <NumberField label={t.y} unit="×" value={transform.scaleY} onChange={(value) => updateValue("scaleY", value)} />
            <NumberField label={t.z} unit="×" value={transform.scaleZ} onChange={(value) => updateValue("scaleZ", value)} />
          </div>
        </div>
          </div>
        </InspectorSection>

        <InspectorSection
          id="rotation"
          title={t.rotation}
          summary={`${Math.round(transform.rotX)}° / ${Math.round(transform.rotY)}° / ${Math.round(transform.rotZ)}°`}
          open={openSections.rotation}
          onToggle={() => toggleSection("rotation")}
        >
          <div className="numeric-editor rotation-editor">
            <div className="numeric-group">
              <span>{t.rotation}</span>
              <div className="numeric-grid">
                <NumberField label={t.x} unit="°" value={transform.rotX} onChange={(value) => updateValue("rotX", value)} />
                <NumberField label={t.y} unit="°" value={transform.rotY} onChange={(value) => updateValue("rotY", value)} />
                <NumberField label={t.z} unit="°" value={transform.rotZ} onChange={(value) => updateValue("rotZ", value)} />
              </div>
            </div>
            <div className="quick-rotate-actions" role="group" aria-label={t.quickRotate}>
              <div className="quick-rotate-title">{t.quickRotate}</div>
              {(["x", "y", "z"] as const).map((axis) => (
                <div className="quick-rotate-row" key={axis}>
                  <span>{axis.toUpperCase()}</span>
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`${axis.toUpperCase()} ${t.rotateCounterClockwise90}`}
                    onClick={() => onQuickRotate(axis, "ccw")}
                  >
                    <RotateCcw size={14} />
                    -90°
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    aria-label={`${axis.toUpperCase()} ${t.rotateClockwise90}`}
                    onClick={() => onQuickRotate(axis, "cw")}
                  >
                    <RotateCw size={14} />
                    +90°
                  </button>
                </div>
              ))}
            </div>
          </div>
        </InspectorSection>

        <InspectorSection
          id="actions"
          title={lang === "zh" ? "组件操作" : "PART ACTIONS"}
          summary={lang === "zh" ? "替换 / 定位清单" : "REPLACE / LOCATE"}
          open={openSections.actions}
          onToggle={() => toggleSection("actions")}
        >
          <div className="inspector-actions">
            <button className="secondary-button" type="button">
              <Settings2 size={15} />
              {t.replace}
            </button>
            <button className="primary-button full" type="button" onClick={onLocateBom}>
              <Gauge size={15} />
              {t.locateBom}
            </button>
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string;
  unit: "mm" | "°" | "×";
  value: number;
  step?: number;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const committedDraft = useRef(String(value));
  const latestValue = useRef(value);
  latestValue.current = value;

  useEffect(() => {
    const next = String(value);
    setDraft(next);
    committedDraft.current = next;
  }, [value]);

  const commit = () => {
    if (draft === committedDraft.current) return;
    committedDraft.current = draft;
    onChange(draft);
    window.requestAnimationFrame(() => {
      const acceptedValue = String(latestValue.current);
      setDraft(acceptedValue);
      committedDraft.current = acceptedValue;
    });
  };

  return (
    <label className="number-field" data-unit={unit}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        step={step ?? (unit === "×" ? 0.1 : 5)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") setDraft(String(value));
        }}
      />
    </label>
  );
}

function Field({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className={`field ${warning ? "field-warning" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectsPage({
  lang,
  projects,
  onOpen,
  onDelete,
  onCreate,
  onExportBackup,
  onImportBackup,
  onBack,
}: {
  lang: Lang;
  projects: SavedProject[];
  onOpen: (project: SavedProject) => void;
  onDelete: (projectId: string) => void;
  onCreate: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onBack: () => void;
}) {
  const isZh = lang === "zh";
  return (
    <div className="projects-workspace">
      <header className="projects-header">
        <div>
          <span>AXISFRAME STUDIO</span>
          <h1>{isZh ? "本地项目" : "LOCAL PROJECTS"}</h1>
          <p>{isZh ? "项目以 JSON 快照保存在当前浏览器，可随时恢复继续编辑。" : "Projects are stored as JSON snapshots in this browser and can be reopened at any time."}</p>
        </div>
        <div>
          <button className="icon-button" type="button" onClick={onBack}><ChevronLeft size={16} />{isZh ? "返回设计器" : "BACK TO DESIGN"}</button>
          <button className="icon-button" type="button" onClick={onExportBackup}><Download size={16} />{isZh ? "备份 JSON" : "BACKUP JSON"}</button>
          <label className="icon-button projects-import-button"><FolderOpen size={16} />{isZh ? "恢复备份" : "RESTORE"}<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportBackup(file); event.target.value = ""; }} /></label>
          <button className="primary-button" type="button" onClick={onCreate}><Plus size={16} />{isZh ? "新建项目" : "NEW PROJECT"}</button>
        </div>
      </header>
      <main className="projects-main">
        <div className="projects-summary"><FolderKanban size={18} /><strong>{projects.length}</strong><span>{isZh ? "个历史项目" : "SAVED PROJECTS"}</span></div>
        {projects.length === 0 ? (
          <section className="projects-empty"><FolderOpen size={32} /><h2>{isZh ? "还没有保存的项目" : "NO SAVED PROJECTS"}</h2><p>{isZh ? "回到设计器完成第一个设计，然后点击保存并为项目命名。" : "Build your first design, then save it with a project name."}</p><button className="primary-button" type="button" onClick={onCreate}>{isZh ? "开始新项目" : "START A PROJECT"}</button></section>
        ) : (
          <div className="project-list">
            {projects.map((project) => (
              <article className="project-row" key={project.id}>
                <div className="project-row-icon"><Box size={21} /></div>
                <div className="project-row-name"><h2>{project.name}</h2><small>{project.snapshot.addedParts.length + allPartIds.length - project.snapshot.deletedIds.length} {isZh ? "个组件" : "PARTS"}</small></div>
                <div className="project-row-time"><Clock3 size={14} /><span>{new Date(project.updatedAt).toLocaleString(isZh ? "zh-CN" : "en-US", { hour12: false })}</span></div>
                <button type="button" onClick={() => onOpen(project)}><FolderOpen size={15} />{isZh ? "打开" : "OPEN"}</button>
                <button className="danger" type="button" aria-label={`${isZh ? "删除" : "DELETE"} ${project.name}`} onClick={() => onDelete(project.id)}><Trash2 size={15} /></button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  const [activePage, setActivePage] = useState<AppPage>("projects");
  const [libraryParts, setLibraryParts] = useState<LibraryPart[]>(initialLibraryParts);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>(readSavedProjects);
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(readSavedTemplates);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState("未命名项目");
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [helpDialogOpen, setHelpDialogOpen] = useState(false);
  const [bomFocusIds, setBomFocusIds] = useState<string[]>([]);
  const [saveNameDraft, setSaveNameDraft] = useState("");
  const [sidePanelTab, setSidePanelTab] = useState<"structure" | "dimensions" | "inspector">("structure");
  const [mirrorAxis, setMirrorAxis] = useState<MirrorAxis>("x");
  const [lang, setLang] = useState<Lang>("zh");
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem("axisframe-theme") === "light" ? "light" : "dark",
  );
  const [selectedId, setSelectedId] = useState("J-010");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [background, setBackground] = useState<CanvasBg>("room");
  const [dimensions, setDimensions] = useState<FrameDimensions>({
    width: 900,
    height: 900,
    depth: 350,
  });
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState<string | null>(null);
  const [referenceImageDataUrl, setReferenceImageDataUrl] = useState<string | null>(null);
  const [referenceImageVisible, setReferenceImageVisible] = useState(false);
  const [transforms, setTransforms] = useState<Record<string, PartTransform>>({});
  const [materials, setMaterials] = useState<Record<string, PartMaterial>>({});
  const [panelCutouts, setPanelCutouts] = useState<Record<string, PanelCutout[]>>({});
  const [resolvedRiskIds, setResolvedRiskIds] = useState<Set<string>>(() => new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(() => new Set(allPartIds));
  const [addedParts, setAddedParts] = useState<AddedPart[]>([]);
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [lockedIds, setLockedIds] = useState<Set<string>>(() => new Set());
  const [isolatedIds, setIsolatedIds] = useState<Set<string>>(() => new Set());
  const [assemblyConnections, setAssemblyConnections] = useState<AssemblyConnection[]>([]);
  const [preciseAssemblyRelations, setPreciseAssemblyRelations] = useState<PreciseAssemblyRelation[]>([]);
  const [undoStack, setUndoStack] = useState<EditorHistoryEntry<EditorSnapshot>[]>([]);
  const [redoStack, setRedoStack] = useState<EditorHistoryEntry<EditorSnapshot>[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving" | "failed">("saved");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [partPickerPlacement, setPartPickerPlacement] = useState<SmartPlacement | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [partClipboard, setPartClipboard] = useState<PartClipboardItem[]>([]);
  const [clipboardNotice, setClipboardNotice] = useState("");
  const [templateNotice, setTemplateNotice] = useState("");
  const [alignmentNotice, setAlignmentNotice] = useState("");
  const clipboardPasteCount = useRef(0);
  const availableTemplates = useMemo(
    () => [...savedTemplates.map(savedTemplateDefinition), ...rackTemplates],
    [savedTemplates],
  );
  const [focusRequest, setFocusRequest] = useState(0);
  const [exporting, setExporting] = useState(false);
  const availablePartIds = [...allPartIds, ...addedParts.map(({ id }) => id)];
  const activeUserGroupPartIds = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return userGroups
      .map((group) => group.partIds.filter((id) => availablePartIds.includes(id) && !deletedIds.has(id)))
      .find((partIds) => partIds.length >= 2 && partIds.length === selectedSet.size && partIds.every((id) => selectedSet.has(id)))
      ?? [];
  }, [addedParts, deletedIds, selectedIds, userGroups]);
  const activeUserGroup = useMemo(() => userGroups.find((group) => {
    const liveIds = group.partIds.filter((id) => availablePartIds.includes(id) && !deletedIds.has(id));
    return liveIds.length === activeUserGroupPartIds.length
      && liveIds.every((id) => activeUserGroupPartIds.includes(id));
  }), [activeUserGroupPartIds, addedParts, deletedIds, userGroups]);
  const sceneIsEmpty = availablePartIds.every((id) => deletedIds.has(id));
  const overallDesignBounds = useMemo(() => calculateOverallDesignBounds({
    dimensions,
    addedParts,
    transforms,
    deletedIds,
    hiddenIds,
    isolatedIds,
  }), [addedParts, deletedIds, dimensions, hiddenIds, isolatedIds, transforms]);
  const overallResizeBounds = useMemo(() => calculateOverallDesignBounds({
    dimensions,
    addedParts,
    transforms,
    deletedIds,
    hiddenIds: new Set<string>(),
    isolatedIds: new Set<string>(),
  }), [addedParts, deletedIds, dimensions, transforms]);
  const structuralModel = useMemo(() => calculateStructuralModel({
    dimensions,
    addedParts,
    transforms,
    materials,
    deletedIds,
    assemblyConnections,
  }), [addedParts, assemblyConnections, deletedIds, dimensions, materials, transforms]);
  const structuralAnalysis = useMemo(() => analyzeStructure(structuralModel), [structuralModel]);
  const displayedDimensions = overallResizeBounds?.dimensionsMm ?? dimensions;
  const selectedBaseInfo = getPartInfo(selectedId, lang, resolvedRiskIds, addedParts);
  const selectedTransform = getPartTransform(transforms, selectedId);
  const selectedRodBaseLength = getRodBaseLengthMm(selectedId, dimensions, addedParts);
  const selectedRodLength = Math.round(selectedRodBaseLength * selectedTransform.sizeX) / 100;
  const parameterizedSelectedInfo = selectedBaseInfo.kind === "rod" ? {
    ...selectedBaseInfo,
    componentId: `SHAFT-${selectedTransform.sizeY}-${selectedRodLength}`,
    sku: `SHAFT-${selectedTransform.sizeY}-${selectedRodLength}`,
    compatibleRod: `Ø${selectedTransform.sizeY} mm`,
  } : selectedBaseInfo;
  const selectedAssemblyConnections = assemblyConnections.filter((connection) =>
    connection.connectorId === selectedId || connection.shaftId === selectedId,
  );
  const selectedPreciseRelations = preciseAssemblyRelations.filter((relation) =>
    relation.fixedPartId === selectedId || relation.movingPartId === selectedId,
  );
  const selected = selectedAssemblyConnections.length > 0 && !parameterizedSelectedInfo.warning
    ? {
        ...parameterizedSelectedInfo,
        linkedRods: [...new Set(selectedAssemblyConnections.map((connection) =>
          connection.connectorId === selectedId ? connection.shaftId : connection.connectorId,
        ))].join(", "),
        rule: lang === "zh"
          ? parameterizedSelectedInfo.kind === "rod"
            ? `光轴作为基础机构件，已连接或穿过 ${selectedAssemblyConnections.length} 个连接端口/层板孔。`
            : parameterizedSelectedInfo.kind === "panel"
              ? `层板穿孔已与 ${selectedAssemblyConnections.length} 根光轴建立通过关系。`
              : `智能连接已建立：${selectedAssemblyConnections.length} 个端口通过孔径、轴向和位置校验。`
          : parameterizedSelectedInfo.kind === "rod"
            ? `BASE SHAFT CONNECTS TO OR PASSES THROUGH ${selectedAssemblyConnections.length} CONNECTOR PORTS / PANEL HOLES.`
            : parameterizedSelectedInfo.kind === "panel"
              ? `${selectedAssemblyConnections.length} SHAFTS PASS THROUGH THIS PANEL'S HOLES.`
              : `SMART CONNECTION ESTABLISHED: ${selectedAssemblyConnections.length} PORTS PASSED DIAMETER, AXIS, AND POSITION CHECKS.`,
      }
    : parameterizedSelectedInfo;
  const selectedMaterial = getPartMaterial(materials, selectedId);
  const selectedAddedPart = addedParts.find((part) => part.id === selectedId);
  const selectedShaftStopParameters = selectedAddedPart?.libraryPart?.parameters;
  const selectedParallelClampParameters = selectedAddedPart?.libraryPart?.parallelClampParameters;
  const selectedEqualBoreCrossClampDiameter = selectedAddedPart?.libraryPart?.equalBoreCrossClampDiameter;
  const selectedEqualBoreTClampDiameter = selectedAddedPart?.libraryPart?.equalBoreTClampDiameter;
  const selectedRoundFixedBaseInnerDiameter = selectedAddedPart?.libraryPart?.roundFixedBaseInnerDiameter;
  const selectedVerticalFixedBaseShaftDiameter = selectedAddedPart?.libraryPart?.verticalFixedBaseShaftDiameter;
  const selectedPanelDimensions = {
    widthMm: selectedTransform.sizeX,
    lengthMm: selectedTransform.sizeZ,
    thicknessMm: selectedTransform.sizeY,
  };
  const selectedPanelCutouts = selected.kind === "panel"
    ? normalizePanelCutouts(panelCutouts[selectedId], selectedPanelDimensions)
    : [];
  const canDrillSelectedPanel = selectedIds.length === 1
    && selected.kind === "panel"
    && !selectedAddedPart?.libraryPart?.pegboardParameters;
  const selectedStructuralIssues = structuralAnalysis.issues.filter((issue) => issue.partIds.includes(selectedId));
  const orderInput = useMemo(() => ({
    projectName: currentProjectName,
    dimensions,
    parts: [
      ...allPartIds.map((id) => ({ id, kind: getPartInfo(id, "zh", resolvedRiskIds, addedParts).kind })),
      ...addedParts,
    ],
    transforms,
    materials,
    deletedIds,
    unresolvedRiskIds: [...new Set(structuralAnalysis.issues.flatMap(({ partIds }) => partIds))],
  }), [addedParts, currentProjectName, deletedIds, dimensions, materials, resolvedRiskIds, structuralAnalysis.issues, transforms]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("axisframe-theme", theme);
  }, [theme]);

  const captureSnapshot = useCallback((): EditorSnapshot => ({
    schemaVersion: PROJECT_SCHEMA_VERSION,
    dimensions,
    background,
    referenceImageDataUrl,
    referenceImageVisible,
    transforms,
    materials,
    panelCutouts,
    resolvedRiskIds: [...resolvedRiskIds],
    deletedIds: [...deletedIds],
    addedParts,
    userGroups,
    hiddenIds: [...hiddenIds],
    lockedIds: [...lockedIds],
    isolatedIds: [...isolatedIds],
    assemblyConnections,
    preciseAssemblyRelations,
  }), [addedParts, assemblyConnections, background, deletedIds, dimensions, hiddenIds, isolatedIds, lockedIds, materials, panelCutouts, preciseAssemblyRelations, referenceImageDataUrl, referenceImageVisible, resolvedRiskIds, transforms, userGroups]);

  const applySnapshot = useCallback((snapshot: EditorSnapshot) => {
    const migrated = migrateRetiredCrossClampSnapshot(snapshot);
    setDimensions(migrated.dimensions);
    if (migrated.background) setBackground(migrated.background);
    setReferenceImageDataUrl(migrated.referenceImageDataUrl ?? null);
    setReferenceImageVisible(Boolean(migrated.referenceImageDataUrl && migrated.referenceImageVisible));
    setTransforms(migrated.transforms ?? {});
    setMaterials(migrated.materials ?? {});
    setPanelCutouts(Object.fromEntries(Object.entries(migrated.panelCutouts ?? {}).map(([id, cutouts]) => {
      const transform = getPartTransform(migrated.transforms ?? {}, id);
      return [id, normalizePanelCutouts(cutouts, {
        widthMm: transform.sizeX,
        lengthMm: transform.sizeZ,
        thicknessMm: transform.sizeY,
      })];
    })));
    setResolvedRiskIds(new Set(migrated.resolvedRiskIds ?? []));
    setDeletedIds(new Set(migrated.deletedIds ?? []));
    setAddedParts(migrated.addedParts ?? []);
    setUserGroups(migrated.userGroups ?? []);
    const restoredHiddenIds = new Set(migrated.hiddenIds ?? []);
    setHiddenIds(restoredHiddenIds);
    setLockedIds(new Set(migrated.lockedIds ?? []));
    setIsolatedIds(new Set((migrated.isolatedIds ?? []).filter((id) => !restoredHiddenIds.has(id))));
    setAssemblyConnections(migrated.assemblyConnections ?? []);
    setPreciseAssemblyRelations(migrated.preciseAssemblyRelations ?? []);
  }, []);

  const recordHistory = useCallback((command: EditorCommandName = "edit") => {
    const snapshot = captureSnapshot();
    setUndoStack((current) => [...current.slice(-49), createHistoryEntry(command, snapshot)]);
    setRedoStack([]);
    setSaveStatus("unsaved");
  }, [captureSnapshot]);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((current) => [...current, createHistoryEntry(previous.command, captureSnapshot())]);
    setUndoStack((current) => current.slice(0, -1));
    applySnapshot(applySnapshotPatch(previous.patch));
    setSaveStatus("unsaved");
  }, [applySnapshot, captureSnapshot, undoStack]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((current) => [...current, createHistoryEntry(next.command, captureSnapshot())]);
    setRedoStack((current) => current.slice(0, -1));
    applySnapshot(applySnapshotPatch(next.patch));
    setSaveStatus("unsaved");
  }, [applySnapshot, captureSnapshot, redoStack]);

  const loadRackTemplate = (templateId: RackTemplateId) => {
    const template = availableTemplates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    if (template.snapshot) {
      applySnapshot(template.snapshot);
      const visibleIds = [...allPartIds, ...template.snapshot.addedParts.map(({ id }) => id)]
        .filter((id) => !template.snapshot!.deletedIds.includes(id));
      const nextSelectedId = visibleIds[0] ?? "J-010";
      setSelectedId(nextSelectedId);
      setSelectedIds(visibleIds.length > 0 ? [nextSelectedId] : []);
    } else {
      setDimensions(template.dimensions);
      setBackground("room");
      setAddedParts([]);
      setDeletedIds(new Set(template.deletedPartIds));
      setTransforms({});
      setMaterials({});
      setPanelCutouts({});
      setResolvedRiskIds(new Set());
      setUserGroups([]);
      setHiddenIds(new Set());
      setLockedIds(new Set());
      setIsolatedIds(new Set());
      setAssemblyConnections([]);
      setPreciseAssemblyRelations([]);
      const visibleIds = allPartIds.filter((id) => !template.deletedPartIds.includes(id));
      const nextSelectedId = visibleIds[0] ?? "J-010";
      setSelectedId(nextSelectedId);
      setSelectedIds(visibleIds.length > 0 ? [nextSelectedId] : []);
    }
    setCurrentProjectId(null);
    setCurrentProjectName(lang === "zh" ? "未命名项目" : "UNTITLED PROJECT");
    window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
    window.localStorage.removeItem("axisframe-project-v1");
    setUndoStack([]);
    setRedoStack([]);
    setSaveStatus("unsaved");
    setTemplatePickerOpen(false);
    setActivePage("design");
  };

  const requestSaveProject = useCallback(() => {
    setSaveNameDraft(currentProjectId ? currentProjectName : "");
    setSaveDialogOpen(true);
  }, [currentProjectId, currentProjectName]);

  const commitSaveProject = useCallback(() => {
    const name = saveNameDraft.trim();
    if (!name) return;
    setSaveStatus("saving");
    try {
      const snapshot = captureSnapshot();
      const now = new Date().toISOString();
      const existing = savedProjects.find((project) => project.id === currentProjectId);
      const project: SavedProject = {
        id: existing?.id ?? `project-${Date.now()}`,
        name,
        version: PROJECT_SCHEMA_VERSION,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        snapshot,
      };
      const next = [project, ...savedProjects.filter((candidate) => candidate.id !== project.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, project.id);
      window.localStorage.setItem("axisframe-project-v1", JSON.stringify(snapshot));
      setSavedProjects(next);
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setSaveDialogOpen(false);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    }
  }, [captureSnapshot, currentProjectId, saveNameDraft, savedProjects]);

  const commitSaveTemplate = useCallback(() => {
    const name = saveNameDraft.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const template: SavedTemplate = {
      id: `template-${Date.now()}`,
      name,
      version: 1,
      createdAt: now,
      updatedAt: now,
      snapshot: captureSnapshot(),
    };
    const next = [template, ...savedTemplates];
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    setSavedTemplates(next);
    setSaveDialogOpen(false);
    setTemplateNotice(lang === "zh" ? `模板“${name}”已保存` : `TEMPLATE “${name}” SAVED`);
  }, [captureSnapshot, lang, saveNameDraft, savedTemplates]);

  const deleteSavedTemplate = (templateId: RackTemplateId) => {
    const next = savedTemplates.filter((template) => template.id !== templateId);
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    setSavedTemplates(next);
  };

  useEffect(() => {
    const projects = readSavedProjects();
    setSavedProjects(projects);
    const currentId = window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY);
    const currentProject = projects.find((project) => project.id === currentId);
    if (currentProject) {
      applySnapshot(currentProject.snapshot);
      setCurrentProjectId(currentProject.id);
      setCurrentProjectName(currentProject.name);
      setSaveStatus("saved");
      return;
    }
    const saved = window.localStorage.getItem("axisframe-project-v1");
    if (!saved) return;
    try {
      const migrated = migrateRetiredCrossClampSnapshot(JSON.parse(saved) as EditorSnapshot);
      window.localStorage.setItem("axisframe-project-v1", JSON.stringify(migrated));
      applySnapshot(migrated);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    }
  }, [applySnapshot]);

  useEffect(() => {
    if (saveStatus !== "unsaved" || saveDialogOpen) return;
    const timeout = window.setTimeout(() => {
      setSaveStatus("saving");
      try {
        const snapshot = captureSnapshot();
        window.localStorage.setItem("axisframe-project-v1", JSON.stringify(snapshot));
        if (currentProjectId) {
          const existing = savedProjects.find((project) => project.id === currentProjectId);
          if (existing) {
            const updatedProject: SavedProject = {
              ...existing,
              updatedAt: new Date().toISOString(),
              snapshot,
            };
            const next = [updatedProject, ...savedProjects.filter((project) => project.id !== currentProjectId)]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
            setSavedProjects(next);
          }
        }
        setSaveStatus("saved");
      } catch {
        setSaveStatus("failed");
      }
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [captureSnapshot, currentProjectId, saveDialogOpen, saveStatus, savedProjects]);

  const openSavedProject = (project: SavedProject) => {
    applySnapshot(project.snapshot);
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, project.id);
    setSelectedIds([]);
    setUndoStack([]);
    setRedoStack([]);
    setSaveStatus("saved");
    setActivePage("design");
  };

  const openTemplateCreator = () => {
    setActivePage("design");
    setTemplatePickerOpen(true);
  };

  const deleteSavedProject = (projectId: string) => {
    const next = savedProjects.filter((project) => project.id !== projectId);
    setSavedProjects(next);
    window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
    if (currentProjectId === projectId) {
      setCurrentProjectId(null);
      window.localStorage.removeItem(CURRENT_PROJECT_STORAGE_KEY);
      setSaveStatus("unsaved");
    }
  };

  const exportProjectBackup = () => {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    downloadJsonFile(`AxisFrame_projects_${date}.json`, createProjectBackup(savedProjects));
    setTemplateNotice(lang === "zh" ? "项目 JSON 备份已导出" : "PROJECT BACKUP EXPORTED");
  };

  const exportCurrentProjectJson = useCallback(() => {
    const now = new Date();
    const timestamp = now.toISOString();
    const existing = savedProjects.find((project) => project.id === currentProjectId);
    const project: SavedProject = {
      id: existing?.id ?? `export-${now.getTime()}`,
      name: currentProjectName,
      version: PROJECT_SCHEMA_VERSION,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      snapshot: captureSnapshot(),
    };
    const safeProjectName = currentProjectName.trim()
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
      .replace(/\s+/g, "_")
      .slice(0, 60) || "project";
    const date = timestamp.slice(0, 10).replaceAll("-", "");
    downloadJsonFile(`AxisFrame_${safeProjectName}_${date}.json`, createProjectBackup([project], now));
    setTemplateNotice(lang === "zh" ? "当前项目 JSON 已导出" : "CURRENT PROJECT JSON EXPORTED");
  }, [captureSnapshot, currentProjectId, currentProjectName, lang, savedProjects]);

  const importProjectBackup = async (file: File) => {
    try {
      const backup = parseProjectBackup(await file.text(), (value): value is SavedProject => {
        if (!value || typeof value !== "object") return false;
        const project = value as Partial<SavedProject>;
        return typeof project.id === "string"
          && typeof project.name === "string"
          && (project.version === 1 || project.version === PROJECT_SCHEMA_VERSION)
          && Boolean(project.snapshot?.dimensions);
      });
      const imported = backup.projects.map((project) => ({
        ...project,
        version: PROJECT_SCHEMA_VERSION,
        snapshot: migrateRetiredCrossClampSnapshot(project.snapshot),
      } satisfies SavedProject));
      const importedIds = new Set(imported.map(({ id }) => id));
      const next = [...imported, ...savedProjects.filter(({ id }) => !importedIds.has(id))]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(next));
      setSavedProjects(next);
      setTemplateNotice(lang === "zh" ? `已恢复 ${imported.length} 个项目` : `RESTORED ${imported.length} PROJECTS`);
    } catch {
      setTemplateNotice(lang === "zh" ? "恢复失败：JSON 格式或版本不受支持" : "RESTORE FAILED: UNSUPPORTED JSON OR VERSION");
    }
  };

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) =>
      (allPartIds.some((candidate) => candidate === id) || addedParts.some((part) => part.id === id)) && !deletedIds.has(id),
    ));
  }, [addedParts, deletedIds]);

  const selectPart = useCallback((id: string, additive = false) => {
    if (document.querySelector<HTMLCanvasElement>("canvas")?.dataset.panelResizeDragging) return;
    if (!additive) {
      const groupPartIds = userGroups
        .find((group) => group.partIds.includes(id))
        ?.partIds.filter((partId) => availablePartIds.includes(partId) && !deletedIds.has(partId));
      setSelectedIds(groupPartIds && groupPartIds.length >= 2 ? groupPartIds : [id]);
      setSelectedId(id);
      return;
    }
    setSelectedIds((current) => {
      if (current.includes(id)) {
        const next = current.filter((item) => item !== id);
        if (next.length > 0) setSelectedId(next[next.length - 1]);
        return next.length > 0 ? next : [id];
      }
      return [...current, id];
    });
    setSelectedId(id);
  }, [availablePartIds, deletedIds, userGroups]);

  const selectMany = useCallback((ids: string[]) => {
    if (ids.length === 0) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(ids);
    setSelectedId(ids[ids.length - 1]);
  }, []);

  const selectAllVisible = useCallback(() => {
    selectMany(availablePartIds.filter((id) =>
      !deletedIds.has(id) &&
      !hiddenIds.has(id) &&
      (isolatedIds.size === 0 || isolatedIds.has(id)),
    ));
  }, [availablePartIds, deletedIds, hiddenIds, isolatedIds, selectMany]);

  const resizeOverallDesign = (requested: FrameDimensions) => {
    const currentEnvelope = overallResizeBounds?.dimensionsMm ?? dimensions;
    const plan = createOverallResizePlan(currentEnvelope, requested);
    if (
      plan.dimensions.width === currentEnvelope.width &&
      plan.dimensions.depth === currentEnvelope.depth &&
      plan.dimensions.height === currentEnvelope.height
    ) return;
    recordHistory("change-parameter");
    const sceneUnitsPerMm = mmToScene(1);
    const resizeAnchor = overallResizeBounds
      ? {
          x: overallResizeBounds.center[0] / sceneUnitsPerMm,
          y: overallResizeBounds.min[1] / sceneUnitsPerMm,
          z: overallResizeBounds.center[2] / sceneUnitsPerMm,
        }
      : { x: 0, y: DESIGN_GROUND_Y_MM, z: 0 };
    const shaftSegments = new Map(buildVisibleShaftSegments({
      dimensions,
      addedParts,
      transforms,
      deletedIds,
      hiddenIds: new Set<string>(),
      isolatedIds: new Set<string>(),
    }).map((segment) => [segment.partId, segment]));
    let effectiveFactors = { ...plan.factors };
    let nextFrameDimensions = dimensions;
    let nextTransforms: Record<string, PartTransform> = {};
    for (let iteration = 0; iteration < 3; iteration += 1) {
      nextFrameDimensions = createOverallResizePlan(dimensions, {
        width: dimensions.width * effectiveFactors.width,
        depth: dimensions.depth * effectiveFactors.depth,
        height: dimensions.height * effectiveFactors.height,
      }).dimensions;
      nextTransforms = {};
      availablePartIds.filter((id) => !deletedIds.has(id)).forEach((id) => {
        const before = getPartTransform(transforms, id);
        const kind = getPartInfo(id, lang, resolvedRiskIds, addedParts).kind;
        const currentWorldMm = getPartWorldPosition(id, dimensions, addedParts, transforms)
          .map((value) => value / sceneUnitsPerMm) as Vec3Tuple;
        const nextWorldPoint = scaleWorldPointMm(currentWorldMm, effectiveFactors, resizeAnchor)
          .map(mmToScene) as Vec3Tuple;
        let resized = before;
        if (kind === "panel") {
          const effectivePanel = id.startsWith("P-") && !transforms[id]
            ? {
                ...before,
                sizeX: Math.max(100, dimensions.width - 20),
                sizeZ: Math.max(100, dimensions.depth - 15),
              }
            : before;
          const envelope = resizePanelEnvelope({
            width: effectivePanel.sizeX,
            thickness: effectivePanel.sizeY,
            depth: effectivePanel.sizeZ,
          }, effectiveFactors);
          resized = { ...effectivePanel, sizeX: envelope.width, sizeY: envelope.thickness, sizeZ: envelope.depth };
        } else if (kind === "rod" && addedParts.some((part) => part.id === id)) {
          const segment = shaftSegments.get(id);
          const direction = segment
            ? segment.end.map((value, index) => value - segment.start[index]) as Vec3Tuple
            : [1, 0, 0] satisfies Vec3Tuple;
          resized = {
            ...before,
            sizeX: Math.max(0.1, before.sizeX * dominantDirectionScale(direction, effectiveFactors)),
          };
        }
        nextTransforms[id] = transformAtWorldPoint(
          id,
          nextWorldPoint,
          nextFrameDimensions,
          addedParts,
          resized,
        );
      });
      const predictedBounds = calculateOverallDesignBounds({
        dimensions: nextFrameDimensions,
        addedParts,
        transforms: { ...transforms, ...nextTransforms },
        deletedIds,
        hiddenIds: new Set<string>(),
        isolatedIds: new Set<string>(),
      });
      if (!predictedBounds) break;
      const predicted = predictedBounds.dimensionsMm;
      const withinTolerance = Math.abs(predicted.width - plan.dimensions.width) <= 1
        && Math.abs(predicted.depth - plan.dimensions.depth) <= 1
        && Math.abs(predicted.height - plan.dimensions.height) <= 1;
      if (withinTolerance || iteration === 2) break;
      const correction = createOverallResizePlan(predicted, plan.dimensions).factors;
      effectiveFactors = {
        width: effectiveFactors.width * correction.width,
        depth: effectiveFactors.depth * correction.depth,
        height: effectiveFactors.height * correction.height,
      };
    }
    let nextPreciseRelations = [...preciseAssemblyRelations];
    preciseAssemblyRelations.filter(({ type, status }) =>
      type !== "shaft-bore" && status !== "invalid",
    ).forEach((relation) => {
      const relationTransforms = { ...transforms, ...nextTransforms };
      const fixed = buildPreciseBoxPart({
        id: relation.fixedPartId,
        dimensions: nextFrameDimensions,
        addedParts,
        transforms: relationTransforms,
      });
      const moving = buildPreciseBoxPart({
        id: relation.movingPartId,
        dimensions: nextFrameDimensions,
        addedParts,
        transforms: relationTransforms,
      });
      if (!fixed || !moving) return;
      const solved = solveSurfaceRelation({
        fixed,
        moving,
        gapMm: relation.gapMm ?? 0,
        fixedFeatureId: relation.fixedFeatureId,
        movingFeatureId: relation.movingFeatureId,
      });
      if (!solved.ok) {
        nextPreciseRelations = nextPreciseRelations.map((candidate) => candidate.id === relation.id
          ? {
              ...candidate,
              status: "invalid" as const,
              message: preciseRelationFailureMessage(solved.reason, lang),
            }
          : candidate);
        return;
      }
      const before = getPartTransform(relationTransforms, relation.movingPartId);
      nextTransforms[relation.movingPartId] = transformAtWorldPoint(
        relation.movingPartId,
        addVec3(moving.center, solved.candidate.translation),
        nextFrameDimensions,
        addedParts,
        before,
      );
      nextPreciseRelations = nextPreciseRelations.map((candidate) => candidate.id === relation.id
        ? { ...candidate, status: "valid" as const, residualMm: 0, message: undefined }
        : candidate);
    });
    setDimensions(nextFrameDimensions);
    setTransforms((current) => ({ ...current, ...nextTransforms }));
    setPreciseAssemblyRelations(nextPreciseRelations);
    setPanelCutouts((current) => Object.fromEntries(Object.entries(current).map(([id, cutouts]) => {
      const defaultBefore = getPartTransform(transforms, id);
      const before = id.startsWith("P-") && !transforms[id]
        ? { ...defaultBefore, sizeX: Math.max(100, dimensions.width - 20), sizeZ: Math.max(100, dimensions.depth - 15) }
        : defaultBefore;
      const after = nextTransforms[id] ?? before;
      const widthScale = after.sizeX / Math.max(1, before.sizeX);
      const depthScale = after.sizeZ / Math.max(1, before.sizeZ);
      return [id, normalizePanelCutouts(cutouts.map((cutout) => ({
        ...cutout,
        xMm: cutout.xMm * widthScale,
        zMm: cutout.zMm * depthScale,
      })), {
        widthMm: after.sizeX,
        lengthMm: after.sizeZ,
        thicknessMm: after.sizeY,
      })];
    })));
    setAlignmentNotice(lang === "zh"
      ? `整体尺寸已调整为 ${plan.dimensions.width} × ${plan.dimensions.depth} × ${plan.dimensions.height} mm，结构已自适应`
      : `OVERALL SIZE UPDATED TO ${plan.dimensions.width} × ${plan.dimensions.depth} × ${plan.dimensions.height} MM · LAYOUT ADAPTED`);
    setFocusRequest((current) => current + 1);
  };

  const updateGroupTransforms: GroupTransformChangeHandler = (nextTransforms) => {
    const transformedIds = Object.keys(nextTransforms);
    if (transformedIds.length < 2) return;
    recordHistory("transform-part");
    setTransforms((current) => ({ ...current, ...nextTransforms }));
    const transformedSet = new Set(transformedIds);
    setAssemblyConnections((current) => current.filter((connection) => {
      const connectorInside = transformedSet.has(connection.connectorId);
      const shaftInside = transformedSet.has(connection.shaftId);
      return connectorInside === shaftInside;
    }));
    setPreciseAssemblyRelations((current) => current.map((relation) => {
      const fixedInside = transformedSet.has(relation.fixedPartId);
      const movingInside = transformedSet.has(relation.movingPartId);
      return fixedInside === movingInside
        ? relation
        : {
            ...relation,
            status: "invalid" as const,
            message: lang === "zh" ? "关系只有一端参与了编组变换" : "ONLY ONE RELATION ENDPOINT WAS GROUP-TRANSFORMED",
          };
    }));
    setSaveStatus("unsaved");
    setAlignmentNotice(lang === "zh"
      ? `已整体变换编组（${transformedIds.length} 个组件）`
      : `GROUP TRANSFORMED AS ONE (${transformedIds.length} COMPONENTS)`);
  };

  const updateSelectedTransform = (next: PartTransform) => {
    if (activeUserGroupPartIds.length >= 2) {
      const primaryBefore = getPartTransform(transforms, selectedId);
      const positionDelta: Vec3Tuple = [
        mmToScene(next.x - primaryBefore.x),
        mmToScene(next.y - primaryBefore.y),
        mmToScene(next.z - primaryBefore.z),
      ];
      const memberPositions = Object.fromEntries(activeUserGroupPartIds.map((id) => [
        id,
        getPartWorldPosition(id, dimensions, addedParts, transforms),
      ])) as Record<string, Vec3Tuple>;
      const memberTransforms = Object.fromEntries(activeUserGroupPartIds.map((id) => [
        id,
        getPartTransform(transforms, id),
      ])) as Record<string, PartTransform>;
      const pivot = calculateGroupPivot(Object.values(memberPositions));
      const placements = transformGroupMembers({
        pivot,
        controlPosition: addVec3(pivot, positionDelta),
        controlRotation: [
          next.rotX - primaryBefore.rotX,
          next.rotY - primaryBefore.rotY,
          next.rotZ - primaryBefore.rotZ,
        ],
        controlScale: [
          next.scaleX / Math.max(0.001, primaryBefore.scaleX),
          next.scaleY / Math.max(0.001, primaryBefore.scaleY),
          next.scaleZ / Math.max(0.001, primaryBefore.scaleZ),
        ],
        memberIds: activeUserGroupPartIds,
        memberPositions,
        memberTransforms,
      });
      const sizeDelta = {
        sizeX: next.sizeX - primaryBefore.sizeX,
        sizeY: next.sizeY - primaryBefore.sizeY,
        sizeZ: next.sizeZ - primaryBefore.sizeZ,
      };
      const nextTransforms = Object.fromEntries(placements.map(({ id, position, transform }) => [
        id,
        transformAtWorldPoint(id, position, dimensions, addedParts, {
          ...transform,
          sizeX: Math.max(1, transform.sizeX + sizeDelta.sizeX),
          sizeY: Math.max(1, transform.sizeY + sizeDelta.sizeY),
          sizeZ: Math.max(1, transform.sizeZ + sizeDelta.sizeZ),
        }),
      ])) as Record<string, PartTransform>;
      updateGroupTransforms(nextTransforms);
      return;
    }
    recordHistory("transform-part");
    const primaryBefore = getPartTransform(transforms, selectedId);
    const proposedTransforms = Object.fromEntries(selectedIds.map((id) => {
      const before = getPartTransform(transforms, id);
      return [id, Object.fromEntries(
        (Object.keys(next) as Array<keyof PartTransform>).map((key) => [key, before[key] + (next[key] - primaryBefore[key])]),
      ) as PartTransform];
    }));
    const nextTransforms = { ...proposedTransforms };
    selectedIds.forEach((id) => {
      nextTransforms[id] = constrainPartTransformToContactSurfaces({
        id,
        transform: nextTransforms[id],
        dimensions,
        addedParts,
        transforms: { ...transforms, ...nextTransforms },
        deletedIds,
      });
    });
    setTransforms((current) => ({ ...current, ...nextTransforms }));
    setPanelCutouts((current) => {
      const updated = { ...current };
      selectedIds.forEach((id) => {
        if (!current[id]?.length || getPartInfo(id, lang, resolvedRiskIds, addedParts).kind !== "panel") return;
        const panelTransform = nextTransforms[id];
        updated[id] = normalizePanelCutouts(current[id], {
          widthMm: panelTransform.sizeX,
          lengthMm: panelTransform.sizeZ,
          thicknessMm: panelTransform.sizeY,
        });
      });
      return updated;
    });
    const selectedSet = new Set(selectedIds);
    setAssemblyConnections((current) => current.filter((connection) =>
      !selectedSet.has(connection.connectorId) && !selectedSet.has(connection.shaftId),
    ));
  };
  const invalidatePreciseRelationsForParts = (partIds: readonly string[], message: string) => {
    const partSet = new Set(partIds);
    setPreciseAssemblyRelations((current) => current.map((relation) =>
      partSet.has(relation.fixedPartId) || partSet.has(relation.movingPartId)
        ? { ...relation, status: "invalid" as const, message }
        : relation));
  };
  const updateSelectedShaftParameters = (diameter: number, length: number) => {
    recordHistory("change-parameter");
    setTransforms((current) => ({
      ...current,
      ...Object.fromEntries(selectedIds.map((id) => {
        const before = getPartTransform(current, id);
        const baseLength = getRodBaseLengthMm(id, dimensions, addedParts);
        return [id, {
          ...before,
          sizeX: Math.max(0.1, (length / baseLength) * 100),
          sizeY: diameter,
          sizeZ: diameter,
        } satisfies PartTransform];
      })),
    }));
    const selectedSet = new Set(selectedIds);
    setAssemblyConnections((current) => current.filter((connection) =>
      !selectedSet.has(connection.connectorId) && !selectedSet.has(connection.shaftId),
    ));
    invalidatePreciseRelationsForParts(selectedIds, lang === "zh"
      ? "光轴参数已改变，需要重新校验孔径和轴向位置"
      : "SHAFT PARAMETERS CHANGED; BORE FIT AND AXIAL POSITION REQUIRE VALIDATION");
  };
  const updateSelectedShaftStopParameters = (parameter: ShaftStopParameterKey, value: number) => {
    if (!selectedShaftStopParameters) return;
    const requested = parameter === "innerDiameter"
      ? { ...selectedShaftStopParameters, innerDiameter: value }
      : { ...selectedShaftStopParameters, thickness: value };
    const parameters = resolveShaftStopParameters(requested);
    const variant = resolveShaftStopVariant(parameters);
    const dimensions = shaftStopDimensions(parameters);
    recordHistory("change-parameter");
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || !part.libraryPart?.parameters) return part;
      return {
        ...part,
        libraryPart: {
          ...part.libraryPart,
          model: shaftStopModel(parameters),
          parameters,
          dimensions,
          compatibleRod: `Ø${variant.innerDiameter} mm`,
          connector: `轴向限位 / 开口锁紧 / ${variant.thread}`,
          geometry: createShaftStopComponentGeometry(parameters),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.length,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updateSelectedParallelClampParameters = (parameter: ParallelClampParameterKey, value: number) => {
    if (!selectedParallelClampParameters) return;
    recordHistory("change-parameter");
    const requested = parameter === "holeCenterDistance"
      ? { ...selectedParallelClampParameters, holeCenterDistance: value }
      : { ...selectedParallelClampParameters, hole1Diameter: value, hole2Diameter: value };
    const parameters = resolveParallelClampParameters(requested);
    const dimensions = parallelClampDimensions(parameters);
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || !part.libraryPart?.parallelClampParameters) return part;
      return {
        ...part,
        libraryPart: {
          ...part.libraryPart,
          model: parallelClampModel(parameters),
          dimensions,
          parallelClampParameters: parameters,
          compatibleRod: `Ø${parameters.hole1Diameter} mm × Ø${parameters.hole2Diameter} mm`,
          connector: `同径平行双孔 / 中心距 ${parameters.holeCenterDistance} mm / M5`,
          geometry: createParallelClampComponentGeometry(parameters),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.length,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updateSelectedEqualBoreCrossClampModel = (diameter: number) => {
    if (selectedEqualBoreCrossClampDiameter === undefined) return;
    const variant = resolveEqualBoreCrossClampVariant(diameter);
    recordHistory("change-parameter");
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || part.libraryPart?.equalBoreCrossClampDiameter === undefined) return part;
      return {
        ...part,
        libraryPart: {
          ...parameterizedEqualBoreCrossClampPart(part.libraryPart, variant.diameter, lang),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: variant.length,
        sizeY: variant.height,
        sizeZ: variant.width,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updateSelectedEqualBoreTClampModel = (diameter: number) => {
    if (selectedEqualBoreTClampDiameter === undefined) return;
    const variant = resolveEqualBoreTClampVariant(diameter);
    const dimensions = equalBoreTClampDimensions(variant);
    recordHistory("change-parameter");
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || part.libraryPart?.equalBoreTClampDiameter === undefined) return part;
      return {
        ...part,
        libraryPart: {
          ...parameterizedEqualBoreTClampPart(part.libraryPart, variant.diameter, lang),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.length,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updateSelectedRoundFixedBaseInnerDiameter = (innerDiameter: number) => {
    if (selectedRoundFixedBaseInnerDiameter === undefined) return;
    const variant = resolveRoundFixedBaseVariant(innerDiameter);
    const dimensions = roundFixedBaseDimensions(variant);
    recordHistory("change-parameter");
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || part.libraryPart?.roundFixedBaseInnerDiameter === undefined) return part;
      return {
        ...part,
        libraryPart: {
          ...parameterizedRoundFixedBasePart(part.libraryPart, variant.innerDiameter, lang),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.length,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updateSelectedVerticalFixedBaseModel = (model: string) => {
    if (selectedVerticalFixedBaseShaftDiameter === undefined) return;
    const variant = resolveVerticalFixedBaseVariant(model);
    const dimensions = verticalFixedBaseDimensions(variant);
    recordHistory("change-parameter");
    setAddedParts((current) => current.map((part) => {
      if (part.id !== selectedId || part.libraryPart?.verticalFixedBaseShaftDiameter === undefined) return part;
      return {
        ...part,
        libraryPart: {
          ...parameterizedVerticalFixedBasePart(part.libraryPart, variant.model, lang),
          updatedAt: new Date().toISOString().slice(0, 10),
        },
      };
    }));
    setTransforms((current) => ({
      ...current,
      [selectedId]: {
        ...getPartTransform(current, selectedId),
        sizeX: dimensions.width,
        sizeY: dimensions.height,
        sizeZ: dimensions.length,
      },
    }));
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== selectedId));
    invalidatePreciseRelationsForParts([selectedId], lang === "zh" ? "组件规格已改变，需要重新求解" : "COMPONENT VARIANT CHANGED; RESOLVE REQUIRED");
    setSaveStatus("unsaved");
  };
  const updatePartTransform: TransformChangeHandler = (id, next, connections = []) => {
    recordHistory("transform-part");
    setTransforms((current) => {
      const constrained = constrainPartTransformToContactSurfaces({
        id,
        transform: next,
        dimensions,
        addedParts,
        transforms: current,
        deletedIds,
      });
      return { ...current, [id]: constrained };
    });
    setAssemblyConnections((current) => [
      ...current.filter((connection) => connection.connectorId !== id && connection.shaftId !== id),
      ...connections,
    ]);
    setPreciseAssemblyRelations((current) => current.map((relation) =>
      relation.fixedPartId === id || relation.movingPartId === id
        ? {
            ...relation,
            status: "invalid" as const,
            message: lang === "zh" ? "组件已手动变换，需要重新求解" : "PART WAS TRANSFORMED; RESOLVE REQUIRED",
          }
        : relation));
  };
  const selectedPairKinds = selectedIds.map((id) => ({
    id,
    kind: getPartInfo(id, lang, resolvedRiskIds, addedParts).kind,
  }));
  const selectedPairShaft = selectedPairKinds.find(({ kind }) => kind === "rod");
  const selectedPairConnector = selectedPairKinds.find(({ kind }) => kind === "joint");
  const selectedPairPanel = selectedPairKinds.find(({ kind }) => kind === "panel");
  const selectedPairConnectors = selectedPairKinds.filter(({ kind }) => kind === "joint");
  const selectedPairSurfaceParts = selectedPairKinds.filter(({ kind }) => kind !== "rod");
  const selectedPairMovingId = selectedIds[1] ?? "";
  const canConnectSelectedPair = selectedIds.length === 2
    && (Boolean(selectedPairShaft) && Boolean(selectedPairConnector || selectedPairPanel) || selectedPairConnectors.length === 2)
    && !lockedIds.has(selectedPairMovingId);
  const canSurfaceSelectedPair = selectedIds.length === 2
    && selectedPairSurfaceParts.length === 2
    && !lockedIds.has(selectedPairMovingId);
  const alignSelectedPair = (axis: AlignmentAxis) => {
    if (selectedIds.length !== 2) return;
    const anchorId = selectedIds[0];
    const movingId = selectedIds[1];
    if (lockedIds.has(movingId)) {
      setAlignmentNotice(lang === "zh" ? `${movingId} 已锁定，无法对齐` : `${movingId} IS LOCKED`);
      return;
    }
    const movingTransform = getPartTransform(transforms, movingId);
    const nextWorld = alignPairPosition(
      getPartWorldPosition(anchorId, dimensions, addedParts, transforms),
      getPartWorldPosition(movingId, dimensions, addedParts, transforms),
      axis,
    );
    recordHistory("align");
    setTransforms((current) => {
      const aligned = transformAtWorldPoint(movingId, nextWorld, dimensions, addedParts, movingTransform);
      const constrained = constrainPartTransformToContactSurfaces({
        id: movingId,
        transform: aligned,
        dimensions,
        addedParts,
        transforms: current,
        deletedIds,
      });
      return { ...current, [movingId]: constrained };
    });
    setAssemblyConnections((current) => current.filter((connection) =>
      connection.connectorId !== movingId && connection.shaftId !== movingId,
    ));
    setAlignmentNotice(lang === "zh"
      ? `${movingId} 已沿 ${axis.toUpperCase()} 轴对齐 ${anchorId}`
      : `${movingId} ALIGNED TO ${anchorId} ON ${axis.toUpperCase()}`);
  };
  const setSelectedPairSurfaceGap = (gapMm: number) => {
    if (selectedIds.length !== 2 || !canSurfaceSelectedPair) {
      setAlignmentNotice(lang === "zh"
        ? "表面关系需要选择两个连接件或层板"
        : "SELECT TWO CONNECTORS OR PANELS FOR A SURFACE RELATION");
      return;
    }
    const fixedPartId = selectedIds[0];
    const movingPartId = selectedIds[1];
    const fixed = buildPreciseBoxPart({ id: fixedPartId, dimensions, addedParts, transforms });
    const moving = buildPreciseBoxPart({ id: movingPartId, dimensions, addedParts, transforms });
    if (!fixed || !moving) {
      setAlignmentNotice(lang === "zh" ? "所选组件没有可用装配表面" : "NO ASSEMBLY FACES AVAILABLE");
      return;
    }
    const solved = solveSurfaceRelation({ fixed, moving, gapMm });
    if (!solved.ok) {
      setAlignmentNotice(preciseRelationFailureMessage(solved.reason, lang));
      return;
    }
    const movingTransform = getPartTransform(transforms, movingPartId);
    const nextWorldPosition = addVec3(moving.center, solved.candidate.translation);
    const relation = createSurfaceRelation({
      id: `REL-SURFACE-${fixedPartId}-${movingPartId}`,
      fixedPartId,
      movingPartId,
      candidate: solved.candidate,
    });
    recordHistory("align");
    setTransforms((current) => ({
      ...current,
      [movingPartId]: transformAtWorldPoint(
        movingPartId,
        nextWorldPosition,
        dimensions,
        addedParts,
        movingTransform,
      ),
    }));
    setAssemblyConnections((current) => current.filter((connection) =>
      connection.connectorId !== movingPartId && connection.shaftId !== movingPartId,
    ));
    setPreciseAssemblyRelations((current) => replacePairRelation(
      current.map((candidate) => candidate.id !== relation.id
        && (candidate.fixedPartId === movingPartId || candidate.movingPartId === movingPartId)
        ? {
            ...candidate,
            status: "invalid" as const,
            message: lang === "zh" ? "组件位置已改变，需要重新求解" : "PART MOVED; RELATION REQUIRES RESOLVE",
          }
        : candidate),
      relation,
    ));
    setAlignmentNotice(lang === "zh"
      ? gapMm === 0
        ? `已保持 ${fixedPartId} 不动，并将 ${movingPartId} 表面贴合`
        : `已保持 ${fixedPartId} 不动，并设置 ${movingPartId} 表面间距 ${gapMm.toFixed(1)} mm`
      : gapMm === 0
        ? `KEPT ${fixedPartId} FIXED AND FIT ${movingPartId} FACE-TO-FACE`
        : `KEPT ${fixedPartId} FIXED · ${movingPartId} GAP ${gapMm.toFixed(1)} MM`);
  };
  const exchangeSelectedPair = () => {
    if (selectedIds.length !== 2) return;
    const [fixedPartId, movingPartId] = selectedIds;
    setSelectedIds([movingPartId, fixedPartId]);
    setSelectedId(fixedPartId);
    setAlignmentNotice(lang === "zh"
      ? `已交换基准：${movingPartId} 固定，${fixedPartId} 移动`
      : `ANCHOR SWAPPED: ${movingPartId} FIXED, ${fixedPartId} MOVES`);
  };
  const smartConnectSelectedPair = () => {
    if (selectedIds.length !== 2) {
      setAlignmentNotice(lang === "zh" ? "请选择两个可连接组件" : "SELECT TWO CONNECTABLE COMPONENTS");
      return;
    }
    const anchorId = selectedIds[0];
    const movingId = selectedIds[1];
    if (lockedIds.has(movingId)) {
      setAlignmentNotice(lang === "zh" ? `${movingId} 已锁定，无法连接` : `${movingId} IS LOCKED`);
      return;
    }
    if (selectedPairConnectors.length === 2) {
      const anchorTransform = getPartTransform(transforms, anchorId);
      const movingTransform = getPartTransform(transforms, movingId);
      const surfaceContact = snapConnectorToConnectorSurface({
        position: getPartWorldPosition(movingId, dimensions, addedParts, transforms),
        rotation: [movingTransform.rotX, movingTransform.rotY, movingTransform.rotZ],
        size: [
          mmToScene(movingTransform.sizeX) * Math.abs(movingTransform.scaleX),
          mmToScene(movingTransform.sizeY) * Math.abs(movingTransform.scaleY),
          mmToScene(movingTransform.sizeZ) * Math.abs(movingTransform.scaleZ),
        ],
        connectors: [{
          partId: anchorId,
          center: getPartWorldPosition(anchorId, dimensions, addedParts, transforms),
          rotation: [anchorTransform.rotX, anchorTransform.rotY, anchorTransform.rotZ],
          size: [
            mmToScene(anchorTransform.sizeX) * Math.abs(anchorTransform.scaleX),
            mmToScene(anchorTransform.sizeY) * Math.abs(anchorTransform.scaleY),
            mmToScene(anchorTransform.sizeZ) * Math.abs(anchorTransform.scaleZ),
          ],
        }],
        snapDistanceMm: 10000,
        alignSurfaceCenters: true,
      });
      if (!surfaceContact) {
        setAlignmentNotice(lang === "zh" ? "智能连接失败：未找到可贴合表面" : "SMART CONNECT FAILED: NO CONTACT FACE FOUND");
        return;
      }
      recordHistory("align");
      setTransforms((current) => {
        const contacted = transformAtWorldPoint(movingId, surfaceContact.position, dimensions, addedParts, movingTransform);
        const constrained = constrainPartTransformToContactSurfaces({
          id: movingId,
          transform: contacted,
          dimensions,
          addedParts,
          transforms: current,
          deletedIds,
        });
        return { ...current, [movingId]: constrained };
      });
      setAssemblyConnections((current) => current.filter((connection) =>
        connection.connectorId !== movingId && connection.shaftId !== movingId,
      ));
      setPreciseAssemblyRelations((current) => replacePairRelation(current, {
        id: `REL-SURFACE-${anchorId}-${movingId}`,
        type: "surface-contact",
        fixedPartId: anchorId,
        movingPartId: movingId,
        fixedFeatureId: "auto-envelope-face",
        movingFeatureId: "auto-envelope-face",
        gapMm: 0,
        status: "valid",
        residualMm: 0,
      }));
      setAlignmentNotice(lang === "zh"
        ? `已保持 ${anchorId} 不动，并将 ${movingId} 表面贴合到 ${anchorId}`
        : `KEPT ${anchorId} FIXED AND FIT ${movingId} FACE-TO-FACE`);
      return;
    }
    if (selectedPairShaft && selectedPairPanel) {
      const shaftId = selectedPairShaft.id;
      const panelId = selectedPairPanel.id;
      const shaft = buildVisibleShaftSegments({
        dimensions,
        addedParts,
        transforms,
        deletedIds,
        hiddenIds,
        isolatedIds,
      }).find((segment) => segment.partId === shaftId);
      const holes = buildPanelHoleTargets({
        dimensions,
        addedParts,
        transforms,
        panelCutouts,
        deletedIds,
        hiddenIds,
        isolatedIds,
        onlyPartId: panelId,
      });
      if (!shaft || holes.length === 0) {
        setAlignmentNotice(lang === "zh"
          ? "孔轴对齐失败：所选层板没有可用穿孔"
          : "SHAFT ALIGNMENT FAILED: THE PANEL HAS NO AVAILABLE HOLES");
        return;
      }
      const shaftStart = new THREE.Vector3(...shaft.start);
      const shaftEnd = new THREE.Vector3(...shaft.end);
      const shaftCenter = shaftStart.clone().add(shaftEnd).multiplyScalar(0.5);
      const shaftAxis = shaftEnd.clone().sub(shaftStart).normalize();
      const shaftLength = shaftStart.distanceTo(shaftEnd);
      const snap = findBestShaftPanelHoleSnap({
        shaftId,
        proposedPosition: shaftCenter.toArray() as Vec3Tuple,
        proposedRotation: [0, 0, 0],
        localAxis: shaftAxis.toArray() as Vec3Tuple,
        shaftDiameterMm: shaft.diameter,
        shaftLength,
        holes,
        maxDistanceMm: 10000,
        axisToleranceDeg: 7.5,
      });
      if (!snap) {
        setAlignmentNotice(lang === "zh"
          ? "孔轴对齐失败：当前方向没有孔径兼容且轴向平行的孔，系统不会自动旋转组件"
          : "SHAFT ALIGNMENT FAILED: NO PARALLEL, DIAMETER-COMPATIBLE HOLE IN THE CURRENT POSE");
        return;
      }
      recordHistory("align");
      if (movingId === shaftId) {
        const shaftTransform = getPartTransform(transforms, shaftId);
        setTransforms((current) => ({
          ...current,
          [shaftId]: transformAtWorldPoint(shaftId, snap.position, dimensions, addedParts, shaftTransform),
        }));
      } else {
        const panelTransform = getPartTransform(transforms, panelId);
        const shaftTranslation = new THREE.Vector3(...snap.position).sub(shaftCenter);
        const panelTarget = new THREE.Vector3(...getPartWorldPosition(panelId, dimensions, addedParts, transforms))
          .sub(shaftTranslation)
          .toArray() as Vec3Tuple;
        setTransforms((current) => ({
          ...current,
          [panelId]: transformAtWorldPoint(panelId, panelTarget, dimensions, addedParts, panelTransform),
        }));
      }
      setAssemblyConnections((current) => [
        ...current.filter((connection) =>
          connection.connectorId !== movingId && connection.shaftId !== movingId,
        ),
        ...snap.connections,
      ]);
      setPreciseAssemblyRelations((current) => snap.connections.reduce((relations, connection) =>
        replacePairRelation(relations, createShaftBoreRelation({
          id: `REL-SHAFT-${connection.connectorId}-${connection.portId}-${connection.shaftId}`,
          fixedPartId: anchorId,
          movingPartId: movingId,
          connectorId: connection.connectorId,
          portId: connection.portId,
          shaftId: connection.shaftId,
          axialReference: "preserve",
          axialOffsetMm: Math.round(connection.positionOnShaft * shaftLength / mmToScene(1) * 10) / 10,
        })), current));
      setAlignmentNotice(lang === "zh"
        ? `已保持 ${anchorId} 不动，使 ${movingId} 与 ${snap.connections.length} 个共线孔同轴`
        : `KEPT ${anchorId} FIXED · ${movingId} ALIGNED WITH ${snap.connections.length} COLLINEAR HOLE${snap.connections.length === 1 ? "" : "S"}`);
      return;
    }
    if (!selectedPairShaft || !selectedPairConnector) {
      setAlignmentNotice(lang === "zh" ? "请选择光轴与连接件/层板，或两个连接件" : "SELECT A SHAFT AND CONNECTOR/PANEL, OR TWO CONNECTORS");
      return;
    }
    const shaftId = selectedPairShaft.id;
    const connectorId = selectedPairConnector.id;
    const shaft = buildVisibleShaftSegments({
      dimensions,
      addedParts,
      transforms,
      deletedIds,
      hiddenIds,
      isolatedIds,
    }).find((segment) => segment.partId === shaftId);
    const connectorPart = addedParts.find((part) => part.id === connectorId);
    const renderedConnector = connectorPart?.libraryPart ?? defaultCrossConnectorPart;
    const ports = fittedComponentPorts(renderedConnector);
    const connectorTransform = getPartTransform(transforms, connectorId);
    const connectorIsMoving = movingId === connectorId;
    const lockAxialStop = connectorIsMoving && ports.some((port) => isShaftAssemblyPort(port) && port.behavior === "stop");
    if (!shaft) {
      setAlignmentNotice(lang === "zh" ? "所选光轴当前不可见" : "THE SELECTED SHAFT IS NOT VISIBLE");
      return;
    }
    const snap = findBestSmartSnap({
      connectorId,
      proposedPosition: getPartWorldPosition(connectorId, dimensions, addedParts, transforms),
      proposedRotation: [connectorTransform.rotX, connectorTransform.rotY, connectorTransform.rotZ],
      ports,
      shafts: [shaft],
      occupiedConnections: assemblyConnections.filter((connection) =>
        connection.connectorId !== connectorId && connection.shaftId !== shaftId,
      ),
      maxDistanceMm: 10000,
      axisToleranceDeg: 7.5,
      lockPortOrientation: lockAxialStop,
      requiredShaftIds: lockAxialStop
        ? assemblyConnections.filter((connection) => connection.connectorId === connectorId && connection.behavior === "stop").map((connection) => connection.shaftId)
        : [],
    });
    if (!snap) {
      setAlignmentNotice(lang === "zh"
        ? "智能连接失败：当前姿态下无可用连接孔，请先调整组件方向"
        : "SMART CONNECT FAILED: NO COMPATIBLE PORT IN THE CURRENT POSE");
      return;
    }
    recordHistory("align");
    if (connectorIsMoving) {
      setTransforms((current) => {
        const snapped = transformAtWorldPoint(connectorId, snap.position, dimensions, addedParts, {
          ...connectorTransform,
          rotX: snap.rotation[0],
          rotY: snap.rotation[1],
          rotZ: snap.rotation[2],
        });
        const constrained = constrainPartTransformToContactSurfaces({
          id: connectorId,
          transform: snapped,
          dimensions,
          addedParts,
          transforms: current,
          deletedIds,
        });
        return { ...current, [connectorId]: constrained };
      });
    } else {
      const shaftTransform = getPartTransform(transforms, shaftId);
      const shaftCenter = shaft.start.map((value, index) => (value + shaft.end[index]) / 2) as Vec3Tuple;
      const retargetedShaft = retargetMovingPartForFixedAnchor({
        fixedAnchor: {
          position: getPartWorldPosition(connectorId, dimensions, addedParts, transforms),
          rotation: [connectorTransform.rotX, connectorTransform.rotY, connectorTransform.rotZ],
        },
        solvedAnchor: {
          position: snap.position,
          rotation: snap.rotation,
        },
        movingPart: {
          position: shaftCenter,
          rotation: [shaftTransform.rotX, shaftTransform.rotY, shaftTransform.rotZ],
        },
      });
      setTransforms((current) => ({
        ...current,
        [shaftId]: transformAtWorldPoint(shaftId, retargetedShaft.position, dimensions, addedParts, {
          ...shaftTransform,
          rotX: retargetedShaft.rotation[0],
          rotY: retargetedShaft.rotation[1],
          rotZ: retargetedShaft.rotation[2],
        }),
      }));
    }
    setAssemblyConnections((current) => [
      ...current.filter((connection) =>
        connection.connectorId !== movingId && connection.shaftId !== movingId,
      ),
      ...snap.connections,
    ]);
    setPreciseAssemblyRelations((current) => {
      const invalidated = current.map((relation) =>
        relation.fixedPartId === movingId || relation.movingPartId === movingId
          ? {
              ...relation,
              status: "invalid" as const,
              message: lang === "zh" ? "组件位置已改变，需要重新求解" : "PART MOVED; RELATION REQUIRES RESOLVE",
            }
          : relation);
      return snap.connections.reduce((relations, connection, index) => replacePairRelation(
        relations,
        createShaftBoreRelation({
          id: `REL-SHAFT-${connection.connectorId}-${connection.portId}-${connection.shaftId}`,
          fixedPartId: anchorId,
          movingPartId: movingId,
          connectorId: connection.connectorId,
          portId: connection.portId,
          shaftId: connection.shaftId,
          residualMm: 0,
          axialReference: "preserve",
          axialOffsetMm: Math.round(connection.positionOnShaft * 1000) / 10,
        }),
      ), invalidated);
    });
    setAlignmentNotice(lang === "zh"
      ? `已保持 ${anchorId} 不动，并调整 ${movingId}，建立 ${snap.connections.length} 个连接`
      : `KEPT ${anchorId} FIXED AND ADJUSTED ${movingId} · ${snap.connections.length} CONNECTIONS`);
  };
  const beginShaftLengthEdit = useCallback((id: string) => {
    recordHistory("transform-part");
    setAssemblyConnections((current) => current.filter((connection) =>
      connection.connectorId !== id && connection.shaftId !== id,
    ));
  }, [recordHistory]);
  const previewShaftLength = useCallback<ShaftLengthPreviewHandler>((id, next) => {
    setTransforms((current) => ({
      ...current,
      [id]: next,
    }));
  }, []);
  const beginPanelEdgeEdit = useCallback((id: string) => {
    recordHistory("transform-part");
    setAssemblyConnections((current) => current.filter((connection) =>
      connection.connectorId !== id && connection.shaftId !== id,
    ));
  }, [recordHistory]);
  const previewPanelEdge = useCallback<PanelEdgePreviewHandler>((id, next) => {
    setTransforms((current) => ({
      ...current,
      [id]: next,
    }));
    setPanelCutouts((current) => current[id]?.length ? ({
      ...current,
      [id]: normalizePanelCutouts(current[id], {
        widthMm: next.sizeX,
        lengthMm: next.sizeZ,
        thicknessMm: next.sizeY,
      }),
    }) : current);
  }, []);
  const updateSelectedMaterial = (material: PartMaterial) => {
    recordHistory("change-parameter");
    setMaterials((current) => ({
      ...current,
      ...Object.fromEntries(selectedIds.map((id) => [id, material])),
    }));
  };
  const removePreciseAssemblyRelation = (relationId: string) => {
    if (!preciseAssemblyRelations.some(({ id }) => id === relationId)) return;
    recordHistory("edit");
    setPreciseAssemblyRelations((current) => current.filter(({ id }) => id !== relationId));
    setAlignmentNotice(lang === "zh" ? "装配关系已解除" : "ASSEMBLY RELATION REMOVED");
  };
  const updatePreciseAssemblyRelation = (
    relationId: string,
    patch: Partial<Pick<PreciseAssemblyRelation, "gapMm" | "axialReference" | "axialOffsetMm">>,
  ) => {
    const relation = preciseAssemblyRelations.find(({ id }) => id === relationId);
    if (!relation) return;
    if (relation.type !== "shaft-bore") {
      const nextGap = Math.max(0, patch.gapMm ?? relation.gapMm ?? 0);
      const fixed = buildPreciseBoxPart({ id: relation.fixedPartId, dimensions, addedParts, transforms });
      const moving = buildPreciseBoxPart({ id: relation.movingPartId, dimensions, addedParts, transforms });
      if (!fixed || !moving) return;
      const solved = solveSurfaceRelation({
        fixed,
        moving,
        gapMm: nextGap,
        fixedFeatureId: relation.fixedFeatureId,
        movingFeatureId: relation.movingFeatureId,
      });
      if (!solved.ok) {
        setAlignmentNotice(preciseRelationFailureMessage(solved.reason, lang));
        return;
      }
      recordHistory("change-parameter");
      const movingTransform = getPartTransform(transforms, relation.movingPartId);
      setTransforms((current) => ({
        ...current,
        [relation.movingPartId]: transformAtWorldPoint(
          relation.movingPartId,
          addVec3(moving.center, solved.candidate.translation),
          dimensions,
          addedParts,
          movingTransform,
        ),
      }));
      setPreciseAssemblyRelations((current) => current.map((candidate) => candidate.id === relationId
        ? {
            ...candidate,
            type: nextGap === 0 ? "surface-contact" : "surface-gap",
            gapMm: nextGap,
            status: "valid",
            residualMm: 0,
            message: undefined,
          }
        : candidate));
      return;
    }

    const endpointKinds = [relation.fixedPartId, relation.movingPartId].map((id) => ({
      id,
      kind: getPartInfo(id, lang, resolvedRiskIds, addedParts).kind,
    }));
    const shaftId = endpointKinds.find(({ kind }) => kind === "rod")?.id;
    const connectorId = endpointKinds.find(({ kind }) => kind !== "rod")?.id;
    const portId = relation.fixedFeatureId === "shaft-axis" ? relation.movingFeatureId : relation.fixedFeatureId;
    const connection = assemblyConnections.find((candidate) =>
      candidate.shaftId === shaftId && candidate.connectorId === connectorId && candidate.portId === portId);
    const shaft = shaftId
      ? buildVisibleShaftSegments({ dimensions, addedParts, transforms, deletedIds, hiddenIds, isolatedIds })
          .find(({ partId }) => partId === shaftId)
      : null;
    if (!shaftId || !connectorId || !connection || !shaft) {
      setAlignmentNotice(lang === "zh" ? "无法更新轴向位置：原孔轴连接已失效" : "CANNOT UPDATE AXIAL POSITION: SHAFT-BORE LINK IS INVALID");
      return;
    }
    const reference = patch.axialReference ?? relation.axialReference ?? "preserve";
    const offsetMm = Math.max(0, patch.axialOffsetMm ?? relation.axialOffsetMm ?? 0);
    const shaftStart = new THREE.Vector3(...shaft.start);
    const shaftEnd = new THREE.Vector3(...shaft.end);
    const shaftVector = shaftEnd.clone().sub(shaftStart);
    const shaftLengthScene = shaftVector.length();
    const shaftLengthMm = shaftLengthScene / mmToScene(1);
    const desiredT = reference === "shaft-center"
      ? 0.5
      : reference === "shaft-start"
        ? THREE.MathUtils.clamp(offsetMm / Math.max(shaftLengthMm, 0.1), 0, 1)
        : reference === "shaft-end"
          ? THREE.MathUtils.clamp(1 - offsetMm / Math.max(shaftLengthMm, 0.1), 0, 1)
          : connection.positionOnShaft;
    const deltaScene = (desiredT - connection.positionOnShaft) * shaftLengthScene;
    const shaftAxis = shaftVector.normalize();
    const movingDirection = relation.movingPartId === shaftId ? -deltaScene : deltaScene;
    const movingWorld = new THREE.Vector3(...getPartWorldPosition(relation.movingPartId, dimensions, addedParts, transforms))
      .addScaledVector(shaftAxis, movingDirection)
      .toArray() as Vec3Tuple;
    const movingTransform = getPartTransform(transforms, relation.movingPartId);
    recordHistory("change-parameter");
    setTransforms((current) => ({
      ...current,
      [relation.movingPartId]: transformAtWorldPoint(
        relation.movingPartId,
        movingWorld,
        dimensions,
        addedParts,
        movingTransform,
      ),
    }));
    setAssemblyConnections((current) => current.map((candidate) => candidate === connection
      ? { ...candidate, positionOnShaft: desiredT }
      : candidate));
    setPreciseAssemblyRelations((current) => current.map((candidate) => candidate.id === relationId
      ? {
          ...candidate,
          axialReference: reference,
          axialOffsetMm: offsetMm,
          status: "valid",
          residualMm: 0,
          message: undefined,
        }
      : candidate));
  };
  const addSelectedPanelCutout = () => {
    if (!canDrillSelectedPanel) return;
    recordHistory("change-parameter");
    const nextCutout = createCenteredPanelCutout(
      `${selectedId}-HOLE-${Date.now()}`,
      selectedPanelDimensions,
      10,
    );
    setPanelCutouts((current) => ({
      ...current,
      [selectedId]: [...normalizePanelCutouts(current[selectedId], selectedPanelDimensions), nextCutout],
    }));
  };
  const updateSelectedPanelCutout = (cutoutId: string, patch: Partial<Omit<PanelCutout, "id">>) => {
    if (!canDrillSelectedPanel) return;
    recordHistory("change-parameter");
    setPanelCutouts((current) => ({
      ...current,
      [selectedId]: normalizePanelCutouts(current[selectedId], selectedPanelDimensions).map((cutout) =>
        cutout.id === cutoutId ? normalizePanelCutout({ ...cutout, ...patch }, selectedPanelDimensions) : cutout,
      ),
    }));
  };
  const removeSelectedPanelCutout = (cutoutId: string) => {
    if (!canDrillSelectedPanel) return;
    recordHistory("change-parameter");
    setPanelCutouts((current) => ({
      ...current,
      [selectedId]: normalizePanelCutouts(current[selectedId], selectedPanelDimensions).filter(({ id }) => id !== cutoutId),
    }));
  };
  const getResetTransform = (id: string): PartTransform => {
    const base = getDefaultTransform(id);
    if (!id.startsWith("P-")) return { ...base };
    return {
      ...base,
      sizeX: Math.max(100, dimensions.width - 20),
      sizeZ: Math.max(100, dimensions.depth - 15),
    };
  };
  const resetPartTransform = (id: string, withHistory = true) => {
    if (withHistory) recordHistory("transform-part");
    const resetTransform = getResetTransform(id);
    setTransforms((current) => ({
      ...current,
      [id]: resetTransform,
    }));
    setPanelCutouts((current) => current[id]?.length ? ({
      ...current,
      [id]: normalizePanelCutouts(current[id], {
        widthMm: resetTransform.sizeX,
        lengthMm: resetTransform.sizeZ,
        thicknessMm: resetTransform.sizeY,
      }),
    }) : current);
    setAssemblyConnections((current) => current.filter((connection) => connection.connectorId !== id && connection.shaftId !== id));
  };
  const quickFixPart = (id: string) => {
    const part = getPartInfo(id, lang, resolvedRiskIds, addedParts);
    if (!part.warning) return;
    recordHistory("auto-fix");
    resetPartTransform(id, false);
    setResolvedRiskIds((current) => new Set(current).add(id));
  };
  const nextPartId = (kind: PartKind, workingIds: string[]) => {
    const prefix = kind === "rod" ? "R" : kind === "panel" ? "P" : "J";
    const nextNumber = Math.max(0, ...workingIds.filter((id) => id.startsWith(`${prefix}-`)).map((id) => Number(id.slice(2)))) + 1;
    return `${prefix}-${String(nextNumber).padStart(3, "0")}`;
  };
  const addPart = (kind: PartKind, libraryPart?: LibraryPart, placement?: SmartPlacement, shaftOrientation?: ShaftPlacementOrientation) => {
    recordHistory("add-part");
    const id = nextPartId(kind, availablePartIds);
    const addedPart = { id, kind, libraryPart } satisfies AddedPart;
    const nextAddedParts = [...addedParts, addedPart];
    setAddedParts(nextAddedParts);
    if (kind === "panel") {
      const initialMaterial = libraryPart?.defaultPanelMaterial ?? (libraryPart ? inferPanelMaterial(libraryPart) : "acrylic");
      setMaterials((current) => ({ ...current, [id]: initialMaterial }));
    }
    setDeletedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    const anchorId = placement?.anchorId ?? selectedId;
    const anchor = getPartTransform(transforms, anchorId);
    const resetTransform = getResetTransform(id);
    const nextTransform = libraryPart && kind !== "rod" ? {
      ...resetTransform,
      sizeX: libraryPart.dimensions.width,
      sizeY: libraryPart.dimensions.height,
      sizeZ: libraryPart.dimensions.length,
    } : libraryPart?.shaftParameters ? {
      ...resetTransform,
      sizeY: libraryPart.shaftParameters.diameter,
      sizeZ: libraryPart.shaftParameters.diameter,
    } : resetTransform;
    const requestedShaftRotation = kind === "rod" && shaftOrientation
      ? shaftPlacementRotation(shaftOrientation)
      : null;
    const orientedTransform = {
      ...nextTransform,
      rotX: requestedShaftRotation?.rotX ?? (kind === "panel" ? 0 : anchor.rotX),
      rotY: requestedShaftRotation?.rotY ?? anchor.rotY,
      rotZ: requestedShaftRotation?.rotZ ?? (kind === "panel" ? 0 : anchor.rotZ),
    };
    const hasVisibleAnchor = selectedIds.includes(anchorId) && !deletedIds.has(anchorId);
    const anchorWorld = hasVisibleAnchor
      ? getPartWorldPosition(anchorId, dimensions, addedParts, transforms)
      : [0, mmToScene(dimensions.height) / 2, 0] satisfies Vec3Tuple;
    const placedTransform = placement
      ? transformAtWorldPoint(
          id,
          kind === "panel"
            ? addVec3(placement.worldPoint, [0, mmToScene(orientedTransform.sizeY) / 2, 0])
            : placement.worldPoint,
          dimensions,
          nextAddedParts,
          orientedTransform,
        )
      : transformAtWorldPoint(
          id,
          kind === "panel"
            ? [0, anchorWorld[1] + 0.3, 0]
            : addVec3(anchorWorld, kind === "rod" ? [1, 0, 0] : [0, 0, 0.5]),
          dimensions,
          nextAddedParts,
          orientedTransform,
        );
    const constrainedTransform = constrainPartTransformToContactSurfaces({
      id,
      transform: placedTransform,
      dimensions,
      addedParts: nextAddedParts,
      transforms,
      deletedIds,
    });
    setTransforms((current) => ({ ...current, [id]: constrainedTransform }));
    setSelectedId(id);
    setSelectedIds([id]);
    setPartPickerOpen(false);
  };
  const openPartPicker = (placement?: SmartPlacement) => {
    setPartPickerPlacement(placement ?? null);
    setPartPickerOpen(true);
  };
  const closePartPicker = () => {
    setPartPickerOpen(false);
    setPartPickerPlacement(null);
  };
  const addLibraryPart = (part: LibraryPart, orientation?: ShaftPlacementOrientation) => {
    addPart(part.kind, part, partPickerPlacement ?? undefined, orientation);
    setPartPickerPlacement(null);
  };
  const smartAlignAddedParts = () => {
    const eligibleIds = addedParts
      .map(({ id }) => id)
      .filter((id) => !deletedIds.has(id) && !hiddenIds.has(id) && !lockedIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id)));
    const targetIds = eligibleIds;
    if (targetIds.length === 0) {
      setAlignmentNotice(lang === "zh" ? "没有可整理的已添加零件" : "NO ADDED PARTS TO ALIGN");
      return;
    }
    const targetSet = new Set(targetIds);
    const currentSegments = buildVisibleShaftSegments({ dimensions, addedParts, transforms, deletedIds, hiddenIds, isolatedIds });
    const segmentById = new Map(currentSegments.map((segment) => [segment.partId, segment]));
    const visibleIds = availablePartIds.filter((id) =>
      !deletedIds.has(id) && !hiddenIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id)),
    );
    const toMmPoint = (point: Vec3Tuple): Vec3Tuple => point.map((value) => Math.round(value * 1000) / 10) as Vec3Tuple;
    const smartParts: SmartAlignPart[] = visibleIds.map((id) => {
      const addedPart = addedParts.find((part) => part.id === id);
      const kind = addedPart?.kind ?? (id.startsWith("R-") ? "rod" : id.startsWith("P-") ? "panel" : "joint");
      const transform = getPartTransform(transforms, id);
      const segment = segmentById.get(id);
      return {
        id,
        kind,
        positionMm: toMmPoint(getPartWorldPosition(id, dimensions, addedParts, transforms)),
        rotationDeg: [transform.rotX, transform.rotY, transform.rotZ],
        movable: targetSet.has(id),
        axis: segment ? shaftSegmentAxis(segment) : undefined,
        localAxis: kind === "rod" ? (addedPart?.libraryPart ? "z" : "x") : undefined,
        lengthMm: segment ? Math.hypot(
          segment.end[0] - segment.start[0],
          segment.end[1] - segment.start[1],
          segment.end[2] - segment.start[2],
        ) * 100 : undefined,
        thicknessMm: kind === "panel" ? transform.sizeY * Math.abs(transform.scaleY) : undefined,
        usageTags: normalizeUsageTags(kind, addedPart?.libraryPart?.usageTags),
      } satisfies SmartAlignPart;
    });
    const plan = planSmartRackAlignment({ parts: smartParts, frame: dimensions });
    if (plan.placements.length === 0 || plan.movedCount === 0) {
      if (structuralAnalysis.errorCount > 0) {
        const issue = structuralAnalysis.issues.find(({ severity }) => severity === "error");
        setAlignmentNotice(lang === "zh"
          ? `智能对齐未应用：${issue?.messageZh ?? "当前零件不足以形成稳定连接与支撑"}`
          : `SMART ALIGN NOT APPLIED: ${issue?.messageEn ?? "THE CURRENT PARTS CANNOT FORM A STABLE CONNECTION AND SUPPORT PATH"}`);
        return;
      }
      setAlignmentNotice(lang === "zh" ? "零件已处于合理的连接与支撑位置" : "PARTS ALREADY HAVE VALID CONNECTIONS AND SUPPORTS");
      return;
    }

    let nextTransforms = { ...transforms };
    plan.placements.forEach((placement) => {
      const before = getPartTransform(nextTransforms, placement.id);
      nextTransforms[placement.id] = transformAtWorldPoint(
        placement.id,
        placement.positionMm.map(mmToScene) as Vec3Tuple,
        dimensions,
        addedParts,
        {
          ...before,
          rotX: placement.rotationDeg[0],
          rotY: placement.rotationDeg[1],
          rotZ: placement.rotationDeg[2],
        },
      );
    });
    plan.placements.forEach(({ id }) => {
      const part = addedParts.find((candidate) => candidate.id === id);
      if (!part || part.kind === "rod") return;
      nextTransforms[id] = constrainPartTransformToContactSurfaces({
        id,
        transform: getPartTransform(nextTransforms, id),
        dimensions,
        addedParts,
        transforms: nextTransforms,
        deletedIds,
      });
    });

    const nextSegments = buildVisibleShaftSegments({ dimensions, addedParts, transforms: nextTransforms, deletedIds, hiddenIds, isolatedIds });
    const nextConnections = assemblyConnections.filter((connection) =>
      !targetSet.has(connection.connectorId) && !targetSet.has(connection.shaftId),
    );
    plan.placements.filter(({ id }) => addedParts.find((part) => part.id === id)?.kind === "joint").forEach(({ id }) => {
      const part = addedParts.find((candidate) => candidate.id === id);
      const ports = part?.libraryPart ? fittedComponentPorts(part.libraryPart) : fittedComponentPorts(defaultCrossConnectorPart);
      const transform = getPartTransform(nextTransforms, id);
      const lockAxialStop = ports.some((port) => isShaftAssemblyPort(port) && port.behavior === "stop");
      const snap = findBestSmartSnap({
        connectorId: id,
        proposedPosition: getPartWorldPosition(id, dimensions, addedParts, nextTransforms),
        proposedRotation: [transform.rotX, transform.rotY, transform.rotZ],
        ports,
        shafts: nextSegments,
        occupiedConnections: nextConnections,
        maxDistanceMm: 120,
        lockPortOrientation: lockAxialStop,
        requiredShaftIds: lockAxialStop
          ? assemblyConnections.filter((connection) => connection.connectorId === id && connection.behavior === "stop").map((connection) => connection.shaftId)
          : [],
      });
      if (!snap) return;
      nextTransforms = {
        ...nextTransforms,
        [id]: transformAtWorldPoint(id, snap.position, dimensions, addedParts, {
          ...transform,
          rotX: snap.rotation[0],
          rotY: snap.rotation[1],
          rotZ: snap.rotation[2],
        }),
      };
      nextConnections.push(...snap.connections);
    });

    const proposedStructuralModel = calculateStructuralModel({
      dimensions,
      addedParts,
      transforms: nextTransforms,
      materials,
      deletedIds,
      assemblyConnections: nextConnections,
    });
    const proposedAnalysis = analyzeStructure(proposedStructuralModel);
    if (proposedAnalysis.errorCount > 0) {
      const issue = proposedAnalysis.issues.find(({ severity }) => severity === "error");
      setAlignmentNotice(lang === "zh"
        ? `智能对齐未应用：${issue?.messageZh ?? "当前零件不足以形成稳定连接与支撑"}`
        : `SMART ALIGN NOT APPLIED: ${issue?.messageEn ?? "THE CURRENT PARTS CANNOT FORM A STABLE CONNECTION AND SUPPORT PATH"}`);
      return;
    }

    recordHistory("align");
    setTransforms(nextTransforms);
    setAssemblyConnections(nextConnections);
    const establishedConnections = nextConnections.length - assemblyConnections.filter((connection) =>
      !targetSet.has(connection.connectorId) && !targetSet.has(connection.shaftId),
    ).length;
    setAlignmentNotice(lang === "zh"
      ? `已智能整理 ${plan.movedCount} 个零件${establishedConnections > 0 ? `，建立 ${establishedConnections} 个连接` : ""}`
      : `ALIGNED ${plan.movedCount} PART${plan.movedCount === 1 ? "" : "S"}${establishedConnections > 0 ? ` · ${establishedConnections} CONNECTIONS` : ""}`);
  };
  const copySelectionToClipboard = () => {
    const copyableIds = selectedIds.filter((id) => availablePartIds.includes(id) && !deletedIds.has(id));
    if (copyableIds.length === 0) return;
    const items = copyableIds.map((id) => {
      const addedPart = addedParts.find((part) => part.id === id);
      const transform = transforms[id] ?? (id.startsWith("P-") && allPartIds.includes(id)
        ? {
            ...getDefaultTransform(id),
            sizeX: Math.max(100, dimensions.width - 20),
            sizeZ: Math.max(100, dimensions.depth - 15),
          }
        : getPartTransform(transforms, id));
      return {
        sourceId: id,
        kind: getPartInfo(id, lang, resolvedRiskIds, addedParts).kind,
        libraryPart: addedPart?.libraryPart,
        transform: { ...transform },
        material: getPartMaterial(materials, id),
        panelCutouts: panelCutouts[id]?.map((cutout) => ({ ...cutout })),
        worldPoint: [...getPartWorldPosition(id, dimensions, addedParts, transforms)] as Vec3Tuple,
      } satisfies PartClipboardItem;
    });
    setPartClipboard(items);
    clipboardPasteCount.current = 0;
    setClipboardNotice(lang === "zh" ? `已复制 ${items.length} 个组件` : `COPIED ${items.length} PART${items.length === 1 ? "" : "S"}`);
  };
  const pasteFromClipboard = () => {
    if (partClipboard.length === 0) return;
    recordHistory("paste");
    const pasteIndex = clipboardPasteCount.current + 1;
    const offset = 0.5 * pasteIndex;
    const workingIds = [...availablePartIds];
    const nextAddedParts = [...addedParts];
    const pastedTransforms: Record<string, PartTransform> = {};
    const pastedMaterials: Record<string, PartMaterial> = {};
    const pastedPanelCutouts: Record<string, PanelCutout[]> = {};
    const pastedIds: string[] = [];
    partClipboard.forEach((item) => {
      const id = nextPartId(item.kind, workingIds);
      workingIds.push(id);
      nextAddedParts.push({ id, kind: item.kind, libraryPart: item.libraryPart });
      pastedTransforms[id] = transformAtWorldPoint(
        id,
        addVec3(item.worldPoint, [offset, 0, offset]),
        dimensions,
        nextAddedParts,
        { ...item.transform },
      );
      pastedMaterials[id] = item.material;
      if (item.panelCutouts?.length) pastedPanelCutouts[id] = item.panelCutouts.map((cutout) => ({ ...cutout, id: `${id}-${cutout.id}` }));
      pastedIds.push(id);
    });
    setAddedParts(nextAddedParts);
    setTransforms((current) => ({ ...current, ...pastedTransforms }));
    setMaterials((current) => ({ ...current, ...pastedMaterials }));
    setPanelCutouts((current) => ({ ...current, ...pastedPanelCutouts }));
    clipboardPasteCount.current = pasteIndex;
    selectMany(pastedIds);
    setClipboardNotice(lang === "zh" ? `已粘贴 ${pastedIds.length} 个组件` : `PASTED ${pastedIds.length} PART${pastedIds.length === 1 ? "" : "S"}`);
  };
  const duplicateSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    recordHistory("duplicate");
    const workingIds = [...availablePartIds];
    const duplicates: AddedPart[] = [];
    const duplicateTransforms: Record<string, PartTransform> = {};
    const duplicateMaterials: Record<string, PartMaterial> = {};
    const duplicatePanelCutouts: Record<string, PanelCutout[]> = {};
    const duplicatePartIdMap: Record<string, string> = {};
    selectedIds.forEach((sourceId) => {
      const sourceAddedPart = addedParts.find((part) => part.id === sourceId);
      const kind = getPartInfo(sourceId, lang, resolvedRiskIds, addedParts).kind;
      const id = nextPartId(kind, workingIds);
      workingIds.push(id);
      duplicatePartIdMap[sourceId] = id;
      const duplicate = { id, kind, libraryPart: sourceAddedPart?.libraryPart } satisfies AddedPart;
      duplicates.push(duplicate);
      const sourceTransform = getPartTransform(transforms, sourceId);
      const sourceWorld = getPartWorldPosition(sourceId, dimensions, addedParts, transforms);
      duplicateTransforms[id] = transformAtWorldPoint(id, addVec3(sourceWorld, [0.5, 0, 0.5]), dimensions, [...addedParts, ...duplicates], sourceTransform);
      duplicateMaterials[id] = getPartMaterial(materials, sourceId);
      if (panelCutouts[sourceId]?.length) duplicatePanelCutouts[id] = panelCutouts[sourceId].map((cutout) => ({ ...cutout, id: `${id}-${cutout.id}` }));
    });
    setAddedParts((current) => [...current, ...duplicates]);
    setTransforms((current) => ({ ...current, ...duplicateTransforms }));
    setMaterials((current) => ({ ...current, ...duplicateMaterials }));
    setPanelCutouts((current) => ({ ...current, ...duplicatePanelCutouts }));
    setPreciseAssemblyRelations((current) => [
      ...current,
      ...copyPreciseRelationsForPartMap(
        current,
        duplicatePartIdMap,
        (sourceId) => `${sourceId}-copy-${Date.now()}`,
      ),
    ]);
    const duplicateIds = duplicates.map(({ id }) => id);
    if (activeUserGroup && duplicateIds.length >= 2) {
      setUserGroups((current) => [...current, {
        id: `G-${Date.now()}-${duplicateIds[0]}`,
        name: uniqueDerivedGroupName(current, activeUserGroup.name, lang === "zh" ? "副本" : "COPY"),
        partIds: duplicateIds,
      }]);
    }
    selectMany(duplicateIds);
  }, [activeUserGroup, addedParts, availablePartIds, dimensions, lang, materials, panelCutouts, recordHistory, resolvedRiskIds, selectMany, selectedIds, transforms]);

  const mirrorSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    recordHistory("mirror");
    const workingIds = [...availablePartIds];
    const workingAddedParts = [...addedParts];
    const duplicates: AddedPart[] = [];
    const duplicateTransforms: Record<string, PartTransform> = {};
    const duplicateMaterials: Record<string, PartMaterial> = {};
    const duplicatePanelCutouts: Record<string, PanelCutout[]> = {};
    const duplicatePartIdMap: Record<string, string> = {};
    selectedIds.forEach((sourceId) => {
      const sourceAddedPart = addedParts.find((part) => part.id === sourceId);
      const kind = getPartInfo(sourceId, lang, resolvedRiskIds, addedParts).kind;
      const id = nextPartId(kind, workingIds);
      workingIds.push(id);
      duplicatePartIdMap[sourceId] = id;
      const duplicate = { id, kind, libraryPart: sourceAddedPart?.libraryPart } satisfies AddedPart;
      duplicates.push(duplicate);
      workingAddedParts.push(duplicate);
      const sourceWorld = getPartWorldPosition(sourceId, dimensions, addedParts, transforms);
      const sourceTransform = getPartTransform(transforms, sourceId);
      const mirrored = mirrorDuplicatePlacement(sourceWorld, sourceTransform, mirrorAxis);
      duplicateTransforms[id] = transformAtWorldPoint(id, mirrored.worldPoint, dimensions, workingAddedParts, mirrored.transform);
      duplicateMaterials[id] = getPartMaterial(materials, sourceId);
      if (panelCutouts[sourceId]?.length) duplicatePanelCutouts[id] = panelCutouts[sourceId].map((cutout) => ({ ...cutout, id: `${id}-${cutout.id}` }));
    });
    setAddedParts(workingAddedParts);
    setTransforms((current) => ({ ...current, ...duplicateTransforms }));
    setMaterials((current) => ({ ...current, ...duplicateMaterials }));
    setPanelCutouts((current) => ({ ...current, ...duplicatePanelCutouts }));
    setPreciseAssemblyRelations((current) => [
      ...current,
      ...copyPreciseRelationsForPartMap(
        current,
        duplicatePartIdMap,
        (sourceId) => `${sourceId}-mirror-${Date.now()}`,
      ),
    ]);
    const duplicateIds = duplicates.map(({ id }) => id);
    if (activeUserGroup && duplicateIds.length >= 2) {
      setUserGroups((current) => [...current, {
        id: `G-${Date.now()}-${duplicateIds[0]}`,
        name: uniqueDerivedGroupName(current, activeUserGroup.name, lang === "zh" ? "镜像" : "MIRROR"),
        partIds: duplicateIds,
      }]);
    }
    selectMany(duplicateIds);
  }, [activeUserGroup, addedParts, availablePartIds, dimensions, lang, materials, mirrorAxis, panelCutouts, recordHistory, resolvedRiskIds, selectMany, selectedIds, transforms]);

  const flipSelection = useCallback((direction: FlipDirection) => {
    const flippableIds = selectedIds.filter((id) => !deletedIds.has(id));
    if (flippableIds.length === 0) return;
    recordHistory("flip");
    setTransforms((current) => ({
      ...current,
      ...Object.fromEntries(flippableIds.map((id) => [
        id,
        flipPartTransform(getPartTransform(current, id), direction, mirrorAxis),
      ])),
    }));
    const flippedSet = new Set(flippableIds);
    setAssemblyConnections((current) => current.filter((connection) =>
      !flippedSet.has(connection.connectorId) && !flippedSet.has(connection.shaftId),
    ));
  }, [deletedIds, mirrorAxis, recordHistory, selectedIds]);

  const rotateSelection = useCallback((axis: QuickRotateAxis, direction: QuickRotateDirection) => {
    const rotatableIds = selectedIds.filter((id) => !deletedIds.has(id));
    if (rotatableIds.length === 0) return;
    if (activeUserGroupPartIds.length >= 2) {
      const memberPositions = Object.fromEntries(activeUserGroupPartIds.map((id) => [
        id,
        getPartWorldPosition(id, dimensions, addedParts, transforms),
      ])) as Record<string, Vec3Tuple>;
      const memberTransforms = Object.fromEntries(activeUserGroupPartIds.map((id) => [
        id,
        getPartTransform(transforms, id),
      ])) as Record<string, PartTransform>;
      const rotation: Vec3Tuple = [0, 0, 0];
      rotation[axis === "x" ? 0 : axis === "y" ? 1 : 2] = direction === "cw" ? 90 : -90;
      const pivot = calculateGroupPivot(Object.values(memberPositions));
      const nextTransforms = Object.fromEntries(transformGroupMembers({
        pivot,
        controlPosition: pivot,
        controlRotation: rotation,
        controlScale: [1, 1, 1],
        memberIds: activeUserGroupPartIds,
        memberPositions,
        memberTransforms,
      }).map(({ id, position, transform }) => [
        id,
        transformAtWorldPoint(id, position, dimensions, addedParts, transform),
      ])) as Record<string, PartTransform>;
      updateGroupTransforms(nextTransforms);
      return;
    }
    recordHistory("rotate");
    setTransforms((current) => ({
      ...current,
      ...Object.fromEntries(rotatableIds.map((id) => [
        id,
        rotatePartTransform90(getPartTransform(current, id), axis, direction),
      ])),
    }));
    const rotatedSet = new Set(rotatableIds);
    setAssemblyConnections((current) => current.filter((connection) =>
      !rotatedSet.has(connection.connectorId) && !rotatedSet.has(connection.shaftId),
    ));
  }, [activeUserGroupPartIds, addedParts, deletedIds, dimensions, recordHistory, selectedIds, transforms]);

  const duplicateForModifierDrag = useCallback((sourceId: string) => {
    if (deletedIds.has(sourceId)) return;
    recordHistory("duplicate");
    const sourceAddedPart = addedParts.find((part) => part.id === sourceId);
    const kind = getPartInfo(sourceId, lang, resolvedRiskIds, addedParts).kind;
    const id = nextPartId(kind, availablePartIds);
    const duplicate = { id, kind, libraryPart: sourceAddedPart?.libraryPart } satisfies AddedPart;
    const nextAddedParts = [...addedParts, duplicate];
    const sourceWorld = getPartWorldPosition(sourceId, dimensions, addedParts, transforms);
    const duplicateTransform = transformAtWorldPoint(id, sourceWorld, dimensions, nextAddedParts, getPartTransform(transforms, sourceId));
    setAddedParts(nextAddedParts);
    setTransforms((current) => ({ ...current, [id]: duplicateTransform }));
    setMaterials((current) => ({ ...current, [id]: getPartMaterial(materials, sourceId) }));
    if (panelCutouts[sourceId]?.length) {
      setPanelCutouts((current) => ({
        ...current,
        [id]: panelCutouts[sourceId].map((cutout) => ({ ...cutout, id: `${id}-${cutout.id}` })),
      }));
    }
  }, [addedParts, availablePartIds, deletedIds, dimensions, lang, materials, panelCutouts, recordHistory, resolvedRiskIds, transforms]);

  const deleteParts = (ids: string[]) => {
    if (ids.length === 0) return;
    recordHistory("delete-part");
    const idSet = new Set(ids.filter((id) => availablePartIds.includes(id) && !deletedIds.has(id)));
    if (idSet.size === 0) {
      setPendingDeleteIds([]);
      return;
    }
    const remainingIds = availablePartIds.filter((candidate) => !deletedIds.has(candidate) && !idSet.has(candidate));
    setDeletedIds((current) => new Set([...current, ...idSet]));
    setUserGroups((current) => current
      .map((group) => ({ ...group, partIds: group.partIds.filter((id) => !idSet.has(id)) }))
      .filter((group) => group.partIds.length > 0));
    setHiddenIds((current) => new Set([...current].filter((id) => !idSet.has(id))));
    setLockedIds((current) => new Set([...current].filter((id) => !idSet.has(id))));
    setIsolatedIds((current) => new Set([...current].filter((id) => !idSet.has(id))));
    setAssemblyConnections((current) => current.filter((connection) =>
      !idSet.has(connection.connectorId) && !idSet.has(connection.shaftId),
    ));
    setPreciseAssemblyRelations((current) => current.filter((relation) =>
      !idSet.has(relation.fixedPartId) && !idSet.has(relation.movingPartId),
    ));
    setPanelCutouts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !idSet.has(id))));
    setPendingDeleteIds([]);
    selectMany(remainingIds.length > 0 ? [remainingIds[0]] : []);
  };
  const requestDeletePart = (id: string) => {
    selectMany([id]);
    setPendingDeleteIds([id]);
  };
  const groupSelection = () => {
    if (selectedIds.length < 2) return;
    recordHistory("organize");
    const selectedSet = new Set(selectedIds);
    setUserGroups((current) => {
      const remainingGroups = current
        .map((group) => ({ ...group, partIds: group.partIds.filter((id) => !selectedSet.has(id)) }))
        .filter((group) => group.partIds.length >= 2);
      return [...remainingGroups, {
        id: `G-${Date.now()}`,
        name: `${lang === "zh" ? "编组" : "GROUP"} ${remainingGroups.length + 1}`,
        partIds: [...selectedIds],
      }];
    });
  };
  const ungroup = (groupId: string) => {
    recordHistory("organize");
    setUserGroups((current) => current.filter((group) => group.id !== groupId));
  };
  const renameGroup = (groupId: string, name: string) => {
    const trimmedName = name.trim();
    const group = userGroups.find((candidate) => candidate.id === groupId);
    if (!group || !trimmedName || group.name === trimmedName) return;
    recordHistory("organize");
    setUserGroups((current) => current.map((candidate) => (
      candidate.id === groupId ? { ...candidate, name: trimmedName } : candidate
    )));
    setSaveStatus("unsaved");
  };
  const toggleHidden = () => {
    recordHistory("organize");
    const willHide = !selectedIds.every((id) => hiddenIds.has(id));
    if (willHide) {
      setIsolatedIds((current) => {
        const remaining = [...current].filter((id) => !selectedIds.includes(id));
        return new Set(remaining);
      });
    }
    setHiddenIds((current) => {
      const next = new Set(current);
      const reveal = selectedIds.every((id) => next.has(id));
      selectedIds.forEach((id) => reveal ? next.delete(id) : next.add(id));
      return next;
    });
  };
  const toggleLocked = () => {
    recordHistory("organize");
    setLockedIds((current) => {
      const next = new Set(current);
      const unlock = selectedIds.every((id) => next.has(id));
      selectedIds.forEach((id) => unlock ? next.delete(id) : next.add(id));
      return next;
    });
  };
  const toggleIsolation = () => {
    recordHistory("organize");
    setIsolatedIds((current) => current.size > 0 ? new Set() : new Set(selectedIds));
  };
  const showAllParts = () => {
    if (hiddenIds.size === 0 && isolatedIds.size === 0) return;
    recordHistory("organize");
    setHiddenIds(new Set());
    setIsolatedIds(new Set());
  };
  const uploadBackground = (file: File) => {
    setCustomBackgroundUrl(URL.createObjectURL(file));
    setBackground("custom");
  };
  const uploadReferenceImage = async (file: File) => {
    const dataUrl = await prepareReferenceImage(file);
    recordHistory("edit");
    setReferenceImageDataUrl(dataUrl);
    setReferenceImageVisible(true);
  };
  const changeReferenceImageVisibility = (visible: boolean) => {
    if (!referenceImageDataUrl || visible === referenceImageVisible) return;
    recordHistory("edit");
    setReferenceImageVisible(visible);
  };
  const clearReferenceImage = () => {
    if (!referenceImageDataUrl) return;
    recordHistory("edit");
    setReferenceImageDataUrl(null);
    setReferenceImageVisible(false);
  };

  const exportOrder = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { downloadOrderWorkbook } = await import("../features/export/downloadOrderWorkbookInWorker");
      await downloadOrderWorkbook(orderInput);
    } finally {
      setExporting(false);
    }
  }, [exporting, orderInput]);

  useEffect(
    () => () => {
      if (customBackgroundUrl) URL.revokeObjectURL(customBackgroundUrl);
    },
    [customBackgroundUrl],
  );

  useEffect(() => {
    if (!clipboardNotice) return;
    const timeout = window.setTimeout(() => setClipboardNotice(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [clipboardNotice]);

  useEffect(() => {
    if (!templateNotice) return;
    const timeout = window.setTimeout(() => setTemplateNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [templateNotice]);

  useEffect(() => {
    if (!alignmentNotice) return;
    const timeout = window.setTimeout(() => setAlignmentNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [alignmentNotice]);

  useEffect(() => {
    const handleEditorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (helpDialogOpen) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "a") {
        if (
          activePage !== "design" ||
          partPickerOpen ||
          templatePickerOpen ||
          saveDialogOpen ||
          pendingDeleteIds.length > 0
        ) return;
        event.preventDefault();
        selectAllVisible();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "s") {
        event.preventDefault();
        requestSaveProject();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "c") {
        event.preventDefault();
        copySelectionToClipboard();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "v") {
        event.preventDefault();
        pasteFromClipboard();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && (key === "d" || key === "g")) {
        event.preventDefault();
        if (key === "d") duplicateSelection(); else groupSelection();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (selectedIds.length > 0) setPendingDeleteIds(selectedIds);
      }
      if (key === "d") duplicateSelection();
      if (key === "h") toggleHidden();
      if (key === "l") toggleLocked();
      if (key === "f") setFocusRequest((current) => current + 1);
      if (event.key === "Escape" && isolatedIds.size > 0) toggleIsolation();
    };
    window.addEventListener("keydown", handleEditorShortcut);
    return () => window.removeEventListener("keydown", handleEditorShortcut);
  }, [activePage, copySelectionToClipboard, duplicateSelection, helpDialogOpen, isolatedIds.size, partPickerOpen, pasteFromClipboard, pendingDeleteIds.length, redo, requestSaveProject, saveDialogOpen, selectAllVisible, selectedIds, templatePickerOpen, undo]);

  return (
    <div className={`app-shell ${partPickerOpen || templatePickerOpen || saveDialogOpen || helpDialogOpen || pendingDeleteIds.length > 0 ? "modal-open" : ""}`}>
      <AppNav
        lang={lang}
        activePage={activePage}
        onNavigate={setActivePage}
        onOpenTemplates={openTemplateCreator}
      />
      {activePage === "projects" ? (
        <ProjectsPage
          lang={lang}
          projects={savedProjects}
          onOpen={openSavedProject}
          onDelete={deleteSavedProject}
          onCreate={openTemplateCreator}
          onExportBackup={exportProjectBackup}
          onImportBackup={importProjectBackup}
          onBack={() => setActivePage("design")}
        />
      ) : activePage === "parts" ? (
        <ComponentLibraryPage
          lang={lang}
          theme={theme}
          parts={libraryParts}
          onPartsChange={setLibraryParts}
          onBackToDesign={() => setActivePage("design")}
          onUsePart={(part) => { addLibraryPart(part); setActivePage("design"); }}
          onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        />
      ) : activePage === "bom" ? (
        <BomPage
          lang={lang}
          input={orderInput}
          issueCount={structuralAnalysis.issues.length}
          focusPartIds={bomFocusIds}
          exporting={exporting}
          onExport={exportOrder}
          onBack={() => setActivePage("design")}
          onLocate={(partIds) => {
            selectMany(partIds);
            setBomFocusIds([]);
            setSidePanelTab("structure");
            setActivePage("design");
            setFocusRequest((current) => current + 1);
          }}
        />
      ) : (
      <div className="workspace">
        <TopBar
          lang={lang}
          theme={theme}
          projectName={currentProjectName}
          dimensions={displayedDimensions}
          isEmpty={sceneIsEmpty}
          saveStatus={saveStatus}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onToggleLang={() => setLang((current) => (current === "en" ? "zh" : "en"))}
          onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")}
          onOpenHelp={() => setHelpDialogOpen(true)}
          onSave={requestSaveProject}
          onUndo={undo}
          onRedo={redo}
          onExport={exportOrder}
          onExportJson={exportCurrentProjectJson}
          exporting={exporting}
        />
        <div className="designer-grid">
          <CanvasPanel
            selectedId={selectedId}
            selectedIds={selectedIds}
            activeGroupPartIds={activeUserGroupPartIds}
            addedParts={addedParts}
            background={background}
            customBackgroundUrl={customBackgroundUrl}
            referenceImageDataUrl={referenceImageDataUrl}
            referenceImageVisible={referenceImageVisible}
            transforms={transforms}
            materials={materials}
            panelCutouts={panelCutouts}
            resolvedRiskIds={resolvedRiskIds}
            deletedIds={deletedIds}
            hiddenIds={hiddenIds}
            lockedIds={lockedIds}
            isolatedIds={isolatedIds}
            assemblyConnections={assemblyConnections}
            preciseAssemblyRelations={preciseAssemblyRelations}
            focusRequest={focusRequest}
            onSelect={selectPart}
            onSelectMany={selectMany}
            onClearSelection={() => setSelectedIds([])}
            onSelectAllVisible={selectAllVisible}
            onShowAllParts={showAllParts}
            onAddPart={(kind, placement) => addPart(kind, undefined, placement)}
            onSmartAlign={smartAlignAddedParts}
            canSmartAlign={addedParts.some(({ id }) =>
              !deletedIds.has(id) && !hiddenIds.has(id) && !lockedIds.has(id) && (isolatedIds.size === 0 || isolatedIds.has(id)),
            )}
            onAlignPair={alignSelectedPair}
            onConnectPair={smartConnectSelectedPair}
            canConnectPair={canConnectSelectedPair}
            onSurfaceContact={() => setSelectedPairSurfaceGap(0)}
            onSurfaceGap={setSelectedPairSurfaceGap}
            canSurfacePair={canSurfaceSelectedPair}
            onExchangePair={exchangeSelectedPair}
            onMirrorSelection={mirrorSelection}
            onFlipSelection={flipSelection}
            onRotateSelection={rotateSelection}
            onModifierDuplicate={duplicateForModifierDrag}
            onCopySelection={copySelectionToClipboard}
            onPasteClipboard={pasteFromClipboard}
            canPaste={partClipboard.length > 0}
            onOpenPartPicker={openPartPicker}
            onOpenTemplatePicker={openTemplateCreator}
            onSaveProject={requestSaveProject}
            onQuickFix={quickFixPart}
            onResetTransform={resetPartTransform}
            onDeletePart={requestDeletePart}
            onTransformChange={updatePartTransform}
            onGroupTransformChange={updateGroupTransforms}
            onShaftLengthEditStart={beginShaftLengthEdit}
            onShaftLengthPreview={previewShaftLength}
            onPanelEdgeEditStart={beginPanelEdgeEdit}
            onPanelEdgePreview={previewPanelEdge}
            onBackgroundChange={setBackground}
            onBackgroundUpload={uploadBackground}
            onReferenceImageUpload={uploadReferenceImage}
            onReferenceImageVisibleChange={changeReferenceImageVisibility}
            onReferenceImageClear={clearReferenceImage}
            dimensions={dimensions}
            overallBounds={overallDesignBounds}
            onMirrorAxisChange={setMirrorAxis}
            lang={lang}
          />
          <aside className="right-dock panel">
            <div className="right-dock-tabs" role="tablist" aria-label={lang === "zh" ? "设计信息" : "DESIGN DETAILS"}>
              <button type="button" role="tab" aria-selected={sidePanelTab === "structure"} className={sidePanelTab === "structure" ? "active" : ""} onClick={() => setSidePanelTab("structure")}><Layers3 size={15} />{copy[lang].structure}</button>
              <button type="button" role="tab" aria-selected={sidePanelTab === "dimensions"} className={sidePanelTab === "dimensions" ? "active" : ""} onClick={() => setSidePanelTab("dimensions")}><Maximize2 size={15} />{lang === "zh" ? "整体尺寸" : "OVERALL"}</button>
              <button type="button" role="tab" aria-selected={sidePanelTab === "inspector"} className={sidePanelTab === "inspector" ? "active" : ""} onClick={() => setSidePanelTab("inspector")}><Settings2 size={15} />{copy[lang].inspector}</button>
            </div>
            <div className="right-dock-content">
              {sidePanelTab === "structure" ? (
                <StructurePanel
                  lang={lang}
                  selectedIds={selectedIds}
                  addedParts={addedParts}
                  userGroups={userGroups}
                  resolvedRiskIds={resolvedRiskIds}
                  deletedIds={deletedIds}
                  hiddenIds={hiddenIds}
                  lockedIds={lockedIds}
                  isolatedIds={isolatedIds}
                  collapsed={false}
                  onSelect={selectPart}
                  onSelectMany={selectMany}
                  onGroupSelection={groupSelection}
                  onUngroup={ungroup}
                  onRenameGroup={renameGroup}
                  onDuplicateSelection={duplicateSelection}
                  onMirrorSelection={mirrorSelection}
                  onToggleHidden={toggleHidden}
                  onToggleLocked={toggleLocked}
                  onToggleIsolation={toggleIsolation}
                  onRequestDelete={() => setPendingDeleteIds(selectedIds)}
                  onFocusSelection={() => setFocusRequest((current) => current + 1)}
                  onQuickFix={quickFixPart}
                  onToggleCollapsed={() => undefined}
                />
              ) : sidePanelTab === "dimensions" ? (
                <OverallDimensionsPanel
                  dimensions={displayedDimensions}
                  actualDimensions={displayedDimensions}
                  onApply={resizeOverallDesign}
                  lang={lang}
                />
              ) : (
                <InspectorPanel
                  selected={selected}
                  selectedCount={selectedIds.length}
                  overallDimensions={displayedDimensions}
                  structuralAnalysis={structuralAnalysis}
                  structuralIssues={selectedStructuralIssues}
                  preciseRelations={selectedPreciseRelations}
                  mixedKinds={new Set(selectedIds.map((id) => getPartInfo(id, lang, resolvedRiskIds, addedParts).kind)).size > 1}
                  transform={selectedTransform}
                  shaftLength={selected.kind === "rod" ? selectedRodLength : undefined}
                  parallelClampParameters={selectedParallelClampParameters}
                  equalBoreCrossClampDiameter={selectedEqualBoreCrossClampDiameter}
                  equalBoreTClampDiameter={selectedEqualBoreTClampDiameter}
                  roundFixedBaseInnerDiameter={selectedRoundFixedBaseInnerDiameter}
                  verticalFixedBaseShaftDiameter={selectedVerticalFixedBaseShaftDiameter}
                  shaftStopParameters={selectedShaftStopParameters}
                  panelCutouts={selectedPanelCutouts}
                  canDrillPanel={canDrillSelectedPanel}
                  material={selectedMaterial}
                  onTransformChange={updateSelectedTransform}
                  onShaftParametersChange={selected.kind === "rod" ? updateSelectedShaftParameters : undefined}
                  onParallelClampParametersChange={selectedParallelClampParameters ? updateSelectedParallelClampParameters : undefined}
                  onEqualBoreCrossClampModelChange={selectedEqualBoreCrossClampDiameter === undefined ? undefined : updateSelectedEqualBoreCrossClampModel}
                  onEqualBoreTClampModelChange={selectedEqualBoreTClampDiameter === undefined ? undefined : updateSelectedEqualBoreTClampModel}
                  onRoundFixedBaseInnerDiameterChange={selectedRoundFixedBaseInnerDiameter === undefined ? undefined : updateSelectedRoundFixedBaseInnerDiameter}
                  onVerticalFixedBaseModelChange={selectedVerticalFixedBaseShaftDiameter === undefined ? undefined : updateSelectedVerticalFixedBaseModel}
                  onShaftStopParametersChange={selectedShaftStopParameters ? updateSelectedShaftStopParameters : undefined}
                  onAddPanelCutout={addSelectedPanelCutout}
                  onUpdatePanelCutout={updateSelectedPanelCutout}
                  onRemovePanelCutout={removeSelectedPanelCutout}
                  onMaterialChange={updateSelectedMaterial}
                  onQuickFix={() => quickFixPart(selectedId)}
                  onQuickRotate={rotateSelection}
                  onLocateBom={() => { setBomFocusIds(selectedIds); setActivePage("bom"); }}
                  onRemovePreciseRelation={removePreciseAssemblyRelation}
                  onUpdatePreciseRelation={updatePreciseAssemblyRelation}
                  collapsed={false}
                  onToggleCollapsed={() => undefined}
                  lang={lang}
                />
              )}
            </div>
          </aside>
        </div>
      </div>
      )}
      {partPickerOpen && (
        <PartPickerDialog parts={libraryParts} lang={lang} onClose={closePartPicker} onAdd={addLibraryPart} />
      )}
      {templatePickerOpen && (
        <TemplatePickerDialog templates={availableTemplates} lang={lang} onClose={() => setTemplatePickerOpen(false)} onSelect={loadRackTemplate} onDelete={deleteSavedTemplate} />
      )}
      {saveDialogOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSaveDialogOpen(false)}>
          <form className="confirm-dialog save-project-dialog" role="dialog" aria-modal="true" aria-labelledby="save-project-title" onSubmit={(event) => { event.preventDefault(); commitSaveProject(); }} onMouseDown={(event) => event.stopPropagation()}>
            <DialogFocusTrap onEscape={() => setSaveDialogOpen(false)} />
            <div className="confirm-dialog-icon"><Save size={22} /></div>
            <h2 id="save-project-title">{lang === "zh" ? "保存项目" : "SAVE PROJECT"}</h2>
            <p>{lang === "zh" ? "输入名称后，可保存到项目列表，或将当前设计保存为以后可复用的本地模板。" : "Enter a name, then save this design as a project or as a reusable local template."}</p>
            <label className="save-project-name">
              <span>{lang === "zh" ? "项目 / 模板名称" : "PROJECT / TEMPLATE NAME"}</span>
              <input autoFocus value={saveNameDraft} maxLength={80} placeholder={lang === "zh" ? "例如：三层设备架 V1" : "E.G. THREE-TIER RACK V1"} onChange={(event) => setSaveNameDraft(event.target.value)} />
            </label>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setSaveDialogOpen(false)}>{copy[lang].cancel}</button>
              <button className="save-template-button" type="button" disabled={!saveNameDraft.trim()} onClick={commitSaveTemplate}><Layers3 size={15} />{lang === "zh" ? "保存为模板" : "SAVE AS TEMPLATE"}</button>
              <button className="primary-button" type="submit" disabled={!saveNameDraft.trim()}><Save size={15} />{lang === "zh" ? "保存到项目" : "SAVE PROJECT"}</button>
            </div>
          </form>
        </div>
      )}
      {helpDialogOpen && <EditorHelpDialog lang={lang} onClose={() => setHelpDialogOpen(false)} />}
      {pendingDeleteIds.length > 0 && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setPendingDeleteIds([])}>
          <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <DialogFocusTrap onEscape={() => setPendingDeleteIds([])} />
            <div className="confirm-dialog-icon"><Trash2 size={22} /></div>
            <h2 id="delete-dialog-title">{copy[lang].deleteTitle}</h2>
            <p>{copy[lang].deleteImpact}</p>
            <div className="delete-impact-list">
              <strong>{pendingDeleteIds.length} {lang === "zh" ? "个零件" : "PARTS"}</strong>
              <span>{pendingDeleteIds.join(", ")}</span>
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" onClick={() => setPendingDeleteIds([])}>{copy[lang].cancel}</button>
              <button className="danger" type="button" onClick={() => deleteParts(pendingDeleteIds)}>{copy[lang].confirmDelete}</button>
            </div>
          </div>
        </div>
      )}
      {clipboardNotice && <div className="clipboard-toast" role="status" aria-live="polite"><Copy size={14} />{clipboardNotice}</div>}
      {templateNotice && <div className="clipboard-toast" role="status" aria-live="polite"><Layers3 size={14} />{templateNotice}</div>}
      {alignmentNotice && <div className="clipboard-toast smart-align-toast" role="status" aria-live="polite"><WandSparkles size={14} />{alignmentNotice}</div>}
      <DevServerHealthNotice lang={lang} />
    </div>
  );
}
