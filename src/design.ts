import { Rectangle } from './types';
import { pointInRectangle } from './geometry';

export function designHeight(
  x: number,
  y: number,
  bodies: Rectangle[]
): number | null {
  let max: number | null = null;
  for (const rect of bodies) {
    if (pointInRectangle({ x, y }, rect)) {
      if (max === null || rect.elevation > max) max = rect.elevation;
    }
  }
  return max;
}
