export type PanelMaterial = "oak" | "walnut" | "acrylic";

export type PanelMaterialSource = {
  model?: string;
  name?: string;
  material?: string;
};

export const panelMaterialCatalogLabel: Record<PanelMaterial, string> = {
  oak: "原木纹",
  walnut: "胡桃木纹",
  acrylic: "透明亚克力",
};

export function inferPanelMaterial(source: PanelMaterialSource): PanelMaterial {
  const value = `${source.model ?? ""} ${source.name ?? ""} ${source.material ?? ""}`.toLowerCase();
  if (value.includes("walnut") || value.includes("胡桃")) return "walnut";
  if (value.includes("oak") || value.includes("橡木") || value.includes("原木")) return "oak";
  return "acrylic";
}
