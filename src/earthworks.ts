import { Point3D, Rectangle, VolumeResult } from './types';
import { terrainHeight } from './tin';
import { designHeight } from './design';

export function computeVolume(
  terrainPoints: Point3D[],
  triangles: Uint32Array,
  rect: Rectangle,
  gridSize: number
): VolumeResult {
  const cellArea = gridSize * gridSize;
  let cut = 0;
  let fill = 0;
  let cellCount = 0;

  for (let x = rect.minX; x <= rect.maxX; x += gridSize) {
    for (let y = rect.minY; y <= rect.maxY; y += gridSize) {
      const zExisting = terrainHeight(x, y, terrainPoints, triangles);
      if (zExisting === null) continue;

      const zDesign = designHeight(x, y, rect);
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
