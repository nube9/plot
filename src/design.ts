import { Rectangle } from './types';
import { pointInRectangle } from './geometry';

export function designHeight(
  x: number,
  y: number,
  rect: Rectangle
): number | null {
  if (pointInRectangle({ x, y }, rect)) {
    return rect.elevation;
  }
  return null;
}
