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
// ✅ Меши, для которых мы создаём depth-prepass (невидимые клоны)
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
    const needTransparent = currentOpacity < 0.9999; // всё что меньше ~1 — прозрачное

    if (!needTransparent) {
      // полностью непрозрачный режим
      m.transparent = false;
      m.opacity = 1;
      m.depthWrite = true;
      m.depthTest = true;
      m.needsUpdate = true;
      continue;
    }

    // прозрачный режим (цвет)
    m.transparent = true;
    m.opacity = currentOpacity;

    // Ключевой момент:
    // глубину мы пишем НЕ ЭТИМ материалом, а depth-prepass клоном
    m.depthWrite = false;
    m.depthTest = true;

    m.needsUpdate = true;
  }
}


function clearDepthPrepass() {
  for (const m of depthPrepassMeshes) {
    if (m && m.parent) m.parent.remove(m);
  }
  depthPrepassMeshes = [];
}

function buildDepthPrepassForMaterial(root, materialName) {
  clearDepthPrepass();
  if (!root || !materialName) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    // если меш использует нужный материал — делаем depth-клон
    const hasTarget = mats.some((m) => m && m.name === materialName);
    if (!hasTarget) return;

    // Клон меша (геометрия та же, трансформы те же)
    const depthMesh = new THREE.Mesh(obj.geometry, new THREE.MeshBasicMaterial());

    // Копируем трансформы, чтобы он совпал пиксель-в-пиксель
    depthMesh.position.copy(obj.position);
    depthMesh.rotation.copy(obj.rotation);
    depthMesh.scale.copy(obj.scale);

    // Материал: рисуем ТОЛЬКО глубину, без цвета
    depthMesh.material.colorWrite = false;   // не рисовать цвет
    depthMesh.material.depthWrite = true;    // писать глубину
    depthMesh.material.depthTest = true;
    depthMesh.material.transparent = false;

    // Чуть-чуть смещаем вглубь, чтобы не было "мигания" из-за совпадения поверхностей
    depthMesh.material.polygonOffset = true;
    depthMesh.material.polygonOffsetFactor = 1;
    depthMesh.material.polygonOffsetUnits = 1;

    // Порядок рендера: depth раньше, прозрачный позже
    depthMesh.renderOrder = (obj.renderOrder || 0) - 1;

    // Чтобы освещение/материалы не трогать — клон невидимый по цвету, но "реальный" по глубине
    depthMesh.frustumCulled = obj.frustumCulled;

    // Вставляем клон в того же родителя
    obj.parent.add(depthMesh);

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
  clearDepthPrepass();
controlledMaterials = [];


loadModel(meta.sourceId || meta.id, {
  onProgress: (p) => setProgress(p),
  onStatus: (s) => setStatus(s)
})

.then(({ root }) => {
  // ✅ 1) соберём материалы под ползунок
  controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);

  // ✅ 2) построим depth-prepass клоны для МЕШЕЙ с этим материалом
  buildDepthPrepassForMaterial(root, meta.opacityMaterialName);

  // ✅ 3) теперь отправляем в сцену
  threeSetModel(root);

  // ✅ 4) применяем прозрачность
  applyOpacityToControlled();

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
