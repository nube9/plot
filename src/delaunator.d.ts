declare module 'delaunator' {
  export default class Delaunator {
    static from(points: ArrayLike<number>[]): Delaunator;
    constructor(coords: ArrayLike<number>);
    triangles: Uint32Array;
    halfedges: Int32Array;
    hull: Uint32Array;
  }
}
