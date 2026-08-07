export interface PreviewContourOptions {
  alphaThreshold?: number;
  outerAlpha?: number;
  innerAlpha?: number;
  luminanceThreshold?: number;
}

const luminanceAt = (rgba: ArrayLike<number>, pixel: number) => (
  rgba[pixel * 4] * 0.2126
  + rgba[pixel * 4 + 1] * 0.7152
  + rgba[pixel * 4 + 2] * 0.0722
);

/**
 * Builds a semi-transparent contour mask for a cleaned component preview.
 * The stronger outer contour separates the component from a light canvas,
 * while a lighter internal contour preserves important face and bore changes.
 */
export function createPreviewContourAlpha(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  options: PreviewContourOptions = {},
) {
  const alphaThreshold = options.alphaThreshold ?? 88;
  const outerAlpha = Math.min(254, options.outerAlpha ?? 136);
  const innerAlpha = Math.min(outerAlpha - 1, options.innerAlpha ?? 62);
  const luminanceThreshold = options.luminanceThreshold ?? 38;
  const contour = new Uint8ClampedArray(Math.max(0, width * height));
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return contour;

  const isVisible = (x: number, y: number) => (
    x >= 0
    && x < width
    && y >= 0
    && y < height
    && rgba[(y * width + x) * 4 + 3] >= alphaThreshold
  );
  const outerNeighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];
  const innerNeighbors = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const visible = isVisible(x, y);
      const touchesOppositeAlpha = outerNeighbors.some(([offsetX, offsetY]) => (
        isVisible(x + offsetX, y + offsetY) !== visible
      ));
      if (touchesOppositeAlpha) {
        contour[pixel] = visible ? outerAlpha : Math.round(outerAlpha * 0.72);
        continue;
      }
      if (!visible) continue;

      const luminance = luminanceAt(rgba, pixel);
      const hasStructuralTransition = innerNeighbors.some(([offsetX, offsetY]) => {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (!isVisible(neighborX, neighborY)) return false;
        return Math.abs(luminance - luminanceAt(rgba, neighborY * width + neighborX)) >= luminanceThreshold;
      });
      if (hasStructuralTransition) contour[pixel] = innerAlpha;
    }
  }

  return contour;
}
