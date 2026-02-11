import Delaunator from 'delaunator';
import { Point3D } from './types';

export function buildTIN(points: Point3D[]): { triangles: Uint32Array; points: Point3D[] } {
  const coords = points.flatMap(p => [p.x, p.y]);
  const delaunay = new Delaunator(coords);
  return { triangles: delaunay.triangles, points };
}

export function terrainHeight(
  x: number,
  y: number,
  points: Point3D[],
  triangles: Uint32Array
): number | null {
  for (let i = 0; i < triangles.length; i += 3) {
    const a = points[triangles[i]];
    const b = points[triangles[i + 1]];
    const c = points[triangles[i + 2]];

    const bary = barycentric(x, y, a, b, c);
    if (bary === null) continue;

    const [u, v, w] = bary;
    return u * a.z + v * b.z + w * c.z;
  }
  return null;
}

function barycentric(
  px: number,
  py: number,
  a: Point3D,
  b: Point3D,
  c: Point3D
): [number, number, number] | null {
  const v0x = c.x - a.x;
  const v0y = c.y - a.y;
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = px - a.x;
  const v2y = py - a.y;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return null;

  const invDenom = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  const eps = -1e-6;
  if (u < eps || v < eps || u + v > 1 + 1e-6) return null;

  const w = 1 - u - v;
  return [w, v, u];
}
