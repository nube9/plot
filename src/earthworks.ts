import { Point3D, Rectangle, VolumeResult } from './types';
import { terrainHeight } from './tin';
import { designHeight } from './design';

export function computeVolume(
  terrainPoints: Point3D[],
  triangles: Uint32Array,
  bodies: Rectangle[],
  gridSize: number
): VolumeResult {
  if (bodies.length === 0) {
    return { cut: 0, fill: 0, net: 0, areaSampled: 0, cellCount: 0 };
  }

  // Union bounding box across all bodies
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rect of bodies) {
    if (rect.minX < minX) minX = rect.minX;
    if (rect.minY < minY) minY = rect.minY;
    if (rect.maxX > maxX) maxX = rect.maxX;
    if (rect.maxY > maxY) maxY = rect.maxY;
  }

  const cellArea = gridSize * gridSize;
  let cut = 0;
  let fill = 0;
  let cellCount = 0;

  for (let x = minX; x <= maxX; x += gridSize) {
    for (let y = minY; y <= maxY; y += gridSize) {
      const zExisting = terrainHeight(x, y, terrainPoints, triangles);
      if (zExisting === null) continue;

      const zDesign = designHeight(x, y, bodies);
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
