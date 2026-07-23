export type ExplodedPartKind = "joint" | "rod" | "panel";
export type ExplodedPart = { id: string; kind: ExplodedPartKind; centerMm: [number, number, number] };
export type ExplodedOffset = { id: string; offsetMm: [number, number, number]; distanceMm: number };

const length = (vector: [number, number, number]) => Math.hypot(...vector);
const normalize = (vector: [number, number, number]): [number, number, number] => {
  const magnitude = length(vector);
  return magnitude > 1e-8 ? vector.map((value) => value / magnitude) as [number, number, number] : [0, 1, 0];
};

export function generateExplodedView(parts: ExplodedPart[], amount = 1): ExplodedOffset[] {
  if (parts.length === 0 || amount <= 0) return parts.map(({ id }) => ({ id, offsetMm: [0, 0, 0], distanceMm: 0 }));
  const clampedAmount = Math.min(1, Math.max(0, amount));
  const center = [0, 1, 2].map((axis) => parts.reduce((sum, part) => sum + part.centerMm[axis], 0) / parts.length) as [number, number, number];
  const extents = [0, 1, 2].map((axis) => {
    const values = parts.map((part) => part.centerMm[axis]);
    return Math.max(...values) - Math.min(...values);
  });
  const baseDistance = Math.max(140, Math.hypot(...extents) * 0.34);
  const ordered = [...parts].sort((a, b) => a.id.localeCompare(b.id));
  const kindIndex = new Map<ExplodedPartKind, number>();

  return ordered.map((part, index) => {
    const radial: [number, number, number] = [
      part.centerMm[0] - center[0],
      part.centerMm[1] - center[1],
      part.centerMm[2] - center[2],
    ];
    if (length(radial) < 1) {
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      radial[0] = Math.cos(angle);
      radial[2] = Math.sin(angle);
    }
    const ordinal = kindIndex.get(part.kind) ?? 0;
    kindIndex.set(part.kind, ordinal + 1);
    if (part.kind === "panel") {
      radial[1] += part.centerMm[1] >= center[1] ? baseDistance * 0.75 : -baseDistance * 0.45;
    } else if (part.kind === "joint") {
      radial[0] *= 1.25;
      radial[2] *= 1.25;
      radial[1] += ((ordinal % 3) - 1) * baseDistance * 0.12;
    } else {
      radial[1] += ((ordinal % 2) - 0.5) * baseDistance * 0.18;
    }
    const direction = normalize(radial);
    const kindMultiplier = part.kind === "joint" ? 1.12 : part.kind === "panel" ? 0.92 : 1;
    const stagger = 1 + (ordinal % 4) * 0.07;
    const distanceMm = baseDistance * kindMultiplier * stagger * clampedAmount;
    return {
      id: part.id,
      offsetMm: direction.map((value) => Math.round(value * distanceMm * 10) / 10) as [number, number, number],
      distanceMm: Math.round(distanceMm * 10) / 10,
    };
  });
}
