import { Point2D, Point3D, VolumeResult } from './types';
import { terrainHeight } from './tin';
import { designHeight } from './design';

export function computeVolume(
  terrainPoints: Point3D[],
  triangles: Uint32Array,
  polygon: Point2D[],
  padElevation: number,
  slopeRatio: number,
  slopeMaxDist: number,
  gridSize: number
): VolumeResult {
  // Bounding box from terrain points expanded by slopeMaxDist
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  minX -= slopeMaxDist;
  minY -= slopeMaxDist;
  maxX += slopeMaxDist;
  maxY += slopeMaxDist;

  const cellArea = gridSize * gridSize;
  let cut = 0;
  let fill = 0;
  let cellCount = 0;

  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      const zExisting = terrainHeight(x, y, terrainPoints, triangles);
      if (zExisting === null) continue;

      const zDesign = designHeight(x, y, polygon, padElevation, slopeRatio, slopeMaxDist);
      if (zDesign === null) continue;

      const dz = zDesign - zExisting;
      if (dz > 0) {
        fill += dz * cellArea;
      } else {
        cut += -dz * cellArea;
      }
      cellCount++;
    }
  }

  return {
    cut,
    fill,
    net: fill - cut,
    areaSampled: cellCount * cellArea,
    cellCount,
  };
}
