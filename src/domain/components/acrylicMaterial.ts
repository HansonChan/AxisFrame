import type { AcrylicPanelMaterial } from "./panelMaterials";

export const acrylicLiquidGlassMaterial = {
  color: "#e8f6f8",
  attenuationColor: "#d8f8ff",
  normalOpacity: 0.66,
  selectedOpacity: 0.78,
  previewOpacity: 0.68,
  transmission: 0.28,
  thickness: 0.22,
  roughness: 0.06,
  metalness: 0,
  ior: 1.46,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  reflectivity: 0.78,
  envMapIntensity: 1.65,
  attenuationDistance: 0.75,
} as const;

export const acrylicPanelColorSpecs: Record<AcrylicPanelMaterial, {
  color: string;
  attenuationColor: string;
}> = {
  acrylic: {
    color: acrylicLiquidGlassMaterial.color,
    attenuationColor: acrylicLiquidGlassMaterial.attenuationColor,
  },
  acrylicOrange: {
    color: "#ff7518",
    attenuationColor: "#ff8a32",
  },
  acrylicKleinBlue: {
    color: "#002fa7",
    attenuationColor: "#1549c7",
  },
  acrylicGreen: {
    color: "#159b62",
    attenuationColor: "#27b878",
  },
};
