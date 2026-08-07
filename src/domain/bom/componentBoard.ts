import { buildOrderData, type OrderDataInput, type OrderPartKind } from "./orderData";

export type ComponentBoardGroup = {
  key: string;
  kind: OrderPartKind;
  category: string;
  name: string;
  sku: string;
  specification: string;
  material: string;
  quantity: number;
  unit: string;
  partIds: string[];
  previewId: string;
};

const kindOrder: Record<OrderPartKind, number> = {
  panel: 0,
  rod: 1,
  joint: 2,
};

const fallbackPreviewId: Record<OrderPartKind, string> = {
  panel: "lib-panel",
  rod: "lib-shaft-10",
  joint: "lib-equal-cross-10",
};

const fallbackName: Record<OrderPartKind, string> = {
  panel: "层板",
  rod: "光轴",
  joint: "连接件",
};

export function buildComponentBoardGroups(input: OrderDataInput): ComponentBoardGroup[] {
  const data = buildOrderData(input);
  const partById = new Map(data.visibleParts.map((part) => [part.id, part]));
  return data.summary
    .map((line) => {
      const representative = line.partIds.map((id) => partById.get(id)).find(Boolean);
      const kind = representative?.kind ?? "joint";
      const previewId = representative?.libraryPart?.id
        ?? (kind === "panel" && representative?.libraryPart?.model.includes("PEGBOARD") ? "lib-pegboard-600" : fallbackPreviewId[kind]);
      return {
        key: [line.category, line.sku, line.specification, line.material].join("|"),
        kind,
        category: line.category,
        name: representative?.libraryPart?.name ?? fallbackName[kind],
        sku: line.sku,
        specification: line.specification,
        material: line.material,
        quantity: line.quantity,
        unit: line.unit,
        partIds: line.partIds,
        previewId,
      };
    })
    .sort((a, b) =>
      kindOrder[a.kind] - kindOrder[b.kind]
      || a.name.localeCompare(b.name, "zh-CN")
      || a.specification.localeCompare(b.specification, "zh-CN"));
}
