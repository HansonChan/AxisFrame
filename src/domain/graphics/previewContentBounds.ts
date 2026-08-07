export type PreviewContentBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelCount: number;
};

export function findDominantPreviewContentBounds(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  alphaThreshold = 120,
): PreviewContentBounds | null {
  if (width <= 0 || height <= 0 || rgba.length < width * height * 4) return null;
  const visited = new Uint8Array(width * height);
  const minimumX = Math.floor(width * 0.02);
  const maximumX = Math.ceil(width * 0.98);
  const minimumY = Math.floor(height * 0.02);
  const maximumY = Math.ceil(height * 0.88);
  const centerX = width / 2;
  const centerY = height * 0.45;
  let best: { bounds: PreviewContentBounds; score: number } | null = null;
  const queue: number[] = [];

  const visible = (index: number) => rgba[index * 4 + 3] >= alphaThreshold;
  for (let y = minimumY; y < maximumY; y += 1) {
    for (let x = minimumX; x < maximumX; x += 1) {
      const start = y * width + x;
      if (visited[start] || !visible(start)) continue;
      visited[start] = 1;
      queue.length = 0;
      queue.push(start);
      let cursor = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;
      while (cursor < queue.length) {
        const current = queue[cursor];
        cursor += 1;
        const currentX = current % width;
        const currentY = Math.floor(current / width);
        pixelCount += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            if (offsetX === 0 && offsetY === 0) continue;
            const nextX = currentX + offsetX;
            const nextY = currentY + offsetY;
            if (nextX < minimumX || nextX >= maximumX || nextY < minimumY || nextY >= maximumY) continue;
            const next = nextY * width + nextX;
            if (visited[next] || !visible(next)) continue;
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
      if (pixelCount < 6) continue;
      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const density = pixelCount / (componentWidth * componentHeight);
      const looksLikeFrame = componentWidth > width * 0.84 && componentHeight > height * 0.62 && density < 0.08;
      if (looksLikeFrame) continue;
      const componentCenterX = (minX + maxX) / 2;
      const componentCenterY = (minY + maxY) / 2;
      const centerDistance = Math.hypot(
        (componentCenterX - centerX) / width,
        (componentCenterY - centerY) / height,
      );
      const score = pixelCount * Math.max(0.55, 1 - centerDistance * 0.7);
      if (!best || score > best.score) {
        best = {
          bounds: { x: minX, y: minY, width: componentWidth, height: componentHeight, pixelCount },
          score,
        };
      }
    }
  }
  return best?.bounds ?? null;
}
