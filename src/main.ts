import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseCSV } from './csv';
import { buildTIN, terrainHeight } from './tin';
import { designHeight } from './design';
import { computeVolume } from './earthworks';
import { Point2D, Point3D } from './types';

// ─── State ───────────────────────────────────────────────────────────
let terrainPoints: Point3D[] = [];
let tinTriangles: Uint32Array = new Uint32Array();
let polygonVertices: Point2D[] = [];
let drawingMode = false;
let terrainCenter = new THREE.Vector3();

// ─── DOM refs ────────────────────────────────────────────────────────
const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLDivElement;
const csvInput = document.getElementById('csvFile') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const btnDraw = document.getElementById('btnDraw') as HTMLButtonElement;
const btnCompute = document.getElementById('btnCompute') as HTMLButtonElement;
const btnTopView = document.getElementById('btnTopView') as HTMLButtonElement;
const btnReset = document.getElementById('btnReset') as HTMLButtonElement;
const chkWireframe = document.getElementById('chkWireframe') as HTMLInputElement;
const drawHint = document.getElementById('draw-hint') as HTMLDivElement;
const resultsPanel = document.getElementById('results') as HTMLDivElement;

const inputPadElev = document.getElementById('padElevation') as HTMLInputElement;
const inputSlopeRatio = document.getElementById('slopeRatio') as HTMLInputElement;
const inputSlopeMaxDist = document.getElementById('slopeMaxDist') as HTMLInputElement;
const inputGridSize = document.getElementById('gridSize') as HTMLInputElement;

// ─── Three.js setup ──────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x1a1a2e);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10000);
camera.position.set(0, 0, 200);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(1, 1, 1);
scene.add(dirLight);

// Groups
const terrainGroup = new THREE.Group();
const polygonGroup = new THREE.Group();
const markerGroup = new THREE.Group();
scene.add(terrainGroup, polygonGroup, markerGroup);

let terrainMesh: THREE.Mesh | null = null;
let wireframeMesh: THREE.LineSegments | null = null;
let padPlaneMesh: THREE.Mesh | null = null;

// ─── Resize handling ─────────────────────────────────────────────────
function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

// ─── Render loop ─────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// ─── CSV upload ──────────────────────────────────────────────────────
csvInput.addEventListener('change', async () => {
  const file = csvInput.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    terrainPoints = parseCSV(text);
    const tin = buildTIN(terrainPoints);
    tinTriangles = tin.triangles;

    statusEl.textContent = `Loaded ${terrainPoints.length} points, ${tinTriangles.length / 3} triangles`;
    btnDraw.disabled = false;

    buildTerrainMesh();
    fitCamera();
  } catch (e: unknown) {
    statusEl.textContent = `Error: ${(e as Error).message}`;
  }
});

// ─── Build terrain mesh ──────────────────────────────────────────────
function buildTerrainMesh() {
  // Clear previous
  terrainGroup.clear();
  terrainMesh = null;
  wireframeMesh = null;

  const positions = new Float32Array(terrainPoints.length * 3);
  // Compute center for offsetting
  let cx = 0, cy = 0, cz = 0;
  for (const p of terrainPoints) {
    cx += p.x; cy += p.y; cz += p.z;
  }
  cx /= terrainPoints.length;
  cy /= terrainPoints.length;
  cz /= terrainPoints.length;
  terrainCenter.set(cx, cy, cz);

  for (let i = 0; i < terrainPoints.length; i++) {
    positions[i * 3] = terrainPoints[i].x - cx;
    positions[i * 3 + 1] = terrainPoints[i].y - cy;
    positions[i * 3 + 2] = terrainPoints[i].z - cz;
  }

  const indices = new Uint32Array(tinTriangles.length);
  for (let i = 0; i < tinTriangles.length; i++) {
    indices[i] = tinTriangles[i];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();

  // Initialize vertex colors to gray
  const colors = new Float32Array(terrainPoints.length * 3);
  for (let i = 0; i < terrainPoints.length; i++) {
    colors[i * 3] = 0.6;
    colors[i * 3 + 1] = 0.6;
    colors[i * 3 + 2] = 0.6;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: true,
  });

  terrainMesh = new THREE.Mesh(geometry, material);
  terrainGroup.add(terrainMesh);

  // Wireframe
  const wireGeo = new THREE.WireframeGeometry(geometry);
  const wireMat = new THREE.LineBasicMaterial({ color: 0x333355, transparent: true, opacity: 0.3 });
  wireframeMesh = new THREE.LineSegments(wireGeo, wireMat);
  wireframeMesh.visible = chkWireframe.checked;
  terrainGroup.add(wireframeMesh);
}

// ─── Fit camera to terrain ───────────────────────────────────────────
function fitCamera() {
  if (!terrainMesh) return;
  const box = new THREE.Box3().setFromObject(terrainMesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 1.5;

  camera.position.set(dist * 0.5, -dist * 0.5, dist);
  controls.target.set(0, 0, 0);
  controls.update();
}

// ─── Pad elevation plane ─────────────────────────────────────────────
function getPadPlaneZ(): number {
  return parseFloat(inputPadElev.value) - terrainCenter.z;
}

function updatePadPlane() {
  if (padPlaneMesh) {
    scene.remove(padPlaneMesh);
    padPlaneMesh.geometry.dispose();
    (padPlaneMesh.material as THREE.Material).dispose();
    padPlaneMesh = null;
  }

  if (terrainPoints.length === 0) return;

  // Size the plane to cover the terrain bounding box with some margin
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of terrainPoints) {
    if (p.x - terrainCenter.x < minX) minX = p.x - terrainCenter.x;
    if (p.y - terrainCenter.y < minY) minY = p.y - terrainCenter.y;
    if (p.x - terrainCenter.x > maxX) maxX = p.x - terrainCenter.x;
    if (p.y - terrainCenter.y > maxY) maxY = p.y - terrainCenter.y;
  }

  const margin = 5;
  const w = (maxX - minX) + margin * 2;
  const h = (maxY - minY) + margin * 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const geo = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x44aa88,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  padPlaneMesh = new THREE.Mesh(geo, mat);
  padPlaneMesh.position.set(cx, cy, getPadPlaneZ());
  scene.add(padPlaneMesh);
}

inputPadElev.addEventListener('input', () => {
  updatePadPlane();
  updatePolygonVisuals();
});

// ─── Wireframe toggle ────────────────────────────────────────────────
chkWireframe.addEventListener('change', () => {
  if (wireframeMesh) wireframeMesh.visible = chkWireframe.checked;
});

// ─── Top view ────────────────────────────────────────────────────────
btnTopView.addEventListener('click', () => {
  if (!terrainMesh) return;
  const box = new THREE.Box3().setFromObject(terrainMesh);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y);
  camera.position.set(0, 0, maxDim * 2);
  camera.up.set(0, 1, 0);
  controls.target.set(0, 0, 0);
  controls.update();
});

// ─── Reset ───────────────────────────────────────────────────────────
btnReset.addEventListener('click', () => {
  polygonVertices = [];
  drawingMode = false;
  drawHint.style.display = 'none';
  btnDraw.textContent = 'Draw Polygon';
  btnCompute.disabled = true;
  resultsPanel.style.display = 'none';
  polygonGroup.clear();
  markerGroup.clear();

  // Reset terrain colors to gray
  if (terrainMesh) {
    const colors = terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i++) {
      colors.setXYZ(i, 0.6, 0.6, 0.6);
    }
    colors.needsUpdate = true;
  }

  statusEl.textContent = terrainPoints.length > 0
    ? `Loaded ${terrainPoints.length} points, ${tinTriangles.length / 3} triangles`
    : 'No terrain loaded';
});

// ─── Polygon drawing ─────────────────────────────────────────────────
btnDraw.addEventListener('click', () => {
  if (!drawingMode) {
    drawingMode = true;
    polygonVertices = [];
    polygonGroup.clear();
    markerGroup.clear();
    btnDraw.textContent = 'Cancel Drawing';
    btnCompute.disabled = true;
    drawHint.style.display = 'block';
    controls.enabled = false;

    // Auto-switch to top view for plan-view drawing
    if (terrainMesh) {
      const box = new THREE.Box3().setFromObject(terrainMesh);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y);
      camera.position.set(0, 0, maxDim * 2);
      camera.up.set(0, 1, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    }
  } else {
    drawingMode = false;
    drawHint.style.display = 'none';
    btnDraw.textContent = 'Draw Polygon';
    polygonGroup.clear();
    markerGroup.clear();
    polygonVertices = [];
    controls.enabled = true;
  }
});

// Raycaster for polygon drawing
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function getHorizontalIntersection(event: MouseEvent): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Intersect the horizontal plane at pad elevation
  const planeZ = getPadPlaneZ();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -planeZ);
  const target = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, target);
  return hit ? target : null;
}

function addPolygonVertex(worldPos: THREE.Vector3) {
  // Convert back to terrain coordinates
  const terrainX = worldPos.x + terrainCenter.x;
  const terrainY = worldPos.y + terrainCenter.y;
  polygonVertices.push({ x: terrainX, y: terrainY });

  // Add marker sphere on the pad plane
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xe94560 })
  );
  const pz = getPadPlaneZ() + 0.3;
  marker.position.set(worldPos.x, worldPos.y, pz);
  markerGroup.add(marker);

  // Update polygon line
  updatePolygonLine(false);

  statusEl.textContent = `Polygon: ${polygonVertices.length} vertices placed`;
}

function closePolygon() {
  if (polygonVertices.length < 3) {
    statusEl.textContent = 'Need at least 3 vertices';
    return;
  }

  drawingMode = false;
  drawHint.style.display = 'none';
  btnDraw.textContent = 'Draw Polygon';
  btnCompute.disabled = false;
  controls.enabled = true;

  updatePolygonLine(true);
  statusEl.textContent = `Polygon closed with ${polygonVertices.length} vertices`;
}

function updatePolygonVisuals() {
  updatePolygonLine(polygonVertices.length >= 3 && !drawingMode);
  // Update marker positions to match pad plane
  const pz = getPadPlaneZ() + 0.3;
  markerGroup.children.forEach(m => { m.position.z = pz; });
}

function updatePolygonLine(closed: boolean) {
  polygonGroup.clear();

  if (polygonVertices.length < 2) return;

  const pz = getPadPlaneZ() + 0.3;

  // Draw polygon flat on the pad elevation plane
  const linePoints: THREE.Vector3[] = polygonVertices.map(v =>
    new THREE.Vector3(v.x - terrainCenter.x, v.y - terrainCenter.y, pz)
  );

  if (closed) {
    linePoints.push(linePoints[0].clone());
  }

  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xe94560, linewidth: 2 });
  polygonGroup.add(new THREE.Line(lineGeo, lineMat));

  // If closed, also add a semi-transparent fill so the pad footprint is clearly visible
  if (closed && polygonVertices.length >= 3) {
    const shape = new THREE.Shape();
    const first = polygonVertices[0];
    shape.moveTo(first.x - terrainCenter.x, first.y - terrainCenter.y);
    for (let i = 1; i < polygonVertices.length; i++) {
      shape.lineTo(polygonVertices[i].x - terrainCenter.x, polygonVertices[i].y - terrainCenter.y);
    }
    shape.closePath();
    const fillGeo = new THREE.ShapeGeometry(shape);
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0xe94560,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const fillMesh = new THREE.Mesh(fillGeo, fillMat);
    fillMesh.position.z = pz - 0.1;
    polygonGroup.add(fillMesh);
  }
}

canvas.addEventListener('click', (e) => {
  if (!drawingMode) return;
  const pos = getHorizontalIntersection(e);
  if (pos) addPolygonVertex(pos);
});

canvas.addEventListener('dblclick', (e) => {
  if (!drawingMode) return;
  e.preventDefault();
  closePolygon();
});

// Prevent orbit controls from triggering on single click in draw mode
canvas.addEventListener('mousedown', (e) => {
  if (drawingMode) {
    e.stopPropagation();
  }
}, true);

// ─── Compute ─────────────────────────────────────────────────────────
btnCompute.addEventListener('click', () => {
  if (polygonVertices.length < 3) {
    statusEl.textContent = 'Draw a polygon first';
    return;
  }

  const padElev = parseFloat(inputPadElev.value);
  const slopeRatio = parseFloat(inputSlopeRatio.value);
  const slopeMaxDist = parseFloat(inputSlopeMaxDist.value);
  const gridSize = parseFloat(inputGridSize.value);

  if ([padElev, slopeRatio, slopeMaxDist, gridSize].some(isNaN)) {
    statusEl.textContent = 'Invalid parameter values';
    return;
  }

  statusEl.textContent = 'Computing volumes...';

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    const result = computeVolume(
      terrainPoints, tinTriangles, polygonVertices,
      padElev, slopeRatio, slopeMaxDist, gridSize
    );

    // Display results
    resultsPanel.style.display = 'block';
    document.getElementById('resCut')!.textContent = `${result.cut.toFixed(1)} m³`;
    document.getElementById('resFill')!.textContent = `${result.fill.toFixed(1)} m³`;
    document.getElementById('resNet')!.textContent = `${result.net.toFixed(1)} m³`;
    document.getElementById('resArea')!.textContent = `${result.areaSampled.toFixed(1)} m²`;
    document.getElementById('resCells')!.textContent = `${result.cellCount}`;

    statusEl.textContent = `Done. ${result.cellCount} cells sampled.`;

    // Colorize terrain
    colorizeTerrain(padElev, slopeRatio, slopeMaxDist);
  }, 10);
});

// ─── Colorize terrain ────────────────────────────────────────────────
function colorizeTerrain(padElev: number, slopeRatio: number, slopeMaxDist: number) {
  if (!terrainMesh) return;

  const colors = terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;

  // Find max dz for normalization
  let maxAbsDz = 0;
  const dzValues: (number | null)[] = [];

  for (let i = 0; i < terrainPoints.length; i++) {
    const p = terrainPoints[i];
    const zDesign = designHeight(p.x, p.y, polygonVertices, padElev, slopeRatio, slopeMaxDist);
    if (zDesign !== null) {
      const dz = zDesign - p.z;
      dzValues.push(dz);
      if (Math.abs(dz) > maxAbsDz) maxAbsDz = Math.abs(dz);
    } else {
      dzValues.push(null);
    }
  }

  if (maxAbsDz < 0.01) maxAbsDz = 1;

  for (let i = 0; i < terrainPoints.length; i++) {
    const dz = dzValues[i];
    if (dz === null) {
      colors.setXYZ(i, 0.4, 0.4, 0.4); // outside design area: dark gray
    } else {
      const t = Math.min(Math.abs(dz) / maxAbsDz, 1);
      if (dz < -0.01) {
        // Cut: red
        colors.setXYZ(i, 0.4 + 0.6 * t, 0.4 * (1 - t), 0.4 * (1 - t));
      } else if (dz > 0.01) {
        // Fill: blue
        colors.setXYZ(i, 0.4 * (1 - t), 0.4 * (1 - t), 0.4 + 0.6 * t);
      } else {
        // Neutral: green-ish
        colors.setXYZ(i, 0.3, 0.7, 0.3);
      }
    }
  }

  colors.needsUpdate = true;
}

// ─── Auto-suggest pad elevation from terrain ─────────────────────────
csvInput.addEventListener('change', () => {
  // After a small delay (let the main handler run first)
  setTimeout(() => {
    if (terrainPoints.length > 0) {
      const minZ = Math.min(...terrainPoints.map(p => p.z));
      inputPadElev.value = minZ.toFixed(1);
      updatePadPlane();
    }
  }, 100);
});
