export const DESIGN_GROUND_Y_MM = 0;
export const BUILT_IN_CONNECTOR_HEIGHT_MM = 20;
export const BUILT_IN_PANEL_OFFSET_MM = 16;

export function builtInLevelYsMm(frameHeightMm: number): [number, number, number] {
  const baseCenterY = DESIGN_GROUND_Y_MM + BUILT_IN_CONNECTOR_HEIGHT_MM / 2;
  return [baseCenterY, baseCenterY + frameHeightMm / 2, baseCenterY + frameHeightMm];
}

export function builtInPanelYsMm(frameHeightMm: number): [number, number, number] {
  return builtInLevelYsMm(frameHeightMm).map((y) => y + BUILT_IN_PANEL_OFFSET_MM) as [number, number, number];
}
