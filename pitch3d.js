/* =========================================================
   FPL Command Center v13 — pitch3d.js
   Voxel 3D pitch view (Three.js)
   ========================================================= */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene3d = null;
let camera3d = null;
let renderer3d = null;
let controls3d = null;
let pitchGroup = null;
let animationId = null;
let currentCanvasId = null;
let isDragging = false;

const PITCH_W = 68;
const PITCH_H = 105;

const POS_COLOR = { GK: 0xffb92e, DEF: 0x3b82f6, MID: 0x00ff87, FWD: 0xff2882 };

function zForPos(pos) {
  switch (pos) {
    case 'GK':  return -PITCH_H * 0.42;
    case 'DEF': return -PITCH_H * 0.22;
    case 'MID': return  PITCH_H * 0.05;
    case 'FWD': return  PITCH_H * 0.30;
    default:    return  0;
  }
}
function xForIndex(i, total) {
  if (total === 1) return 0;
  const spacing = 14;
  const start = -((total - 1) * spacing) / 2;
  return start + i * spacing;
}

function makePlayerBlock(player, isCaptain, isVice) {
  const group = new THREE.Group();
  const size = 3.2;
  const color = POS_COLOR[player.pos] || 0xffffff;
  const bodyGeom = new THREE.BoxGeometry(size, size * 2.2, size);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.position.y = size * 1.1;
  group.add(body);

  const headGeom = new THREE.BoxGeometry(size * 0.85, size * 0.85, size * 0.85);
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const head = new THREE.Mesh(headGeom, headMat);
  head.position.y = size * 2.6;
  group.add(head);

  if (player.photo) {
    const loader = new THREE.TextureLoader();
    loader.crossOrigin = 'anonymous';
    loader.load(
      player.photo,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const faceMat = new THREE.MeshLambertMaterial({ map: tex });
        head.material = [headMat, headMat, headMat, headMat, faceMat, headMat];
      },
      undefined,
      () => {}
    );
  }

  if (isCaptain || isVice) {
    const badgeGeom = new THREE.BoxGeometry(size * 0.5, size * 0.5, size * 0.5);
    const badgeMat = new THREE.MeshBasicMaterial({ color: isCaptain ? 0xffb92e : 0x04f5ff });
    const badge = new THREE.Mesh(badgeGeom, badgeMat);
    badge.position.y = size * 3.6;
    badge.userData.badgeSpin = true;
    group.add(badge);
  }

  const ringGeom = new THREE.CylinderGeometry(size * 0.7, size * 0.7, 0.3, 16);
  const ringMat = new THREE.MeshLambertMaterial({ color: POS_COLOR[player.pos] || 0xffffff, transparent: true, opacity: 0.5 });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.position.y = 0.15;
  group.add(ring);

  group.userData.player = player;
  return group;
}

function makePitch() {
  const group = new THREE.Group();
  const grassGeom = new THREE.BoxGeometry(PITCH_W + 8, 0.6, PITCH_H + 8);
  const grassMat = new THREE.MeshLambertMaterial({ color: 0x0d7a3d });
  const grass = new THREE.Mesh(grassGeom, grassMat);
  grass.position.y = -0.3;
  group.add(grass);

  for (let i = 0; i < 8; i++) {
    const stripeGeom = new THREE.BoxGeometry(PITCH_W, 0.05, PITCH_H / 8);
    const stripeMat = new THREE.MeshLambertMaterial({ color: 0x0a5c2e });
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.set(0, 0.03, -PITCH_H / 2 + (i + 0.5) * (PITCH_H / 8));
    group.add(stripe);
  }

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const addLine = (w, h, x, z) => {
    const g = new THREE.BoxGeometry(w, 0.08, h);
    const m = new THREE.Mesh(g, lineMat);
    m.position.set(x, 0.06, z);
    group.add(m);
  };
  const LW = 0.4;
  addLine(PITCH_W, LW, 0, -PITCH_H / 2);
  addLine(PITCH_W, LW, 0,  PITCH_H / 2);
  addLine(LW, PITCH_H, -PITCH_W / 2, 0);
  addLine(LW, PITCH_H,  PITCH_W / 2, 0);
  addLine(PITCH_W, LW, 0, 0);

  const segs = 24;
  const r = 9.15;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const nextA = ((i + 1) / segs) * Math.PI * 2;
    const x1 = Math.cos(a) * r, z1 = Math.sin(a) * r;
    const x2 = Math.cos(nextA) * r, z2 = Math.sin(nextA) * r;
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.sqrt(dx * dx + dz * dz);
    const g = new THREE.BoxGeometry(len, 0.08, 0.25);
    const m = new THREE.Mesh(g, lineMat);
    m.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2);
    m.rotation.y = -Math.atan2(dz, dx);
    group.add(m);
  }

  const boxW = 40.3, boxD = 16.5;
  [-1, 1].forEach(sign => {
    const bz = sign * (PITCH_H / 2);
    const innerZ = bz - sign * boxD;
    addLine(boxW, LW, 0, innerZ);
    addLine(LW, boxD, -boxW / 2, bz - sign * boxD / 2);
    addLine(LW, boxD,  boxW / 2, bz - sign * boxD / 2);
  });

  return group;
}

function init3D(canvas) {
  if (renderer3d) dispose3D();
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x0d0221);
  camera3d = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera3d.position.set(0, 70, 65);
  camera3d.lookAt(0, 0, 0);
  renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer3d.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene3d.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(30, 80, 40);
  scene3d.add(sun);
  controls3d = new OrbitControls(camera3d, canvas);
  controls3d.enableDamping = true;
  controls3d.dampingFactor = 0.08;
  controls3d.minDistance = 30;
  controls3d.maxDistance = 180;
  controls3d.maxPolarAngle = Math.PI / 2.1;
  controls3d.target.set(0, 0, 0);
  controls3d.addEventListener('start', () => { isDragging = true; });
  controls3d.addEventListener('end',   () => { isDragging = false; });
  pitchGroup = new THREE.Group();
  pitchGroup.add(makePitch());
  scene3d.add(pitchGroup);
}

function dispose3D() {
  if (animationId) cancelAnimationFrame(animationId);
  animationId = null;
  if (controls3d) controls3d.dispose();
  if (renderer3d) renderer3d.dispose();
  if (scene3d) {
    scene3d.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    });
  }
  scene3d = null; camera3d = null; renderer3d = null; controls3d = null;
}

function resize3D() {
  const canvas = document.getElementById(currentCanvasId);
  if (!canvas || !renderer3d || !camera3d) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
  renderer3d.setSize(w, h);
}

function loop3D() {
  animationId = requestAnimationFrame(loop3D);
  if (controls3d) controls3d.update();
  if (!isDragging && pitchGroup) {
    pitchGroup.traverse(obj => {
      if (obj.userData && obj.userData.badgeSpin) obj.rotation.y += 0.03;
    });
  }
  if (renderer3d && scene3d && camera3d) renderer3d.render(scene3d, camera3d);
}

window.renderSquad3D = function(canvasId, players, formation) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!canvas.clientWidth || !canvas.clientHeight) {
    setTimeout(() => window.renderSquad3D(canvasId, players, formation), 100);
    return;
  }
  if (currentCanvasId !== canvasId) {
    dispose3D();
    currentCanvasId = canvasId;
    init3D(canvas);
  }
  if (pitchGroup) {
    const toRemove = [];
    pitchGroup.children.forEach(child => {
      if (child.userData && child.userData.player) toRemove.push(child);
    });
    toRemove.forEach(c => {
      c.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      pitchGroup.remove(c);
    });
  }
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  players.forEach(p => { if (byPos[p.pos]) byPos[p.pos].push(p); });
  Object.entries(byPos).forEach(([pos, list]) => {
    const z = zForPos(pos);
    list.forEach((player, i) => {
      const x = xForIndex(i, list.length);
      const block = makePlayerBlock(player, player.captain, player.vice);
      block.position.set(x, 0, z);
      pitchGroup.add(block);
    });
  });
  if (!animationId) loop3D();
  resize3D();
  if (!window._pitch3dResizeBound) {
    window._pitch3dResizeBound = true;
    window.addEventListener('resize', resize3D);
    window.addEventListener('orientationchange', () => setTimeout(resize3D, 300));
  }
};

window.disposeSquad3D = function() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
};
