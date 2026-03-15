import * as THREE from "three";

const CAD_COLOR = 0xdf1a84;

// Камера/свет как в основном viewer, но без фона.
const state = {
  radius: 4.5,
  minRadius: 2.0,
  maxRadius: 12.0,

  yaw: -30,
  pitch: 0,
  zoomMul: 1.0
};

export function initPreviewThree(container, size) {
  const scene = new THREE.Scene();

  const cadScene = new THREE.Scene();
  const cadGroup = new THREE.Group();
  cadGroup.name = "cad-preview";
  cadScene.add(cadGroup);

  const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 50);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true
  });

  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0);

  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  renderer.setSize(size, size, false);

  setupLights(scene);
  updateCameraPosition(camera);

return {
  scene,
  cadScene,
  cadGroup,
  camera,
  renderer,
  currentModel: null,
  size,

  sectionMaterials: [],
  sectionBlend: 0.5,
  outlineEnabled: true,

  rtBase: null,
  rtSec: null,
  rtN: null,
  postScene: null,
  postCam: null,
  postQuad: null
};
}

export function resizePreview(three, container, size) {
  three.size = size;

  container.style.width = size + "px";
  container.style.height = size + "px";

  three.renderer.setSize(size, size, false);

  three.camera.aspect = 1;
  three.camera.updateProjectionMatrix();

  disposePreviewTargets(three);
  ensurePreviewResources(three);
}

export function setPreviewModel(three, root) {
  const { scene } = three;

  if (three.currentModel) {
    scene.remove(three.currentModel);
  }

  three.currentModel = root;
  scene.add(root);

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
  });

  state.yaw = -30;
  state.pitch = 0;
  state.zoomMul = 1.0;

  fitCameraToModel(three.camera, root);
  updateCameraPosition(three.camera);

  renderPreview(three);
}

export function setPreviewSectionMaterials(three, materials) {
  three.sectionMaterials = Array.isArray(materials) ? materials : [];
}

export function setPreviewSectionBlend(three, factor01) {
  const v = Number(factor01);
  three.sectionBlend = Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0.5;
}

export function setPreviewOutlineEnabled(three, enabled) {
  three.outlineEnabled = !!enabled;
}

export function renderPreview(three) {
  if (!three?.renderer || !three?.camera) return;

  if (!three.currentModel) {
    three.renderer.setClearColor(0x000000, 0);
    three.renderer.clear(true, true, true);
    return;
  }

  ensurePreviewResources(three);

  const renderer = three.renderer;
  const camera = three.camera;
  const scene = three.scene;

  const saveStates = (mats) => {
    const saved = [];
    for (const m of mats) {
      if (!m) continue;
      saved.push({
        m,
        transparent: m.transparent,
        opacity: m.opacity,
        depthWrite: m.depthWrite,
        depthTest: m.depthTest
      });
    }
    return saved;
  };

  const applyOpaque = (mats) => {
    for (const m of mats) {
      if (!m) continue;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
    }
  };

  const restoreStates = (saved) => {
    for (const s of saved) {
      const m = s.m;
      m.transparent = s.transparent;
      m.opacity = s.opacity;
      m.depthWrite = s.depthWrite;
      m.depthTest = s.depthTest;
      m.needsUpdate = true;
    }
  };

  const savedSec = saveStates(three.sectionMaterials);

  // T00: body semi + sec semi
  renderer.setRenderTarget(three.rtBase);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  // T01: body semi + sec opaque
  applyOpaque(three.sectionMaterials);
  renderer.setRenderTarget(three.rtSec);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  restoreStates(savedSec);

  // Normals + depth for outline, while hiding sections (как в основном приложении)
  if (three.outlineEnabled) {
    const hiddenSections = [];
    if (three.currentModel && Array.isArray(three.sectionMaterials) && three.sectionMaterials.length) {
      const secSet = new Set(three.sectionMaterials);

      three.currentModel.traverse((obj) => {
        if (!obj.isMesh) return;

        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        const isSectionMesh = mats.some((m) => m && secSet.has(m));

        if (isSectionMesh && obj.visible) {
          hiddenSections.push(obj);
          obj.visible = false;
        }
      });
    }

    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = new THREE.MeshNormalMaterial();

    renderer.setRenderTarget(three.rtN);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);

    scene.overrideMaterial = prevOverride;
    for (const obj of hiddenSections) obj.visible = true;
  }

  // Final composite to transparent canvas
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);

  const mat = three.postQuad.material;
  mat.uniforms.tBase.value = three.rtBase.texture;
  mat.uniforms.tSecOpaque.value = three.rtSec.texture;
  mat.uniforms.tN.value = three.outlineEnabled ? three.rtN.texture : null;
  mat.uniforms.tDepth.value = three.outlineEnabled ? three.rtN.depthTexture : null;
  mat.uniforms.uTexel.value.set(1 / three.rtN.width, 1 / three.rtN.height);
  mat.uniforms.uSecMix.value = three.sectionBlend;
  mat.uniforms.uOutlineOn.value = three.outlineEnabled ? 1.0 : 0.0;

  renderer.render(three.postScene, three.postCam);

  // CAD поверх финального кадра
  if (three.cadScene && three.cadGroup && three.cadGroup.children.length) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(three.cadScene, camera);
    renderer.autoClear = prevAutoClear;
  }
}

export function renderPNG(three) {
  renderPreview(three);
  return three.renderer.domElement.toDataURL("image/png");
}

function disposePreviewTargets(three) {
  three.rtBase?.dispose?.();
  three.rtSec?.dispose?.();
  three.rtN?.dispose?.();
  three.rtBase = null;
  three.rtSec = null;
  three.rtN = null;
}

function ensurePreviewResources(three) {
  const renderer = three.renderer;
  if (!renderer) return;

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  const w = Math.max(1, Math.floor(size.x));
  const h = Math.max(1, Math.floor(size.y));

  const params = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false
  };

  if (!three.rtBase || three.rtBase.width !== w || three.rtBase.height !== h) {
    three.rtBase?.dispose?.();
    three.rtBase = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!three.rtSec || three.rtSec.width !== w || three.rtSec.height !== h) {
    three.rtSec?.dispose?.();
    three.rtSec = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!three.rtN || three.rtN.width !== w || three.rtN.height !== h) {
    three.rtN?.dispose?.();
    three.rtN = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false
    });
    three.rtN.depthTexture = new THREE.DepthTexture(w, h);
    three.rtN.depthTexture.type = THREE.UnsignedShortType;
  }

  if (!three.postScene) {
    three.postScene = new THREE.Scene();
    three.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },       // body semi + sec semi
        tSecOpaque: { value: null },  // body semi + sec opaque
        tN: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
        uOutlineOn: { value: 0.0 },
        uDepthK: { value: 1.0 },
        uNormK: { value: 1.0 },
        uSecMix: { value: 0.5 }
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

        uniform sampler2D tBase;
        uniform sampler2D tSecOpaque;
        uniform sampler2D tN;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uOutlineOn;
        uniform float uDepthK;
        uniform float uNormK;
        uniform float uSecMix;

        float edgeDepth(vec2 uv) {
          float d = texture2D(tDepth, uv).r;
          float dR = texture2D(tDepth, uv + vec2(uTexel.x, 0.0)).r;
          float dU = texture2D(tDepth, uv + vec2(0.0, uTexel.y)).r;
          return max(abs(d - dR), abs(d - dU));
        }

        float edgeNormal(vec2 uv) {
          vec3 n  = texture2D(tN, uv).xyz * 2.0 - 1.0;
          vec3 nR = texture2D(tN, uv + vec2(uTexel.x, 0.0)).xyz * 2.0 - 1.0;
          vec3 nU = texture2D(tN, uv + vec2(0.0, uTexel.y)).xyz * 2.0 - 1.0;
          return max(length(n - nR), length(n - nU));
        }

        vec3 toSRGB(vec3 c) {
          return pow(max(c, 0.0), vec3(1.0 / 2.2));
        }

        void main() {
          vec4 c0 = texture2D(tBase, vUv);
          vec4 c1 = texture2D(tSecOpaque, vUv);

          float s = clamp(uSecMix, 0.0, 1.0);
          vec4 outC = mix(c0, c1, s);
          vec3 col = outC.rgb;

          if (uOutlineOn > 0.5) {
            float ed = edgeDepth(vUv) * uDepthK;
            float en = edgeNormal(vUv) * uNormK;

            float e = max(
              smoothstep(0.002, 0.01, ed),
              smoothstep(0.10, 0.35, en)
            );

            col = mix(col, vec3(1.0), e);
          }

          gl_FragColor = vec4(toSRGB(col), outC.a);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    three.postQuad = new THREE.Mesh(geo, mat);
    three.postScene.add(three.postQuad);
  }
}

// --- camera / lights ---
function fitCameraToModel(camera, root) {
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

function updateCameraPosition(camera) {
  const r = state.radius * state.zoomMul;

  const yawRad = THREE.MathUtils.degToRad(state.yaw);
  const pitchRad = THREE.MathUtils.degToRad(state.pitch);

  const x = Math.sin(yawRad) * Math.cos(pitchRad);
  const z = Math.cos(yawRad) * Math.cos(pitchRad);
  const y = Math.sin(pitchRad);

  camera.position.set(x * r, y * r, z * r);
  camera.lookAt(0, 0, 0);
}

function setupLights(scene) {
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

export function rotatePreviewYaw(dir, three) {
  state.yaw += dir * 5;
  updateCameraPosition(three.camera);
  renderPreview(three);
}

export function rotatePreviewPitch(dir, three) {
  state.pitch = THREE.MathUtils.clamp(state.pitch + dir * 5, -45, 45);
  updateCameraPosition(three.camera);
  renderPreview(three);
}

export function setPreviewZoom(value, three) {
  state.zoomMul = THREE.MathUtils.clamp(Number(value), 0.5, 2.5);
  updateCameraPosition(three.camera);
  renderPreview(three);
}

export function clearPreviewCadOverlay(three) {
  if (!three?.cadGroup) return;

  while (three.cadGroup.children.length) {
    const child = three.cadGroup.children.pop();
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((m) => m?.dispose?.());
    else child.material?.dispose?.();
  }
}

export function setPreviewCadOverlay(three, cadSpec, opts = {}) {
  if (!three?.cadGroup) return;

  clearPreviewCadOverlay(three);

  const color = opts.color ?? CAD_COLOR;
  const opacity = opts.opacity ?? 1.0;

  if (!cadSpec || !Array.isArray(cadSpec.points) || cadSpec.points.length === 0) return;

  const pointMap = new Map();
  for (const p of cadSpec.points) {
    pointMap.set(String(p.id), new THREE.Vector3(p.x, p.y, p.z));
  }

  const pos = new Float32Array(cadSpec.points.length * 3);
  cadSpec.points.forEach((p, i) => {
    pos[i * 3 + 0] = p.x;
    pos[i * 3 + 1] = p.y;
    pos[i * 3 + 2] = p.z;
  });

  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const pointsMat = new THREE.PointsMaterial({
    color,
    size: 8,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    transparent: opacity < 0.999,
    opacity
  });

  const pointsObj = new THREE.Points(pointsGeo, pointsMat);
  pointsObj.renderOrder = 2000;
  three.cadGroup.add(pointsObj);

  const lines = Array.isArray(cadSpec.lines) ? cadSpec.lines : [];
  if (lines.length) {
    const linePos = [];

    for (const seg of lines) {
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
        color,
        depthTest: false,
        depthWrite: false,
        transparent: opacity < 0.999,
        opacity
      });

      const linesObj = new THREE.LineSegments(lineGeo, lineMat);
      linesObj.renderOrder = 1999;
      three.cadGroup.add(linesObj);
    }
  }
}
