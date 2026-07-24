export type WoodPanelMaterial = "oak" | "walnut";
export type AcrylicPanelMaterial = "acrylic" | "acrylicOrange" | "acrylicKleinBlue" | "acrylicGreen";
export type PanelMaterial = WoodPanelMaterial | AcrylicPanelMaterial;

export type PanelMaterialSource = {
  model?: string;
  name?: string;
  material?: string;
};

export const panelMaterialCatalogLabel: Record<PanelMaterial, string> = {
  oak: "原木纹",
  walnut: "胡桃木纹",
  acrylic: "透明亚克力",
  acrylicOrange: "橙色亚克力",
  acrylicKleinBlue: "克莱因蓝亚克力",
  acrylicGreen: "绿色亚克力",
};

export function isAcrylicPanelMaterial(material: PanelMaterial | string): material is AcrylicPanelMaterial {
  return material === "acrylic"
    || material === "acrylicOrange"
    || material === "acrylicKleinBlue"
    || material === "acrylicGreen";
}

export function inferPanelMaterial(source: PanelMaterialSource): PanelMaterial {
  const value = `${source.model ?? ""} ${source.name ?? ""} ${source.material ?? ""}`.toLowerCase();
  if (value.includes("walnut") || value.includes("胡桃")) return "walnut";
  if (value.includes("oak") || value.includes("橡木") || value.includes("原木")) return "oak";
  if (value.includes("orange") || value.includes("橙")) return "acrylicOrange";
  if (value.includes("klein") || value.includes("blue") || value.includes("克莱因") || value.includes("蓝")) return "acrylicKleinBlue";
  if (value.includes("green") || value.includes("绿")) return "acrylicGreen";
  return "acrylic";
}
