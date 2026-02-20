// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.
import * as THREE from "three";
import { setModel as threeSetModel } from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
// ✅ Материалы, которыми управляет ползунок прозрачности
let controlledMaterials = [];
let currentOpacity = 1; // 0..1
// ✅ Невидимые меши для depth-prepass (чтобы прозрачность не ломала глубину)
let depthPrepassMeshes = [];


export function initInsetsViewer(refs) {
  dom = { ...refs };
  if (!dom.canvasEl) throw new Error("initInsetsViewer: canvasEl missing");



  setupUiHandlers();

  return {
    openById,
    showGallery,     // вернуться к главному меню/галерее
    enterInsetMode,  // включить inset-mode (скрыть вкладки)
    exitInsetMode,   // выключить inset-mode
  };
}

function enterInsetMode() {
  document.body.classList.add("inset-mode");

  // ✅ Сбрасываем прозрачность на 100% при входе во Врезки
  currentOpacity = 1;
  if (dom?.insetOpacitySlider) dom.insetOpacitySlider.value = "100";
}


function exitInsetMode() {
  document.body.classList.remove("inset-mode");
}
// ✅ Собрать все материалы с нужным именем (например "3") внутри загруженной модели
function collectMaterialsByName(root, name) {
  const out = [];
  if (!root || !name) return out;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats) {
      if (!m) continue;
      if (m.name === name) out.push(m);
    }
  });

  // ✅ Убираем дубликаты (часто один material шарится несколькими mesh)
  return Array.from(new Set(out));
}

// ✅ Применить текущую прозрачность ко всем "управляемым" материалам
function applyOpacityToControlled() {
  for (const m of controlledMaterials) {
    if (!m) continue;

    // ✅ чтобы видеть обратные стороны
    m.side = THREE.DoubleSide;

    // ✅ один режим на весь диапазон
    // всегда считаем материал прозрачным (даже если opacity почти 1)
    m.transparent = true;

    // ограничим сверху, чтобы не попадать в "почти 1"
    // (но визуально 0.9999 = 100%)
    const o = Math.max(0, Math.min(0.9999, currentOpacity));
    m.opacity = o;

    // ✅ КЛЮЧ: цвет рисуем, но глубину НЕ пишем
    // глубину за нас пишет depth-prepass клон
    m.depthTest = true;
    m.depthWrite = false;

    m.needsUpdate = true;
  }
}
function clearDepthPrepass() {
  for (const m of depthPrepassMeshes) {
    if (m && m.parent) m.parent.remove(m);
    if (m?.material) m.material.dispose?.();
  }
  depthPrepassMeshes = [];
}

// ✅ Создаём невидимые depth-only клоны для всех МЕШЕЙ,
// которые используют материал materialName (например "1")
function buildDepthPrepassForMaterial(root, materialName) {
  clearDepthPrepass();
  if (!root || !materialName) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const usesTarget = mats.some((m) => m && String(m.name) === String(materialName));
    if (!usesTarget) return;

    // Клон с той же геометрией
    const depthMat = new THREE.MeshDepthMaterial();
    depthMat.depthWrite = true;
    depthMat.depthTest = true;
    depthMat.transparent = false;

    // ВАЖНО: не рисуем цвет вообще
    depthMat.colorWrite = false;

    // Небольшой polygonOffset, чтобы не было "драки" по depth
    depthMat.polygonOffset = true;
    depthMat.polygonOffsetFactor = 1;
    depthMat.polygonOffsetUnits = 1;

    const depthMesh = new THREE.Mesh(obj.geometry, depthMat);

    // Копируем локальные трансформы 1 в 1
    depthMesh.position.copy(obj.position);
    depthMesh.quaternion.copy(obj.quaternion);
    depthMesh.scale.copy(obj.scale);

    // Чтобы совпадало по видимости
    depthMesh.frustumCulled = obj.frustumCulled;

    // Рисуем ДО основного меша
    depthMesh.renderOrder = (obj.renderOrder || 0) - 1;

    // Вставляем рядом (в того же родителя)
    obj.parent?.add(depthMesh);
    depthPrepassMeshes.push(depthMesh);
  });
}


// ✅ Применить “плоские” цвета материалам сечений (например "2" и "3")
// meta.materialColors ожидается как объект: { "2": "#ff3b30", "3": "#34c759" }
function applyInsetColors(root, meta) {
  if (!root || !meta || !meta.materialColors) return;

  const colors = meta.materialColors;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    for (const m of mats) {
      if (!m) continue;

      const key = String(m.name);
      const hex = colors[key];
      if (!hex) continue;

      // ✅ у PBR материалов есть .color
      if (m.color) m.color.set(hex);
      m.side = THREE.DoubleSide;


      // ✅ делаем “матовый пластик”, чтобы цвет выглядел чисто и стабильно
      if ("metalness" in m) m.metalness = 0;
      if ("roughness" in m) m.roughness = 1;

      m.needsUpdate = true;
    }
  });
}



function setupUiHandlers() {
  const { prevBtn, nextBtn, backBtn } = dom;

  // Prev / Next ходят по INSETS
  prevBtn?.addEventListener("click", () => {
    if (!currentId) return;
    const idx = getIndex(currentId);
    if (idx < 0) return;
    const nextIdx = (idx - 1 + INSETS.length) % INSETS.length;
    openById(INSETS[nextIdx].id);
  });

  nextBtn?.addEventListener("click", () => {
    if (!currentId) return;
    const idx = getIndex(currentId);
    if (idx < 0) return;
    const nextIdx = (idx + 1) % INSETS.length;
    openById(INSETS[nextIdx].id);
  });

  // Кнопка "Галерея" возвращает в галерею
  backBtn?.addEventListener("click", () => {
    showGallery();
  });

  // Вкладки 3D/Построение/Видео в inset-mode скрыты CSS'ом,
  // но на всякий случай удаляем active-классы
  dom.tab3dBtn?.classList.add("active");
  dom.tabSchemeBtn?.classList.remove("active");
  dom.tabVideoBtn?.classList.remove("active");
    // ✅ Ползунок прозрачности (работает только для выбранного материала, например "3")
dom.insetOpacitySlider?.addEventListener("input", () => {
  const v = Number(dom.insetOpacitySlider.value || 100); // 0..100
  currentOpacity = Math.max(0, Math.min(1, v / 100));    // 0..1
  applyOpacityToControlled();
});
// ✅ Важно: на телефоне не отдаём тач/drag дальше (в canvas), иначе первый drag не цепляется
if (dom.insetOpacitySlider) {
  const stop = (e) => e.stopPropagation();
  const opt = { passive: true, capture: true };

  dom.insetOpacitySlider.addEventListener("pointerdown", stop, opt);
  dom.insetOpacitySlider.addEventListener("pointermove", stop, opt);
  dom.insetOpacitySlider.addEventListener("touchstart", stop, opt);
  dom.insetOpacitySlider.addEventListener("touchmove", stop, opt);
}

}

function getIndex(id) {
  return INSETS.findIndex((m) => m.id === id);
}

export function showGallery() {
  const { galleryEl, viewerWrapperEl, statusEl } = dom;
  galleryEl?.classList.remove("hidden");
  viewerWrapperEl?.classList.remove("visible");
  if (statusEl) statusEl.textContent = "";
  currentId = null;
  exitInsetMode();
  clearDepthPrepass();
  controlledMaterials = [];
currentOpacity = 1;
}

export function openById(id) {
  const meta = getInsetMeta(id);
  if (!meta) {
    console.error("No inset:", id);
    return;
  }

  currentId = id;
  enterInsetMode();

  // показываем viewer
  dom.galleryEl?.classList.add("hidden");
  dom.viewerWrapperEl?.classList.add("visible");

  // подпись
  if (dom.modelLabelEl) dom.modelLabelEl.textContent = meta.name;

  // загрузка
  showLoading(`Загрузка: ${meta.name}`);

loadModel(meta.sourceId || meta.id, {
  onProgress: (p) => setProgress(p),
  onStatus: (s) => setStatus(s)
})

.then(({ root }) => {
  // ✅ 1) сначала применяем цвета сечений (если они заданы в meta)
  applyInsetColors(root, meta);

  // ✅ 2) находим материалы, которыми управляет ползунок (например "1")
  controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);

  // ✅ 3) строим depth-prepass клоны для этого материала ("1")
  buildDepthPrepassForMaterial(root, meta.opacityMaterialName);

  // ✅ 4) показываем модель в threeViewer
  threeSetModel(root);

  // ✅ 5) применяем текущую прозрачность
  applyOpacityToControlled();

  // ✅ статус (можно оставить)
  if (controlledMaterials.length === 0) {
    setStatus(`Материал "${meta.opacityMaterialName}" не найден`);
  } else {
    setStatus("");
  }

  hideLoading();
})

    .catch((err) => {
      console.error(err);
      hideLoading();
      setStatus("Ошибка загрузки");
    });
}

function showLoading(text) {
  if (dom.loadingTextEl) dom.loadingTextEl.textContent = text || "";
  if (dom.loadingEl) dom.loadingEl.style.display = "flex";
  setProgress(0);
}

function hideLoading() {
  if (dom.loadingEl) dom.loadingEl.style.display = "none";
  setProgress(0);
}

function setProgress(p) {
  if (!dom.progressBarEl) return;
  const v = Math.max(0, Math.min(100, Number(p) || 0));
  dom.progressBarEl.style.width = `${v}%`;
}

function setStatus(text) {
  if (dom.statusEl) dom.statusEl.textContent = text || "";
}
