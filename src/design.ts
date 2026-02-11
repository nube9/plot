import { Point2D } from './types';
import { pointInPolygon, distanceToPolygon } from './geometry';

export function designHeight(
  x: number,
  y: number,
  polygon: Point2D[],
  z0: number,
  slopeRatio: number,
  dMax: number
): number | null {
  const p: Point2D = { x, y };

  if (pointInPolygon(p, polygon)) {
    return z0;
  }

  const dist = distanceToPolygon(p, polygon);
  if (dist > dMax) return null;

  // Slope falls/rises from pad edge: design surface descends away from pad
  return z0 - dist / slopeRatio;
}
