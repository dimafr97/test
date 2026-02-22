// js/threeViewer.js
// OIT (Weighted Blended) для "Врезок" + обычный рендер для остальных режимов.
// three r153 compatible.

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

let currentModel = null;

// ===== OIT state =====
let oitEnabled = false;

let opaqueRT = null;
let accumRT = null;
let revealRT = null;

let quadScene = null;
let quadCamera = null;
let quadMesh = null;

let accumMat = null;
let revealMat = null;
let accumUniforms = null;
let revealUniforms = null;
let compositeMat = null;

const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,

  rotX: 0.10,
  rotY: 0.00,
  targetRotX: 0.10,
  targetRotY: 0.00,
};

export function setOitEnabled(v) {
  oitEnabled = !!v;
  if (oitEnabled) ensureOitTargets();
}

export function initThree(canvas) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);

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
    alpha: false,
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

    if (!oitEnabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
    } else {
      renderOit();
    }
  });
}

export function setModel(root) {
  if (currentModel) scene.remove(currentModel);

  currentModel = root;
  scene.add(currentModel);
    // ✅ чтобы OIT брал цвет/opacity из материала на каждом меше
  attachOitPerMeshUniforms(currentModel);

  state.targetRotX = 0.10;
  state.targetRotY = 0.00;

  fitCameraToModel(root);
}

// ===== OIT render =====

function renderOit() {
  if (!currentModel) {
    renderer.setRenderTarget(null);
    renderer.clear();
    return;
  }

  ensureOitTargets();

  // 1) Opaque pass: всё, что НЕ помечено как oitTransparent
  setVisibilityForOit(false);

  renderer.setRenderTarget(opaqueRT);
  renderer.setClearColor(0x050506, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);

  // 2) Accum pass: только oitTransparent
  setVisibilityForOit(true);
  hookUniformsForTransparent(true);

  renderer.setRenderTarget(accumRT);
  // важно: чистим в 0
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);

  scene.overrideMaterial = accumMat;
  renderer.render(scene, camera);

  // 3) Reveal pass: только oitTransparent
  renderer.setRenderTarget(revealRT);
  // важно: чистим в 1 (white)
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, false, false);

  scene.overrideMaterial = revealMat;
  renderer.render(scene, camera);

  // restore
  scene.overrideMaterial = null;
  hookUniformsForTransparent(false);
  setVisibilityForOit(null);

  // 4) Composite на экран
  compositeMat.uniforms.tOpaque.value = opaqueRT.texture;
  compositeMat.uniforms.tAccum.value = accumRT.texture;
  compositeMat.uniforms.tReveal.value = revealRT.texture;

  renderer.setRenderTarget(null);
  renderer.setClearColor(0x050506, 1);
  renderer.clear(true, true, false);
  renderer.render(quadScene, quadCamera);
}

// mode:
// true  -> показываем только oitTransparent
// false -> показываем только НЕ oitTransparent
// null  -> показываем всё
function setVisibilityForOit(mode) {
  currentModel.traverse((obj) => {
    if (!obj.isMesh) return;

    const isOit = !!obj.userData.oitTransparent;

    if (mode === true) obj.visible = isOit;
    else if (mode === false) obj.visible = !isOit;
    else obj.visible = true;
  });
}

// ВАЖНО: не ставим onBeforeRender = null.
// Если хотим "снять" хук — делаем delete obj.onBeforeRender (чтобы вернуться к прототипу).
function hookUniformsForTransparent(enable) {
  if (!currentModel) return;

  if (!enable) {
    currentModel.traverse((obj) => {
      if (!obj.isMesh) return;
      if (obj.userData._oitHooked) {
        delete obj.onBeforeRender;
        obj.userData._oitHooked = false;
      }
    });
    return;
  }

  currentModel.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!obj.userData.oitTransparent) return;

    // ставим один раз
    if (obj.userData._oitHooked) return;
    obj.userData._oitHooked = true;

    obj.onBeforeRender = () => {
      const idx = (obj.userData && Number.isInteger(obj.userData._oitMatIndex))
  ? obj.userData._oitMatIndex
  : 0;

const mat = Array.isArray(obj.material) ? obj.material[idx] : obj.material;

      // берём цвет материала (без текстур — как у тебя)
      if (mat?.color) {
        accumMat.uniforms.uColor.value.copy(mat.color);
      } else {
        accumMat.uniforms.uColor.value.set(1, 1, 1);
      }

      const op = (mat?.opacity ?? 1.0);
      accumMat.uniforms.uOpacity.value = op;
      revealMat.uniforms.uOpacity.value = op;
    };
  });
}

function ensureOitTargets() {
  if (!renderer) return;

  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));

  if (opaqueRT && opaqueRT.width === w && opaqueRT.height === h) return;

  disposeOitTargets();

  // Opaque RT (с depth)
  opaqueRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  opaqueRT.texture.name = "oit_opaque";

  // Accum + Reveal RT (без depth)
  // Для начала UnsignedByteType — максимально совместимо в WebView.
  accumRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  accumRT.texture.name = "oit_accum";

  revealRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
  });
  revealRT.texture.name = "oit_reveal";

  buildOitMaterials();
  buildQuad();
}

function disposeOitTargets() {
  if (opaqueRT) opaqueRT.dispose();
  if (accumRT) accumRT.dispose();
  if (revealRT) revealRT.dispose();
  opaqueRT = accumRT = revealRT = null;
}

function buildOitMaterials() {
  // УПРОЩЁННЫЙ, но “объёмный” шейдинг (без “стекла”, без преломления):
  // diffuse + небольшой ambient, под наши Directional lights.
  // Это нужно, чтобы объём не пропадал на прозрачных.

  const vs = /* glsl */ `
    varying vec3 vNormalW;
    varying vec3 vPosW;

    void main() {
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vPosW = worldPos.xyz;

      // нормаль в мировых координатах
      vNormalW = normalize(mat3(modelMatrix) * normal);

      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `;

  const fsLighting = /* glsl */ `
    precision highp float;

    varying vec3 vNormalW;
    varying vec3 vPosW;

    uniform vec3 uColor;
    uniform float uOpacity;

    // направления света (приблизительно как в setupLights)
    // можно потом подстроить, если захочешь
    vec3 lightDir(vec3 p, vec3 lp){
      return normalize(lp - p);
    }

    void main() {
      vec3 N = normalize(vNormalW);

      // DoubleSide: если смотрим на обратную сторону — разворачиваем нормаль
      // (иначе “задние грани” темнеют/исчезают)
      if (!gl_FrontFacing) N = -N;

      // Позиции источников (как у тебя)
      vec3 keyPos = vec3(5.5, 6.0, 3.5);
      vec3 fillPos = vec3(-7.0, 3.5, 2.0);
      vec3 rimPos = vec3(-3.5, 5.0, -7.5);

      vec3 Lk = lightDir(vPosW, keyPos);
      vec3 Lf = lightDir(vPosW, fillPos);
      vec3 Lr = lightDir(vPosW, rimPos);

      float dk = max(dot(N, Lk), 0.0);
      float df = max(dot(N, Lf), 0.0);
      float dr = max(dot(N, Lr), 0.0);

      // интенсивности близко к твоим
      vec3 lit =
        uColor * (0.10 + 1.85*dk + 0.35*df) +
        uColor * (0.15*dr);

      // clamp чтобы не “выбивало” в белое
      lit = clamp(lit, 0.0, 1.0);

      // ---- Weighted Blended OIT накопление ----
      // Вес можно делать зависимым от alpha, чтобы слои выглядели приятнее
      float a = clamp(uOpacity, 0.0, 0.9999);
      float w = max(0.01, a); // простой вес

      // Accum: rgb += lit * a * w, a += a*w
      gl_FragColor = vec4(lit * a * w, a * w);
    }
  `;

  accumMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 1.0 },
    },
    vertexShader: vs,
    fragmentShader: fsLighting,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  // additive blending
  accumMat.blending = THREE.CustomBlending;
  accumMat.blendEquation = THREE.AddEquation;
  accumMat.blendSrc = THREE.OneFactor;
  accumMat.blendDst = THREE.OneFactor;

  // Reveal: dst *= (1 - alpha)
const fsReveal = /* glsl */ `
  precision highp float;
  uniform float uOpacity;
  void main() {
    float a = clamp(uOpacity, 0.0, 1.0);
    // ВАЖНО:
    // Мы используем blendDst = OneMinusSrcAlphaFactor,
    // значит "SrcAlpha" должен быть РАВЕН a.
    // Тогда dst = dst * (1 - a) — то, что нужно.
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

  revealMat = new THREE.ShaderMaterial({
    uniforms: {
      uOpacity: { value: 1.0 },
    },
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: fsReveal,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  revealMat.blending = THREE.CustomBlending;
  revealMat.blendEquation = THREE.AddEquation;
  revealMat.blendSrc = THREE.ZeroFactor;
  revealMat.blendDst = THREE.OneMinusSrcAlphaFactor;

  // Composite (fullscreen)
  compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tOpaque: { value: null },
      tAccum: { value: null },
      tReveal: { value: null },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;

      uniform sampler2D tOpaque;
      uniform sampler2D tAccum;
      uniform sampler2D tReveal;

      void main() {
        vec4 opaque = texture2D(tOpaque, vUv);
        vec4 accum = texture2D(tAccum, vUv);
        vec4 reveal = texture2D(tReveal, vUv);

float oneMinusReveal = 1.0 - reveal.a;
float a = clamp(oneMinusReveal, 0.0, 1.0);

        vec3 trans = accum.rgb / max(accum.a, 1e-5);

        // финальное смешивание
        vec3 outRgb = opaque.rgb * (1.0 - a) + trans * a;

        gl_FragColor = vec4(outRgb, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: false,
    
  });
  accumUniforms = accumMat.uniforms;
revealUniforms = revealMat.uniforms;
}

function attachOitPerMeshUniforms(root) {
  if (!root) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    // ✅ если меш НЕ прозрачный для OIT — просто убираем наш хук
    if (!obj.userData?.oitTransparent) {
      // В r153 onBeforeRender должен быть функцией (или унаследованной).
      // Поэтому НЕ null, а delete (вернётся прототипная функция).
      delete obj.onBeforeRender;
      return;
    }

    // ✅ прозрачный OIT-меш: ставим хук, который прокидывает uColor/uOpacity
    obj.onBeforeRender = (renderer, scene, camera, geometry, material) => {
      try {
        const m = material;
        if (!m) return;

        // multi-material: берём индекс, который пометили в insetsViewer
        const idx = obj.userData?._oitMatIndex ?? 0;
        const mats = Array.isArray(m) ? m : [m];
        const srcMat = mats[Math.min(idx, mats.length - 1)] || mats[0];

        if (!srcMat) return;

        // Эти значения читает OIT-шейдер (accum/reveal)
        if (m.userData && m.userData._oitUniforms) {
          const u = m.userData._oitUniforms;
          if (srcMat.color && u.uColor) u.uColor.value.copy(srcMat.color);
          if (u.uOpacity) u.uOpacity.value = srcMat.opacity ?? 1;
        }
      } catch (e) {
        // на всякий случай не валим рендер
        console.warn("OIT onBeforeRender error", e);
      }
    };
  });
}

function buildQuad() {
  quadScene = new THREE.Scene();
  quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const geom = new THREE.PlaneGeometry(2, 2);
  quadMesh = new THREE.Mesh(geom, compositeMat);
  quadScene.add(quadMesh);
}

// ===== camera / resize =====

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

  // OIT targets тоже ресайзим
  if (oitEnabled) ensureOitTargets();
}

// ===== lights / controls =====

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

  window.addEventListener("mouseup", () => (dragging = false));

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

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();

      const delta = e.deltaY * 0.002;

      state.radius = THREE.MathUtils.clamp(
        state.radius + delta,
        state.minRadius,
        state.maxRadius
      );
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();

      if (e.touches.length === 1) {
        touchMode = "rotate";
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        touchMode = "zoom";
        lastPinch = pinch(e.touches[0], e.touches[1]);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    "touchmove",
    (e) => {
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
    },
    { passive: false }
  );

  window.addEventListener("touchend", () => {
    touchMode = null;
  });

  function pinch(a, b) {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
