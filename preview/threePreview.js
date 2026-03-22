import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

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
  const sectionEdgesScene = new THREE.Scene();
  const sectionEdgesGroup = new THREE.Group();
  sectionEdgesGroup.name = "section-edges-preview";
  sectionEdgesScene.add(sectionEdgesGroup);

  const camera = new THREE.PerspectiveCamera(25, 1, 0.1, 50);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance"
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

renderer.setPixelRatio(4);
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
  sectionEdgesScene,
  sectionEdgesGroup,
  camera,
  renderer,
  currentModel: null,
  size,

  bodyMaterials: [],
  sectionMaterials: [],
  outlineExcludedMaterials: [],

  bodyBlend: 0.0,
  sectionBlend: 0.5,

  outlineEnabled: true,
  outlineThicknessPx: 2.0,

  sectionEdgesScene,
  sectionEdgesGroup,
  sectionEdgesMeshes: [],
  sectionEdgesAlpha: 0,
  rtSE: null,

  rtA: null,
  rtB: null,
  rtC: null,
  rtD: null,
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

  for (const obj of three.sectionEdgesMeshes) {
    if (obj.material?.resolution) {
      obj.material.resolution.set(
        three.renderer.domElement.width,
        three.renderer.domElement.height
      );
    }
  }

  for (const obj of three.cadGroup.children) {
    if (obj.material?.resolution) {
      obj.material.resolution.set(
        three.renderer.domElement.width,
        three.renderer.domElement.height
      );
    }
  }
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

export function setPreviewBodyMaterials(three, materials) {
  three.bodyMaterials = Array.isArray(materials) ? materials : [];
}

export function setPreviewBodyBlend(three, factor01) {
  const v = Number(factor01);
  three.bodyBlend = Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0.0;
}

export function setPreviewSectionBlend(three, factor01) {
  const v = Number(factor01);
  three.sectionBlend = Number.isFinite(v) ? THREE.MathUtils.clamp(v, 0, 1) : 0.5;
}

export function setPreviewOutlineEnabled(three, enabled) {
  three.outlineEnabled = !!enabled;
}

export function setPreviewOutlineExcludedMaterials(three, materials) {
  three.outlineExcludedMaterials = Array.isArray(materials) ? materials : [];
}

export function setPreviewSectionEdgesAlpha(three, alpha) {
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  three.sectionEdgesAlpha = a;

  for (const obj of three.sectionEdgesMeshes) {
    if (!obj || !obj.material) continue;
    obj.material.transparent = true;
    obj.material.opacity = a;
    obj.material.needsUpdate = true;
  }
}

export function setPreviewSectionEdgesOverlay(three, root, sectionMaterialNames = [], materialColors = {}) {
  buildPreviewSectionEdges(three, root, sectionMaterialNames, materialColors);
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

  function saveStates(mats) {
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
  }

  function applyOpaque(mats) {
    for (const m of mats) {
      if (!m) continue;
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
    }
  }

  function restoreStates(saved) {
    for (const s of saved) {
      const m = s.m;
      m.transparent = s.transparent;
      m.opacity = s.opacity;
      m.depthWrite = s.depthWrite;
      m.depthTest = s.depthTest;
      m.needsUpdate = true;
    }
  }

  const savedBody = saveStates(three.bodyMaterials);
  const savedSec = saveStates(three.sectionMaterials);

  // T00: body semi + sec semi
  renderer.setRenderTarget(three.rtA);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  // T10: body opaque + sec semi
  applyOpaque(three.bodyMaterials);
  renderer.setRenderTarget(three.rtB);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  restoreStates(savedBody);

  // T01: body semi + sec opaque
  applyOpaque(three.sectionMaterials);
  renderer.setRenderTarget(three.rtC);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);
  restoreStates(savedSec);

  // T11: body opaque + sec opaque
  applyOpaque(three.bodyMaterials);
  applyOpaque(three.sectionMaterials);
  renderer.setRenderTarget(three.rtD);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, camera);

  restoreStates(savedBody);
  restoreStates(savedSec);

  // Colored section edges
  renderer.setRenderTarget(three.rtSE);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);

  if (three.sectionEdgesScene && three.sectionEdgesGroup && three.sectionEdgesGroup.children.length) {
    renderer.render(three.sectionEdgesScene, camera);
  }

  // Normals + depth for outline, while hiding sections
  if (three.outlineEnabled) {
    const hiddenSections = [];
    if (three.currentModel && Array.isArray(three.outlineExcludedMaterials) && three.outlineExcludedMaterials.length) {
      const secSet = new Set(three.outlineExcludedMaterials);

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

  // Final composite
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);

  const mat = three.postQuad.material;
  mat.uniforms.t00.value = three.rtA.texture;
  mat.uniforms.t10.value = three.rtB.texture;
  mat.uniforms.t01.value = three.rtC.texture;
  mat.uniforms.t11.value = three.rtD.texture;
  mat.uniforms.tSE.value = three.rtSE ? three.rtSE.texture : null;
  mat.uniforms.tN.value = three.outlineEnabled ? three.rtN.texture : null;
  mat.uniforms.tDepth.value = three.outlineEnabled ? three.rtN.depthTexture : null;

  const k = Math.max(0.5, Number(three.outlineThicknessPx) || 2.0);
  mat.uniforms.uTexel.value.set(k / three.rtN.width, k / three.rtN.height);
  mat.uniforms.uBodyMix.value = three.bodyBlend;
  mat.uniforms.uSecMix.value = three.sectionBlend;
  mat.uniforms.uOutlineOn.value = three.outlineEnabled ? 1.0 : 0.0;

  renderer.render(three.postScene, three.postCam);

  // CAD overlay on top
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

function clearPreviewSectionEdges(three) {
  if (!three?.sectionEdgesGroup) return;

  for (const e of three.sectionEdgesMeshes) {
    e.geometry?.dispose?.();
    e.material?.dispose?.();
  }

  three.sectionEdgesMeshes = [];
  three.sectionEdgesGroup.clear();
  three.sectionEdgesAlpha = 0;
}

function buildPreviewSectionSubGeometryByMaterialName(obj, materialName) {
  const geom = obj?.geometry;
  if (!geom) return null;

  const posAttr = geom.getAttribute("position");
  if (!posAttr) return null;

  const materials = Array.isArray(obj.material) ? obj.material : [obj.material];

  const groups =
    Array.isArray(geom.groups) && geom.groups.length
      ? geom.groups
      : [{
          start: 0,
          count: geom.index ? geom.index.count : posAttr.count,
          materialIndex: 0
        }];

  const pickedVertexIndices = [];

  for (const group of groups) {
    const mat = materials[group.materialIndex] || materials[0] || null;
    if (!mat) continue;
    if (String(mat.name) !== String(materialName)) continue;

    if (geom.index) {
      const indexArray = geom.index.array;
      const end = group.start + group.count;
      for (let i = group.start; i < end; i++) {
        pickedVertexIndices.push(indexArray[i]);
      }
    } else {
      const end = group.start + group.count;
      for (let i = group.start; i < end; i++) {
        pickedVertexIndices.push(i);
      }
    }
  }

  if (!pickedVertexIndices.length) return null;

  const outPos = new Float32Array(pickedVertexIndices.length * 3);

  for (let i = 0; i < pickedVertexIndices.length; i++) {
    const vi = pickedVertexIndices[i];
    outPos[i * 3 + 0] = posAttr.getX(vi);
    outPos[i * 3 + 1] = posAttr.getY(vi);
    outPos[i * 3 + 2] = posAttr.getZ(vi);
  }

  const outGeom = new THREE.BufferGeometry();
  outGeom.setAttribute("position", new THREE.BufferAttribute(outPos, 3));

  return outGeom;
}

function buildPreviewSectionEdges(three, root, sectionMaterialNames = [], materialColors = {}) {
  clearPreviewSectionEdges(three);

  if (!three?.sectionEdgesGroup || !root) return;
  if (!Array.isArray(sectionMaterialNames) || !sectionMaterialNames.length) return;

  const pointNameRe = /^[a-z](\d+)?$/;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const nm = String(obj.name || "").trim();
    if (pointNameRe.test(nm)) return;

    for (const matName of sectionMaterialNames) {
      const subGeom = buildPreviewSectionSubGeometryByMaterialName(obj, matName);
      if (!subGeom) continue;

      const edgesGeom = new THREE.EdgesGeometry(subGeom, 1);
      subGeom.dispose();

      const pos = edgesGeom.getAttribute("position");
      if (!pos || pos.count === 0) {
        edgesGeom.dispose();
        continue;
      }

      const positions = Array.from(pos.array);
      edgesGeom.dispose();

      const wideGeom = new LineSegmentsGeometry();
      wideGeom.setPositions(positions);

      const colorValue =
        (materialColors && materialColors[String(matName)]) || "#ffffff";

      const lineMat = new LineMaterial({
        color: new THREE.Color(colorValue),
        linewidth: 2.0,
        transparent: true,
        opacity: three.sectionEdgesAlpha,
        depthTest: false,
        depthWrite: false,
        dashed: false
      });

      lineMat.resolution.set(
        three.renderer.domElement.width,
        three.renderer.domElement.height
      );

      lineMat.needsUpdate = true;

      const lines = new LineSegments2(wideGeom, lineMat);
      lines.matrixAutoUpdate = false;
      lines.frustumCulled = false;
      lines.renderOrder = 1400;

      lines.matrix.copy(obj.matrixWorld);
      lines.matrixWorld.copy(obj.matrixWorld);

      lines.onBeforeRender = () => {
        lines.matrix.copy(obj.matrixWorld);
        lines.matrixWorld.copy(obj.matrixWorld);
      };

      three.sectionEdgesGroup.add(lines);
      three.sectionEdgesMeshes.push(lines);
    }
  });
}

function disposePreviewTargets(three) {
  three.rtA?.dispose?.();
  three.rtB?.dispose?.();
  three.rtC?.dispose?.();
  three.rtD?.dispose?.();
  three.rtN?.dispose?.();
  three.rtSE?.dispose?.();

  three.rtA = null;
  three.rtB = null;
  three.rtC = null;
  three.rtD = null;
  three.rtN = null;
  three.rtSE = null;
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

  if (!three.rtA || three.rtA.width !== w || three.rtA.height !== h) {
    three.rtA?.dispose?.();
    three.rtA = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!three.rtB || three.rtB.width !== w || three.rtB.height !== h) {
    three.rtB?.dispose?.();
    three.rtB = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!three.rtC || three.rtC.width !== w || three.rtC.height !== h) {
    three.rtC?.dispose?.();
    three.rtC = new THREE.WebGLRenderTarget(w, h, params);
  }

  if (!three.rtD || three.rtD.width !== w || three.rtD.height !== h) {
    three.rtD?.dispose?.();
    three.rtD = new THREE.WebGLRenderTarget(w, h, params);
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

  if (!three.rtSE || three.rtSE.width !== w || three.rtSE.height !== h) {
    three.rtSE?.dispose?.();
    three.rtSE = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    });
  }

  // Генератор: максимум качества, без оглядки на производительность
  three.rtA.samples = 4;
  three.rtB.samples = 4;
  three.rtC.samples = 4;
  three.rtD.samples = 4;
  three.rtN.samples = 4;
  three.rtSE.samples = 4;

  if (!three.postScene) {
    three.postScene = new THREE.Scene();
    three.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        t00: { value: null },
        t10: { value: null },
        t01: { value: null },
        t11: { value: null },
        tSE: { value: null },
        tN: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
        uOutlineOn: { value: 0.0 },
        uDepthK: { value: 1.0 },
        uNormK: { value: 1.0 },
        uBodyMix: { value: 0.0 },
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

        uniform sampler2D t00;
        uniform sampler2D t10;
        uniform sampler2D t01;
        uniform sampler2D t11;
        uniform sampler2D tSE;
        uniform sampler2D tN;
        uniform sampler2D tDepth;
        uniform vec2 uTexel;
        uniform float uOutlineOn;
        uniform float uDepthK;
        uniform float uNormK;
        uniform float uBodyMix;
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
          vec4 c00 = texture2D(t00, vUv);
          vec4 c10 = texture2D(t10, vUv);
          vec4 c01 = texture2D(t01, vUv);
          vec4 c11 = texture2D(t11, vUv);

          float b = clamp(uBodyMix, 0.0, 1.0);
          float s = clamp(uSecMix, 0.0, 1.0);

          vec4 semiSec = mix(c00, c10, b);
          vec4 opaSec  = mix(c01, c11, b);

          vec4 outC = mix(semiSec, opaSec, s);
          vec3 col = outC.rgb;
          float outA = outC.a;

          vec4 secEdge = texture2D(tSE, vUv);
          float secA = clamp(secEdge.a, 0.0, 1.0);
          col = mix(col, secEdge.rgb, secA);
          outA = max(outA, secA);

          if (uOutlineOn > 0.5) {
            float ed = edgeDepth(vUv) * uDepthK;
            float en = edgeNormal(vUv) * uNormK;

            float e = max(
              smoothstep(0.002, 0.01, ed),
              smoothstep(0.10, 0.35, en)
            );

            col = mix(col, vec3(1.0), e);
            outA = max(outA, e);
          }

          gl_FragColor = vec4(toSRGB(col), outA);
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

    if (!three.rtSE || three.rtSE.width !== w || three.rtSE.height !== h) {
    three.rtSE?.dispose?.();
    three.rtSE = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false
    });
  }

    // Максимальное качество для генератора: MSAA на всех RT
  three.rtBase.samples = 4;
  three.rtSec.samples = 4;
  three.rtN.samples = 4;
  three.rtSE.samples = 4;

  if (!three.postScene) {
    three.postScene = new THREE.Scene();
    three.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },       // body semi + sec semi
        tSecOpaque: { value: null },  // body semi + sec opaque
        tSE: { value: null },         // цветные контуры сечений
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
        uniform sampler2D tSE;
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
          float outA = outC.a;

          // Цветные контуры сечений
          vec4 secEdge = texture2D(tSE, vUv);
          float secA = clamp(secEdge.a, 0.0, 1.0);
          col = mix(col, secEdge.rgb, secA);
          outA = max(outA, secA);

          // Белый outline
          if (uOutlineOn > 0.5) {
            float ed = edgeDepth(vUv) * uDepthK;
            float en = edgeNormal(vUv) * uNormK;

            float e = max(
              smoothstep(0.0005, 0.004, ed),
              smoothstep(0.03, 0.15, en)
            );

            float outlineA = e * 0.7;
            col = mix(col, vec3(1.0), outlineA);
            outA = max(outA, outlineA);
          }

          gl_FragColor = vec4(toSRGB(col), outA);
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
      const segGeom = new LineSegmentsGeometry();
      segGeom.setPositions(new Float32Array(linePos));

      const lineMat = new LineMaterial({
        color: new THREE.Color(color),
        linewidth: 1.5,
        transparent: opacity < 0.999,
        opacity,
        depthTest: false,
        depthWrite: false,
        dashed: false
      });

      lineMat.resolution.set(
        three.renderer.domElement.width,
        three.renderer.domElement.height
      );

      const linesObj = new LineSegments2(segGeom, lineMat);
      linesObj.renderOrder = 1999;
      three.cadGroup.add(linesObj);
    }
  }
}
