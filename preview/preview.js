import * as THREE from "three";
import { loadModel } from "../js/models.js";
import { INSETS, getInsetMeta } from "../js/insetsModels.js";
import {
  initPreviewThree,
  setPreviewModel,
  resizePreview,
  renderPNG,
  rotatePreviewYaw,
  rotatePreviewPitch,
  renderPreview,
  setPreviewSectionMaterials,
  setPreviewSectionBlend,
  setPreviewOutlineEnabled,
  setPreviewCadOverlay,
  clearPreviewCadOverlay
} from "./threePreview.js";

const elWrap = document.getElementById("wrap");
const elModelSelect = document.getElementById("modelSelect");
const elSizeSelect = document.getElementById("sizeSelect");
const elLoadBtn = document.getElementById("loadBtn");
const elDownloadBtn = document.getElementById("downloadBtn");
const elStatus = document.getElementById("status");

// --- fill select from INSETS ---
INSETS.forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  elModelSelect.appendChild(opt);
});

// --- init preview three ---
let size = parseInt(elSizeSelect.value, 10);
let three = initPreviewThree(elWrap, size);

// --- preview camera controls ---
document.getElementById("cam-left").onclick = () => {
  rotatePreviewYaw(-1, three);
};

document.getElementById("cam-right").onclick = () => {
  rotatePreviewYaw(1, three);
};

document.getElementById("cam-up").onclick = () => {
  rotatePreviewPitch(1, three);
};

document.getElementById("cam-down").onclick = () => {
  rotatePreviewPitch(-1, three);
};

// состояние
let currentModelId = INSETS[0]?.id ?? null;
let loaded = false;

function setStatus(text) {
  elStatus.textContent = text || "";
}

function hideInsetPointNodes(root) {
  if (!root) return;
  const pointNameRe = /^[a-z](\d+)?$/;
  root.traverse((obj) => {
    const name = String(obj.name || "").trim();
    if (!pointNameRe.test(name)) return;
    obj.visible = false;
  });
}

// как во врезках: плоские цвета/настройка сечений
function applyInsetColors(root, meta) {
  if (!root || !meta) return;

  const colors = meta.materialColors || {};
  const sectionList =
    Array.isArray(meta.sectionMaterialNames) && meta.sectionMaterialNames.length
      ? meta.sectionMaterialNames
      : ["3", "4"];

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    for (const m of mats) {
      if (!m) continue;

      const key = String(m.name);
      const isSection = sectionList.includes(key);
      const hex = colors[key];

      if (!isSection && !hex) continue;

      if (hex && m.color) m.color.set(hex);

      m.side = THREE.DoubleSide;

      if ("metalness" in m) m.metalness = 0;
      if ("roughness" in m) m.roughness = 1;

      if (isSection) {
        m.transparent = true;
        m.opacity = 0.6;
        m.depthWrite = false;
        m.depthTest = true;

        m.forceSinglePass = true;

        m.polygonOffset = true;
        m.polygonOffsetFactor = 1;
        m.polygonOffsetUnits = 1;

        m.blending = THREE.NormalBlending;

        const idx = sectionList.indexOf(key);
        obj.renderOrder = 20 + (idx >= 0 ? idx : 0);
      }

      m.needsUpdate = true;
    }
  });
}

function collectMaterialsByName(root, name) {
  const out = [];

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    for (const m of mats) {
      if (!m) continue;
      if (m.name === name) out.push(m);
    }
  });

  return Array.from(new Set(out));
}

function applyDefaultBodyOpacity(root, opacityMaterialName, opacity01) {
  const mats = collectMaterialsByName(root, opacityMaterialName);

  for (const m of mats) {
    if (!m) continue;

    m.side = THREE.DoubleSide;

    const needTransparent = opacity01 < 0.999;
    m.transparent = needTransparent;
    m.opacity = opacity01;
    m.depthWrite = !needTransparent;

    m.needsUpdate = true;
  }
}

// CAD spec из нод a,b,c... (как в insetsViewer.js)
function buildCadSpecFromModel(root, cadMeta) {
  if (!root || !cadMeta || !cadMeta.fromNodes) return null;

  const pointNameRe = /^[a-z](\d+)?$/;

  const points = [];
  const pointMap = new Map();

  root.traverse((obj) => {
    const name = String(obj.name || "").trim();
    if (!pointNameRe.test(name)) return;

    const p = new THREE.Vector3();
    obj.getWorldPosition(p);

    const pt = { id: name, x: p.x, y: p.y, z: p.z };
    pointMap.set(name, pt);
    points.push(pt);

    obj.visible = false;
  });

  points.sort((p1, p2) => p1.id.localeCompare(p2.id, "en"));

  const lines = Array.isArray(cadMeta.lines) ? cadMeta.lines : [];
  const filteredLines = lines.filter(([a, b]) => pointMap.has(String(a)) && pointMap.has(String(b)));

  return { points, lines: filteredLines };
}

// загрузка модели
async function loadSelected() {
  if (!currentModelId) return;

  const meta = getInsetMeta(currentModelId);
  if (!meta) {
    setStatus("Нет meta для: " + currentModelId);
    return;
  }

  loaded = false;
  elDownloadBtn.disabled = true;
  setStatus("Загрузка…");

  size = parseInt(elSizeSelect.value, 10);
  resizePreview(three, elWrap, size);

  try {
    const { root } = await loadModel(meta.sourceId || meta.id, {
      onStatus: (t) => setStatus(t),
      onProgress: (p) => {
        if (typeof p === "number") setStatus(`Загрузка: ${p.toFixed(0)}%`);
      }
    });

    applyInsetColors(root, meta);
    hideInsetPointNodes(root);
    applyDefaultBodyOpacity(root, meta.opacityMaterialName, 0.5);

    setPreviewModel(three, root);

    // section materials для 2-pass blend (как в приложении, но только по сечениям)
    let sectionMaterials = [];
    const secNames = Array.isArray(meta.sectionMaterialNames) ? meta.sectionMaterialNames : [];
    for (const n of secNames) {
      sectionMaterials.push(...collectMaterialsByName(root, n));
    }
    sectionMaterials = Array.from(new Set(sectionMaterials));

    setPreviewSectionMaterials(three, sectionMaterials);
    setPreviewSectionBlend(three, 0.5);
    setPreviewOutlineEnabled(three, true);

    // CAD overlay
    clearPreviewCadOverlay(three);
    const cadSpec = meta?.cad?.fromNodes
      ? buildCadSpecFromModel(root, meta.cad)
      : meta.cad;
    setPreviewCadOverlay(three, cadSpec, { opacity: 1.0 });

    renderPreview(three);

    loaded = true;
    elDownloadBtn.disabled = false;
    setStatus(`Готово: ${meta?.name ?? currentModelId}`);
  } catch (e) {
    console.error(e);
    setStatus("Ошибка загрузки");
    alert("Ошибка загрузки модели (смотри консоль/Network).");
  }
}

// --- UI events ---
elModelSelect.addEventListener("change", () => {
  currentModelId = elModelSelect.value;
  loaded = false;
  elDownloadBtn.disabled = true;
  setStatus("Выбрано: " + currentModelId);
});

elSizeSelect.addEventListener("change", () => {
  loaded = false;
  elDownloadBtn.disabled = true;
  setStatus("Размер изменён — нажми «Загрузить»");
});

elLoadBtn.addEventListener("click", loadSelected);

elDownloadBtn.addEventListener("click", () => {
  if (!loaded) return;

  const dataUrl = renderPNG(three);

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${currentModelId}_${size}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// --- старт ---
if (currentModelId) {
  elModelSelect.value = currentModelId;
  loadSelected();
}
