export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Rectangle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  elevation: number;
  padHeight: number;
}

export interface VolumeResult {
  cut: number;
  fill: number;
  net: number;
  areaSampled: number;
  cellCount: number;
}
