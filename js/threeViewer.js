// js/threeViewer.js
// Камера и управление — 100% поведение 8.html.

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

let currentModel = null;
// ===== CAD overlay (точки/линии для врезок) =====
let cadGroup = null;
let cadScene = null;
// ===== Inset blend (70..100) =====
let insetBlendEnabled = false;
let insetBlendFactor = 0;           // 0..1 (0 = только passA, 1 = только passB)
let insetControlledMaterials = [];  // материалы, которые делаем opaque во втором проходе

let rtA = null;
let rtB = null;
let postScene = null;
let postCam = null;
let postQuad = null;

const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,

  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00,
};

export function initThree(canvas) {
scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);

// CAD overlay: отдельная сцена, рисуется вторым проходом поверх всего
cadScene = new THREE.Scene();
cadGroup = new THREE.Group();
cadGroup.name = "cad-overlay";
cadScene.add(cadGroup);

  camera = new THREE.PerspectiveCamera(
    40,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );

  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  setupLights();
  initControls(canvas);

  renderer.setAnimationLoop(() => {
    state.rotX += (state.targetRotX - state.rotX) * 0.22;
    state.rotY += (state.targetRotY - state.rotY) * 0.22;

    updateCameraPosition();
if (insetBlendEnabled) {
  renderWithInsetBlend();  // ✅ всегда через композит, даже при 0 и 1
} else {
  renderer.render(scene, camera);

  // ✅ CAD поверх всего (в обычном режиме)
  if (cadScene && cadGroup && cadGroup.children.length) {
    renderer.clearDepth();
    renderer.render(cadScene, camera);
  }
}
  });
}

export function setModel(root) {
  if (currentModel) {
    scene.remove(currentModel);
  }

  currentModel = root;
  scene.add(currentModel);

  state.targetRotX = 0.10;
  state.targetRotY = 0.00;

  fitCameraToModel(root);
}

function fitCameraToModel(root) {
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius || 1;

  const fovRad = camera.fov * Math.PI / 180;
  let dist = radius / Math.sin(fovRad / 2);

  const isMobile = /Android|webOS|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) dist *= 1.55;

  state.radius = dist;
  state.minRadius = dist * 0.4;
  state.maxRadius = dist * 6.0;
}

function updateCameraPosition() {
  const r = state.radius;

  const x = r * Math.sin(state.rotY) * Math.cos(state.rotX);
  const z = r * Math.cos(state.rotY) * Math.cos(state.rotX);
  const y = r * Math.sin(state.rotX);

  camera.position.set(x, y, z);
  camera.lookAt(0, 0, 0);
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
    // чтобы RenderTarget пересоздались под новый размер
  if (insetBlendEnabled) {
    ensureBlendResources();
  }
}

// Включаем/выключаем режим смешивания (используется ТОЛЬКО во врезках)
export function setInsetBlendEnabled(enabled) {
  insetBlendEnabled = !!enabled;
}

// Обновляем фактор смешивания и список материалов, которые должны стать opaque во 2-м проходе
export function setInsetBlendState(factor01, controlledMats) {
  insetBlendFactor = THREE.MathUtils.clamp(Number(factor01) || 0, 0, 1);
  insetControlledMaterials = Array.isArray(controlledMats) ? controlledMats : [];
}

// ===============================
// CAD overlay API (для врезок)
// ===============================
export function clearCadOverlay() {
  if (!cadGroup) return;

  for (const child of cadGroup.children) {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }

  cadGroup.clear();
}

export function setCadOverlay(spec) {
  clearCadOverlay();
  if (!cadGroup) return;
  if (!spec || !Array.isArray(spec.points) || spec.points.length === 0) return;

  // карта точек id -> Vector3
  const pointMap = new Map();
  for (const p of spec.points) {
    pointMap.set(String(p.id), new THREE.Vector3(p.x, p.y, p.z));
  }

  // ---- точки ----
  const pos = new Float32Array(spec.points.length * 3);
  spec.points.forEach((p, i) => {
    pos[i * 3 + 0] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
  });

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const pointsMat = new THREE.PointsMaterial({
    color: 0x2f6bff,
    size: 8,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false
  });

  const pointsObj = new THREE.Points(pointsGeo, pointsMat);
  pointsObj.renderOrder = 2000;
  cadGroup.add(pointsObj);

  // ---- линии ----
  if (Array.isArray(spec.lines) && spec.lines.length) {
    const linePos = [];

    for (const seg of spec.lines) {
      const a = pointMap.get(String(seg[0]));
      const b = pointMap.get(String(seg[1]));
      if (!a || !b) continue;

      linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }

    if (linePos.length) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(linePos), 3)
      );

      const lineMat = new THREE.LineBasicMaterial({
        color: 0x2f6bff,
        depthTest: false,
        depthWrite: false
      });

      const linesObj = new THREE.LineSegments(lineGeo, lineMat);
      linesObj.renderOrder = 1999;
      cadGroup.add(linesObj);
    }
  }
}

function ensureBlendResources() {
  if (!renderer) return;

const size = new THREE.Vector2();
renderer.getDrawingBufferSize(size);  // ✅ ВАЖНО: именно drawing buffer, а не CSS size
const w = Math.max(1, Math.floor(size.x));
const h = Math.max(1, Math.floor(size.y));

  // RT параметры (чтобы не было странного пересвета)
  const params = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  };

  if (!rtA || rtA.width !== w || rtA.height !== h) {
    rtA?.dispose?.();
    rtA = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!rtB || rtB.width !== w || rtB.height !== h) {
    rtB?.dispose?.();
    rtB = new THREE.WebGLRenderTarget(w, h, params);
  }
  // ✅ MSAA (работает в WebGL2, в Telegram чаще всего WebGL2 есть)
rtA.samples = 4;
rtB.samples = 4;

  if (!postScene) {
    postScene = new THREE.Scene();
    postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uMix: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
fragmentShader: `
  precision highp float;

  varying vec2 vUv;
  uniform sampler2D tA;
  uniform sampler2D tB;
  uniform float uMix;

  // Простой вывод в sRGB (примерно как у three при output = sRGB)
  vec3 toSRGB(vec3 c) {
    return pow(max(c, 0.0), vec3(1.0 / 2.2));
  }

  void main() {
    vec4 a = texture2D(tA, vUv);
    vec4 b = texture2D(tB, vUv);

    vec4 c = mix(a, b, clamp(uMix, 0.0, 1.0));

    gl_FragColor = vec4(toSRGB(c.rgb), c.a);
  }
`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    postQuad = new THREE.Mesh(geo, mat);
    postScene.add(postQuad);
  }
}

function renderWithInsetBlend() {
  if (!renderer || !camera) return;

  ensureBlendResources();

  // 1) Pass A: как есть (обычно это “прозрачность на 70%”)
  renderer.setRenderTarget(rtA);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  // 2) Pass B: временно делаем контролируемые материалы полностью opaque
  const saved = [];
  for (const m of insetControlledMaterials) {
    if (!m) continue;
    saved.push({
      m,
      transparent: m.transparent,
      opacity: m.opacity,
      depthWrite: m.depthWrite,
      depthTest: m.depthTest,
    });

    m.transparent = false;
    m.opacity = 1;
    m.depthWrite = true;
    m.depthTest = true;
    m.needsUpdate = true;
  }

  renderer.setRenderTarget(rtB);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  // 3) Возвращаем материалы обратно
  for (const s of saved) {
    const m = s.m;
    m.transparent = s.transparent;
    m.opacity = s.opacity;
    m.depthWrite = s.depthWrite;
    m.depthTest = s.depthTest;
    m.needsUpdate = true;
  }

  // 4) Финальный вывод: смешиваем 2 текстуры на экран
  renderer.setRenderTarget(null);

  postQuad.material.uniforms.tA.value = rtA.texture;
  postQuad.material.uniforms.tB.value = rtB.texture;
  postQuad.material.uniforms.uMix.value = insetBlendFactor;

  renderer.clear(true, true, true);
  renderer.render(postScene, postCam);
    // ✅ CAD поверх итогового композита (inset-blend)
  if (cadScene && cadGroup && cadGroup.children.length) {
    renderer.clearDepth();
    renderer.render(cadScene, camera);
  }
}

function setupLights() {
  const zenith = new THREE.DirectionalLight(0xf5f8ff, 0.0);
  zenith.position.set(0, 11, 2);
  scene.add(zenith);

  const key = new THREE.DirectionalLight(0xffc4a0, 1.85);
  key.position.set(5.5, 6.0, 3.5);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xcad8ff, 0.35);
  fill.position.set(-7, 3.5, 2);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(-3.5, 5, -7.5);
  scene.add(rim);

  const coldRim = new THREE.DirectionalLight(0xd8e4ff, 0.1);
  coldRim.position.set(2.5, 3.5, -5);
  scene.add(coldRim);

  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 0.07));
}

function initControls(canvas) {
  let dragging = false;
  let lastX = 0, lastY = 0;

  let touchMode = null;
  let lastPinch = 0;

  canvas.addEventListener("mousedown", (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener("mouseup", () => dragging = false);

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    lastX = e.clientX;
    lastY = e.clientY;

    state.targetRotY += dx * -0.005;
    state.targetRotX += dy * 0.005;

    state.targetRotX = Math.max(
      -Math.PI / 2 + 0.2,
      Math.min(Math.PI / 2 - 0.2, state.targetRotX)
    );
  });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();

    const delta = e.deltaY * 0.002;

    state.radius = THREE.MathUtils.clamp(
      state.radius + delta,
      state.minRadius,
      state.maxRadius
    );
  }, { passive: false });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();

    if (e.touches.length === 1) {
      touchMode = "rotate";
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      touchMode = "zoom";
      lastPinch = pinch(e.touches[0], e.touches[1]);
    }
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    if (!touchMode) return;
    e.preventDefault();

    if (touchMode === "rotate" && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;

      lastX = t.clientX;
      lastY = t.clientY;

      state.targetRotY += dx * -0.008;
      state.targetRotX += dy * 0.008;

      state.targetRotX = Math.max(
        -Math.PI / 2 + 0.2,
        Math.min(Math.PI / 2 - 0.2, state.targetRotX)
      );
    }

    if (touchMode === "zoom" && e.touches.length === 2) {
      const dist = pinch(e.touches[0], e.touches[1]);
      const delta = (lastPinch - dist) * 0.01;

      lastPinch = dist;

      state.radius = THREE.MathUtils.clamp(
        state.radius + delta,
        state.minRadius,
               state.maxRadius
      );
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    touchMode = null;
  });

  function pinch(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
