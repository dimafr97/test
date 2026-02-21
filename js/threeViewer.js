// js/threeViewer.js
// Камера и управление — 100% поведение 8.html.

import * as THREE from "three";

let scene = null;
let camera = null;
let renderer = null;

let currentModel = null;
let oitEnabled = false;

let opaqueRT = null;
let accumRT = null;
let revealRT = null;

let quadScene = null;
let quadCamera = null;
let quadMesh = null;

let accumMat = null;
let revealMat = null;
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
  if (oitEnabled) ensureOit();
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
    if (!oitEnabled) {
  renderer.render(scene, camera);
} else {
  renderOit();
}
  });
}

function renderOit() {
  if (!currentModel) {
    renderer.setRenderTarget(null);
    renderer.clear();
    return;
  }

  ensureOit();

  // --- 1) Opaque pass (сечения и всё НЕ oitTransparent) ---
  setVisibilityForOit(false);

  renderer.setRenderTarget(opaqueRT);
  renderer.setClearColor(0x050506, 1);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);

  // --- 2) Accum pass (только oitTransparent) ---
  setVisibilityForOit(true);

  renderer.setRenderTarget(accumRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, false, false);

  // подхватываем цвет/opacity из материала меша через onBeforeRender
  scene.overrideMaterial = accumMat;
  renderer.render(scene, camera);

  // --- 3) Reveal pass (только oitTransparent) ---
  renderer.setRenderTarget(revealRT);
  renderer.setClearColor(0xffffff, 1);
  renderer.clear(true, false, false);

  scene.overrideMaterial = revealMat;
  renderer.render(scene, camera);

  // restore
  scene.overrideMaterial = null;
  setVisibilityForOit(null);

  // --- 4) Composite на экран ---
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x050506, 1);
  renderer.clear(true, true, false);
  renderer.render(quadScene, quadCamera);
}

// mode:
// true  -> показываем только oitTransparent
// false -> показываем только НЕ oitTransparent
// null  -> показываем всё и убираем onBeforeRender
function setVisibilityForOit(mode) {
  currentModel.traverse((obj) => {
    if (!obj.isMesh) return;

    const isOit = !!obj.userData.oitTransparent;

    if (mode === true) obj.visible = isOit;
    else if (mode === false) obj.visible = !isOit;
    else obj.visible = true;
  });

  // Включаем/выключаем прокидывание uColor/uOpacity
  if (mode === true) {
    currentModel.traverse((obj) => {
      if (!obj.isMesh || !obj.userData.oitTransparent) return;

      obj.onBeforeRender = () => {
        // Т.к. у тебя материал 1 общий на куб/конус — обычно obj.material один.
        // Если вдруг массив — берём первый, но при желании можно сделать умнее.
        const mat = Array.isArray(obj.material) ? obj.material[0] : obj.material;

        if (mat?.color && accumMat) accumMat.uniforms.uColor.value.copy(mat.color);
        if (accumMat) accumMat.uniforms.uOpacity.value = (mat?.opacity ?? 1);

        if (revealMat) revealMat.uniforms.uOpacity.value = (mat?.opacity ?? 1);
      };
    });
  } else if (mode === null) {
    currentModel.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.onBeforeRender = null;
    });
  }
}

function ensureOit() {
  if (!renderer) return;

  const w = Math.max(1, Math.floor(window.innerWidth));
  const h = Math.max(1, Math.floor(window.innerHeight));

  // если уже нужный размер — ничего не делаем
  if (opaqueRT && opaqueRT.width === w && opaqueRT.height === h) return;

  disposeOit();

  // 1) Opaque RT (с depth)
  opaqueRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });

  // 2) Accum/Reveal RT (без depth)
  // В идеале HalfFloat, но на телеграм-webview иногда проще UnsignedByte.
  // Начнем с UnsignedByte — уже даст правильную "глубину/пересечения".
  const rtType = THREE.UnsignedByteType;

  accumRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: rtType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  revealRT = new THREE.WebGLRenderTarget(w, h, {
    format: THREE.RGBAFormat,
    type: rtType,
    depthBuffer: false,
    stencilBuffer: false,
  });

  // --- Accum pass material (additive) ---
  accumMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    uniforms: {
      uColor: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 1.0 },

      // простое освещение чтобы было "объемно", без рефракции
      uLightDirA: { value: new THREE.Vector3(0.7, 0.9, 0.4).normalize() },
      uLightDirB: { value: new THREE.Vector3(-0.8, 0.4, 0.2).normalize() },
      uAmbient: { value: 0.18 },
      uWeight: { value: 8.0 }
    },
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vN;
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform vec3 uLightDirA;
      uniform vec3 uLightDirB;
      uniform float uAmbient;
      uniform float uWeight;

      void main() {
        float a = max(dot(vN, normalize(uLightDirA)), 0.0);
        float b = max(dot(vN, normalize(uLightDirB)), 0.0);
        float lit = uAmbient + a * 0.65 + b * 0.35;

        float alpha = clamp(uOpacity, 0.0, 1.0);

        // Weighted OIT accumulation
        float w = clamp(alpha * uWeight, 0.01, 50.0);
        vec3 col = uColor * lit;

        gl_FragColor = vec4(col * alpha * w, alpha * w);
      }
    `
  });

  // --- Reveal pass material (multiplicative via blending) ---
  revealMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendEquation: THREE.AddEquation,
    uniforms: {
      uOpacity: { value: 1.0 }
    },
    vertexShader: `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uOpacity;
      void main() {
        float alpha = clamp(uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
      }
    `
  });

  // --- Composite full-screen quad ---
  quadScene = new THREE.Scene();
  quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  compositeMat = new THREE.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    transparent: false,
    uniforms: {
      tOpaque: { value: opaqueRT.texture },
      tAccum: { value: accumRT.texture },
      tReveal: { value: revealRT.texture },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D tOpaque;
      uniform sampler2D tAccum;
      uniform sampler2D tReveal;

      void main() {
        vec4 bg = texture2D(tOpaque, vUv);
        vec4 acc = texture2D(tAccum, vUv);
        vec4 rev = texture2D(tReveal, vUv);

        float reveal = clamp(rev.r, 0.0, 1.0);
        float alpha = 1.0 - reveal;

        vec3 col = acc.rgb / max(acc.a, 1e-5);
        vec3 outCol = mix(bg.rgb, col, alpha);

        gl_FragColor = vec4(outCol, 1.0);
      }
    `
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  quadMesh = new THREE.Mesh(quadGeo, compositeMat);
  quadScene.add(quadMesh);
}

function disposeOit() {
  opaqueRT?.dispose(); opaqueRT = null;
  accumRT?.dispose(); accumRT = null;
  revealRT?.dispose(); revealRT = null;

  accumMat?.dispose(); accumMat = null;
  revealMat?.dispose(); revealMat = null;
  compositeMat?.dispose(); compositeMat = null;

  quadScene = null;
  quadCamera = null;
  quadMesh = null;
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
  if (oitEnabled) ensureOit();
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
