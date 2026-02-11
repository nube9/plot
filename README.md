# Earthworks Cut/Fill Calculator

3D web tool for calculating earthworks cut/fill volumes. Upload terrain survey data (CSV), draw a building pad footprint, and visualize cut/fill areas with volume results.

## Quick Start

```bash
npm install
npm run dev
```

## Usage

1. **Upload CSV** — terrain points in `x,y,z` format (meters)
2. **Set pad elevation** — defaults to lowest terrain point
3. **Draw Polygon** — click vertices in top-down view, double-click to close
4. **Compute Volumes** — terrain colors: red = cut, blue = fill, green = neutral

## Tech Stack

Vite, TypeScript, Three.js, Delaunator
