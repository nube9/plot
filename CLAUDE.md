# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` (Vite, opens at localhost:5173)
- **Build**: `npm run build` (runs `tsc && vite build`, output in `dist/`)
- **Type check only**: `npx tsc --noEmit`

No test framework is configured.

## Architecture

Earthworks Cut/Fill Volume Calculator — a Vite + TypeScript single-page app using Three.js for 3D visualization. The user uploads terrain survey points (CSV), draws a building pad footprint polygon on a horizontal reference plane, and computes cut/fill earthwork volumes.

### Data Pipeline

1. **CSV → Point3D[]** (`csv.ts`) — parse uploaded terrain survey points
2. **Point3D[] → Delaunay TIN** (`tin.ts`) — triangulate terrain using `delaunator`, provides `terrainHeight(x,y)` via barycentric interpolation
3. **Polygon + pad params → design surface** (`design.ts`) — flat pad inside polygon, sloping away outside at configured H:V ratio
4. **Grid sampling** (`earthworks.ts`) — iterates a grid over the area, compares terrain height vs design height at each cell, accumulates cut/fill volumes

### Coordinate System

All terrain data lives in world coordinates (from CSV). The Three.js scene is centered by subtracting `terrainCenter` (mean x,y,z) from all positions. When converting between scene coords and terrain coords, add/subtract `terrainCenter`. The Z axis is up (elevation).

### Key Concepts

- **Pad plane**: visible green semi-transparent horizontal plane at the pad elevation. Polygon drawing and raycasting happen on this plane.
- **Design surface**: inside the polygon = pad elevation; outside = slopes down at `slopeRatio` H:V; beyond `slopeMaxDist` = null (not part of design).
- **Vertex colors**: after volume computation, terrain mesh vertices are colored red (cut), blue (fill), green (neutral), gray (outside design area).

### Module Dependency

```
main.ts → csv.ts, tin.ts, design.ts, earthworks.ts, types.ts
earthworks.ts → tin.ts, design.ts
design.ts → geometry.ts
```

`types.ts` has shared interfaces: `Point3D`, `Point2D`, `VolumeResult`.
`delaunator.d.ts` provides type declarations for the untyped `delaunator` npm package.

## Playwright MCP

Save all Playwright screenshots/files to `.playwright-mcp/` (gitignored). Example: `filename: ".playwright-mcp/screenshot.png"`.
