export const componentUsageOptions = [
  "frame-structure",
  "load-bearing-surface",
  "panel-support",
  "corner-connection",
  "parallel-connection",
  "wall-mount",
  "base-foot",
  "linear-motion",
  "axial-stop",
  "pegboard-fixture",
] as const;

export type ComponentUsageTag = (typeof componentUsageOptions)[number];

export const componentUsageLabels: Record<ComponentUsageTag, { zh: string; en: string }> = {
  "frame-structure": { zh: "框架骨架", en: "Frame structure" },
  "load-bearing-surface": { zh: "承重台面", en: "Load surface" },
  "panel-support": { zh: "层板承托", en: "Panel support" },
  "corner-connection": { zh: "转角连接", en: "Corner joint" },
  "parallel-connection": { zh: "平行连接", en: "Parallel joint" },
  "wall-mount": { zh: "壁面固定", en: "Wall mount" },
  "base-foot": { zh: "落地支撑", en: "Base foot" },
  "linear-motion": { zh: "滑动导向", en: "Linear motion" },
  "axial-stop": { zh: "轴向限位", en: "Axial stop" },
  "pegboard-fixture": { zh: "洞洞板固定", en: "Pegboard fixture" },
};

export const defaultUsageTagsByKind: Record<"joint" | "rod" | "panel", ComponentUsageTag[]> = {
  joint: ["corner-connection"],
  rod: ["frame-structure"],
  panel: ["load-bearing-surface"],
};

export function normalizeUsageTags(
  kind: "joint" | "rod" | "panel",
  usageTags?: readonly ComponentUsageTag[],
): ComponentUsageTag[] {
  const allowed = new Set<ComponentUsageTag>(componentUsageOptions);
  const normalized = [...new Set((usageTags ?? []).filter((tag): tag is ComponentUsageTag => allowed.has(tag)))];
  return normalized.length > 0 ? normalized : [...defaultUsageTagsByKind[kind]];
}

export function hasComponentUsage(
  usageTags: readonly ComponentUsageTag[] | undefined,
  tag: ComponentUsageTag,
): boolean {
  return usageTags?.includes(tag) ?? false;
}
