import { Point3D } from './types';

export function parseCSV(text: string): Point3D[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) throw new Error('CSV is empty');

  const points: Point3D[] = [];
  const startIdx = isHeaderRow(lines[0]) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/[,;\t]+/);
    if (parts.length < 3) {
      throw new Error(`Line ${i + 1}: expected at least 3 columns, got ${parts.length}`);
    }

    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);

    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      throw new Error(`Line ${i + 1}: non-numeric values found`);
    }

    points.push({ x, y, z });
  }

  if (points.length < 3) {
    throw new Error(`Need at least 3 points, got ${points.length}`);
  }

  return points;
}

function isHeaderRow(line: string): boolean {
  const parts = line.split(/[,;\t]+/);
  return parts.some(p => isNaN(parseFloat(p)));
}
