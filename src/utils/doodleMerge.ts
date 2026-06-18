import type { DoodlePoint, DoodleStroke } from '../types/doodle';

/** Union strokes by id; later array wins on duplicate ids. */
export function mergeStrokes(a: DoodleStroke[], b: DoodleStroke[]): DoodleStroke[] {
  const map = new Map<string, DoodleStroke>();
  for (const s of a) map.set(s.id, s);
  for (const s of b) map.set(s.id, s);
  return Array.from(map.values()).sort(
    (x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime(),
  );
}

export function newStrokeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Convert touch pixels to 0–1 coords so strokes scale across device sizes. */
export function normalizePoint(px: number, py: number, width: number, height: number): DoodlePoint {
  const w = Math.max(width, 1);
  const h = Math.max(height, 1);
  return { x: px / w, y: py / h };
}

export function denormalizePoint(point: DoodlePoint, width: number, height: number): DoodlePoint {
  return { x: point.x * width, y: point.y * height };
}

/** Brush size stored relative to the smaller canvas edge. */
export function normalizeBrushWidth(pixels: number, width: number, height: number): number {
  return pixels / Math.max(Math.min(width, height), 1);
}

export function denormalizeBrushWidth(normalized: number, width: number, height: number): number {
  return normalized * Math.max(Math.min(width, height), 1);
}

/** Legacy rows may have pixel coords from before normalization — convert once on load. */
export function normalizeStrokeList(
  strokes: DoodleStroke[],
  refWidth = 400,
  refHeight = 350,
): DoodleStroke[] {
  return strokes.map((stroke) => {
    const looksNormalized = stroke.points.every(
      (p) => p.x >= 0 && p.x <= 1.05 && p.y >= 0 && p.y <= 1.05,
    );
    if (looksNormalized) return stroke;
    return {
      ...stroke,
      points: stroke.points.map((p) => normalizePoint(p.x, p.y, refWidth, refHeight)),
      width: normalizeBrushWidth(stroke.width, refWidth, refHeight),
    };
  });
}

export function strokeToPixelPath(
  stroke: DoodleStroke,
  width: number,
  height: number,
): { points: DoodlePoint[]; width: number } {
  return {
    points: stroke.points.map((p) => denormalizePoint(p, width, height)),
    width: denormalizeBrushWidth(stroke.width, width, height),
  };
}
