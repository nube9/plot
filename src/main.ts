import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseCSV } from './csv';
import { buildTIN, terrainHeight } from './tin';
import { designHeight } from './design';
import { computeVolume } from './earthworks';
import { Point3D, Rectangle } from './types';

// ─── State ───────────────────────────────────────────────────────────
let terrainPoints: Point3D[] = [];
let tinTriangles: Uint32Array = new Uint32Array();
let terrainCenter = new THREE.Vector3();

// ─── DOM refs ────────────────────────────────────────────────────────
const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const container = document.getElementById('canvas-container') as HTMLDivElement;
const csvInput = document.getElementById('csvFile') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const btnCompute = document.getElementById('btnCompute') as HTMLButtonElement;
const btnTopView = document.getElementById('btnTopView') as HTMLButtonElement;
const btnReset = document.getElementById('btnReset') as HTMLButtonElement;
const chkWireframe = document.getElementById('chkWireframe') as HTMLInputElement;
const resultsPanel = document.getElementById('results') as HTMLDivElement;
const bodiesContainer = document.getElementById('bodies-container') as HTMLDivElement;
const btnAddBody = document.getElementById('btnAddBody') as HTMLButtonElement;
const inputGridSize = document.getElementById('gridSize') as HTMLInputElement;

// ─── Multi-body state ────────────────────────────────────────────────
let nextBodyId = 1;

interface BodyState {
  id: number;
  el: HTMLDivElement;
  x1: HTMLInputElement;
  y1: HTMLInputElement;
  x2: HTMLInputElement;
  y2: HTMLInputElement;
  elev: HTMLInputElement;
  height: HTMLInputElement;
  group: THREE.Group;
}

const bodies = new Map<number, BodyState>();

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
scene.add(terrainGroup);

let terrainMesh: THREE.Mesh | null = null;
let wireframeMesh: THREE.LineSegments | null = null;

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
    btnCompute.disabled = false;

    buildTerrainMesh();
    fitCamera();

    // Create first body if none exist
    if (bodies.size === 0) {
      const body = createBody();
      // Auto-suggest pad elevation from terrain
      const minZ = Math.min(...terrainPoints.map(p => p.z));
      body.elev.value = minZ.toFixed(1);
    }
  } catch (e: unknown) {
    statusEl.textContent = `Error: ${(e as Error).message}`;
  }
});

// ─── Build terrain mesh ──────────────────────────────────────────────
function buildTerrainMesh() {
  terrainGroup.clear();
  terrainMesh = null;
  wireframeMesh = null;

  const positions = new Float32Array(terrainPoints.length * 3);
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

// ─── Body management ─────────────────────────────────────────────────

function createBody(): BodyState {
  const id = nextBodyId++;

  const el = document.createElement('div');
  el.className = 'body-section';

  const header = document.createElement('div');
  header.className = 'body-header';
  const title = document.createElement('span');
  title.textContent = `Body ${id}`;
  header.appendChild(title);

  const btnRemove = document.createElement('button');
  btnRemove.className = 'btn-remove';
  btnRemove.textContent = 'Remove';
  btnRemove.addEventListener('click', () => removeBody(id));
  header.appendChild(btnRemove);

  el.appendChild(header);

  // Helper to create a number input
  function makeInput(placeholder: string, value?: string): HTMLInputElement {
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.placeholder = placeholder;
    if (value !== undefined) inp.value = value;
    inp.addEventListener('input', debouncedUpdateAllVisuals);
    return inp;
  }

  // Corner 1
  const lbl1 = document.createElement('label');
  lbl1.textContent = 'Corner 1';
  el.appendChild(lbl1);

  const row1 = document.createElement('div');
  row1.className = 'coord-row';
  const x1 = makeInput('X1');
  const y1 = makeInput('Y1');
  const d1a = document.createElement('div');
  d1a.appendChild(x1);
  const d1b = document.createElement('div');
  d1b.appendChild(y1);
  row1.appendChild(d1a);
  row1.appendChild(d1b);
  el.appendChild(row1);

  // Corner 2
  const lbl2 = document.createElement('label');
  lbl2.textContent = 'Corner 2';
  el.appendChild(lbl2);

  const row2 = document.createElement('div');
  row2.className = 'coord-row';
  const x2 = makeInput('X2');
  const y2 = makeInput('Y2');
  const d2a = document.createElement('div');
  d2a.appendChild(x2);
  const d2b = document.createElement('div');
  d2b.appendChild(y2);
  row2.appendChild(d2a);
  row2.appendChild(d2b);
  el.appendChild(row2);

  // Elevation
  const lblElev = document.createElement('label');
  lblElev.textContent = 'Pad Elevation (m)';
  el.appendChild(lblElev);
  const elev = makeInput('Elevation', '100');
  elev.step = '0.1';
  el.appendChild(elev);

  // Height
  const lblHeight = document.createElement('label');
  lblHeight.textContent = 'Pad Height (m)';
  el.appendChild(lblHeight);
  const height = makeInput('Height', '3');
  height.step = '0.1';
  height.min = '0';
  el.appendChild(height);

  bodiesContainer.appendChild(el);

  const group = new THREE.Group();
  scene.add(group);

  const body: BodyState = { id, el, x1, y1, x2, y2, elev, height, group };
  bodies.set(id, body);

  updateRemoveButtons();
  return body;
}

function removeBody(id: number) {
  const body = bodies.get(id);
  if (!body) return;

  body.el.remove();
  scene.remove(body.group);
  bodies.delete(id);

  updateRemoveButtons();
  debouncedUpdateAllVisuals();
}

function updateRemoveButtons() {
  const showRemove = bodies.size > 1;
  for (const body of bodies.values()) {
    const btn = body.el.querySelector('.btn-remove') as HTMLButtonElement | null;
    if (btn) btn.style.display = showRemove ? '' : 'none';
  }
}

function readBodies(): Rectangle[] {
  const rects: Rectangle[] = [];
  for (const body of bodies.values()) {
    const x1 = parseFloat(body.x1.value);
    const y1 = parseFloat(body.y1.value);
    const x2 = parseFloat(body.x2.value);
    const y2 = parseFloat(body.y2.value);
    const elev = parseFloat(body.elev.value);
    if ([x1, y1, x2, y2, elev].some(isNaN)) continue;

    const ph = parseFloat(body.height.value);
    rects.push({
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
      elevation: elev,
      padHeight: isNaN(ph) ? 0 : ph,
    });
  }
  return rects;
}

// ─── Visualize bodies in 3D ──────────────────────────────────────────

function drawFlatRect(rect: Rectangle, group: THREE.Group) {
  const z = rect.elevation - terrainCenter.z + 0.3;
  const cx = terrainCenter.x;
  const cy = terrainCenter.y;

  const corners = [
    new THREE.Vector3(rect.minX - cx, rect.minY - cy, z),
    new THREE.Vector3(rect.maxX - cx, rect.minY - cy, z),
    new THREE.Vector3(rect.maxX - cx, rect.maxY - cy, z),
    new THREE.Vector3(rect.minX - cx, rect.maxY - cy, z),
    new THREE.Vector3(rect.minX - cx, rect.minY - cy, z),
  ];

  const lineGeo = new THREE.BufferGeometry().setFromPoints(corners);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xe94560, linewidth: 2 });
  group.add(new THREE.Line(lineGeo, lineMat));

  const w = rect.maxX - rect.minX;
  const h = rect.maxY - rect.minY;
  const fillGeo = new THREE.PlaneGeometry(w, h);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xe94560,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.position.set(
    (rect.minX + rect.maxX) / 2 - cx,
    (rect.minY + rect.maxY) / 2 - cy,
    z - 0.1
  );
  group.add(fillMesh);
}

function drawBox(rect: Rectangle, group: THREE.Group) {
  const cx = terrainCenter.x;
  const cy = terrainCenter.y;
  const cz = terrainCenter.z;

  const w = rect.maxX - rect.minX;
  const d = rect.maxY - rect.minY;
  const h = rect.padHeight;

  // Adaptive subdivision: ~0.5m horizontal, ~0.3m vertical, capped at 60
  const sx = Math.min(Math.max(Math.ceil(w / 0.5), 1), 60);
  const sy = Math.min(Math.max(Math.ceil(d / 0.5), 1), 60);
  const sz = Math.min(Math.max(Math.ceil(h / 0.3), 1), 60);

  const boxGeo = new THREE.BoxGeometry(w, d, h, sx, sy, sz);

  // BoxGeometry is centered at origin — position so bottom face sits at pad elevation
  const centerX = (rect.minX + rect.maxX) / 2 - cx;
  const centerY = (rect.minY + rect.maxY) / 2 - cy;
  const centerZ = rect.elevation + h / 2 - cz;

  const posAttr = boxGeo.getAttribute('position');
  const vertCount = posAttr.count;
  const colors = new Float32Array(vertCount * 3);

  // White and amber colors
  const whiteR = 1.0, whiteG = 1.0, whiteB = 1.0;
  const amberR = 0.9, amberG = 0.6, amberB = 0.15;

  for (let i = 0; i < vertCount; i++) {
    const lx = posAttr.getX(i);
    const ly = posAttr.getY(i);
    const lz = posAttr.getZ(i);

    const worldX = lx + centerX + cx;
    const worldY = ly + centerY + cy;
    const worldZ = lz + centerZ + cz;

    const tHeight = terrainHeight(worldX, worldY, terrainPoints, tinTriangles);

    if (tHeight !== null && worldZ < tHeight) {
      colors[i * 3] = amberR;
      colors[i * 3 + 1] = amberG;
      colors[i * 3 + 2] = amberB;
    } else {
      colors[i * 3] = whiteR;
      colors[i * 3 + 1] = whiteG;
      colors[i * 3 + 2] = whiteB;
    }
  }

  boxGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const boxMat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const boxMesh = new THREE.Mesh(boxGeo, boxMat);
  boxMesh.position.set(centerX, centerY, centerZ);
  group.add(boxMesh);

  // Edge lines — only show the 12 box edges, not subdivision grid
  const edgesGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, d, h), 15);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x333355 });
  const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);
  edgesMesh.position.set(centerX, centerY, centerZ);
  group.add(edgesMesh);
}

function updateBodyVisual(body: BodyState) {
  body.group.clear();

  if (terrainPoints.length === 0) return;

  const x1 = parseFloat(body.x1.value);
  const y1 = parseFloat(body.y1.value);
  const x2 = parseFloat(body.x2.value);
  const y2 = parseFloat(body.y2.value);
  const elev = parseFloat(body.elev.value);
  if ([x1, y1, x2, y2, elev].some(isNaN)) return;

  const ph = parseFloat(body.height.value);
  const rect: Rectangle = {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
    elevation: elev,
    padHeight: isNaN(ph) ? 0 : ph,
  };

  if (rect.padHeight < 0.01) {
    drawFlatRect(rect, body.group);
  } else {
    drawBox(rect, body.group);
  }
}

function updateAllVisuals() {
  for (const body of bodies.values()) {
    updateBodyVisual(body);
  }
}

// Debounce helper
let visualUpdateTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedUpdateAllVisuals() {
  if (visualUpdateTimer) clearTimeout(visualUpdateTimer);
  visualUpdateTimer = setTimeout(updateAllVisuals, 100);
}

// "Add Body" button
btnAddBody.addEventListener('click', () => createBody());

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
  resultsPanel.style.display = 'none';
  for (const body of bodies.values()) body.group.clear();

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

// ─── Compute ─────────────────────────────────────────────────────────
btnCompute.addEventListener('click', () => {
  const allBodies = readBodies();
  if (allBodies.length === 0) {
    statusEl.textContent = 'Enter valid coordinates and elevation for at least one body';
    return;
  }

  const gridSize = parseFloat(inputGridSize.value);
  if (isNaN(gridSize) || gridSize <= 0) {
    statusEl.textContent = 'Invalid grid size';
    return;
  }

  statusEl.textContent = 'Computing volumes...';
  updateAllVisuals();

  setTimeout(() => {
    const result = computeVolume(terrainPoints, tinTriangles, allBodies, gridSize);

    resultsPanel.style.display = 'block';
    document.getElementById('resCut')!.textContent = `${result.cut.toFixed(1)} m³`;
    document.getElementById('resFill')!.textContent = `${result.fill.toFixed(1)} m³`;
    document.getElementById('resNet')!.textContent = `${result.net.toFixed(1)} m³`;
    document.getElementById('resArea')!.textContent = `${result.areaSampled.toFixed(1)} m²`;
    document.getElementById('resCells')!.textContent = `${result.cellCount}`;

    statusEl.textContent = `Done. ${result.cellCount} cells sampled.`;

    colorizeTerrain(allBodies);
  }, 10);
});

// ─── Colorize terrain ────────────────────────────────────────────────
function colorizeTerrain(allBodies: Rectangle[]) {
  if (!terrainMesh) return;

  const colors = terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;

  let maxAbsDz = 0;
  const dzValues: (number | null)[] = [];

  for (let i = 0; i < terrainPoints.length; i++) {
    const p = terrainPoints[i];
    const zDesign = designHeight(p.x, p.y, allBodies);
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
      colors.setXYZ(i, 0.4, 0.4, 0.4); // outside: dark gray
    } else {
      const t = Math.min(Math.abs(dz) / maxAbsDz, 1);
      if (dz < -0.01) {
        // Cut: red
        colors.setXYZ(i, 0.4 + 0.6 * t, 0.4 * (1 - t), 0.4 * (1 - t));
      } else if (dz > 0.01) {
        // Fill: blue
        colors.setXYZ(i, 0.4 * (1 - t), 0.4 * (1 - t), 0.4 + 0.6 * t);
      } else {
        // Neutral: green
        colors.setXYZ(i, 0.3, 0.7, 0.3);
      }
    }
  }

  colors.needsUpdate = true;
}
