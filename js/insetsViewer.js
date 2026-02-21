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
// ✅ Клоны мешей для второго прохода (BackSide), чтобы прозрачность выглядела объемно
let backfaceClones = [];
// ✅ Запомним имя материала, которым управляем (например "1"), чтобы не гадать в applyOpacity
let controlledMaterialName = null;


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

function clearBackfaceClones() {
  for (const c of backfaceClones) {
    if (c?.parent) c.parent.remove(c);

    // освобождаем клон-материалы
    const mats = Array.isArray(c?.material) ? c.material : [c.material];
    for (const m of mats) {
      if (!m) continue;
      m.dispose?.();
    }
  }
  backfaceClones = [];
}

function buildBackfaceClones(root, materialName) {
  clearBackfaceClones();
  if (!root || !materialName) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    // найдём индекс целевого материала (например "1") в массиве саб-материалов
    const targetIdx = mats.findIndex((m) => m && String(m.name) === String(materialName));
    if (targetIdx === -1) return;

    // --- A) основной меш: целевой материал рисуем ТОЛЬКО фронт
    const targetMat = mats[targetIdx];
    targetMat.side = THREE.FrontSide;
    targetMat.transparent = true;
    targetMat.depthTest = true;
    targetMat.depthWrite = false;
    targetMat.needsUpdate = true;

    // --- B) клон меша: копируем материалы, но:
    // - целевой материал -> BackSide
    // - остальные (сечения 3/4) отключаем, чтобы они не дублировались
    const clonedMats = mats.map((m, i) => {
      if (!m) return m;

      // целевой материал
      if (i === targetIdx) {
        const backMat = m.clone();
        backMat.side = THREE.BackSide;
        backMat.transparent = true;
        backMat.depthTest = true;
        backMat.depthWrite = false;
        backMat.needsUpdate = true;
        return backMat;
      }

      // прочие материалы в клоне выключаем полностью
      const off = m.clone();
      off.transparent = true;
      off.opacity = 0.0;
      off.depthWrite = false;
      off.depthTest = false;   // чтобы не мешал и не создавал “шум”
      off.colorWrite = false;  // вообще не рисовать цвет
      off.needsUpdate = true;
      return off;
    });

    const backMesh = new THREE.Mesh(obj.geometry, clonedMats);

    // копируем локальные трансформы 1:1
    backMesh.position.copy(obj.position);
    backMesh.quaternion.copy(obj.quaternion);
    backMesh.scale.copy(obj.scale);

    backMesh.frustumCulled = obj.frustumCulled;

    // backpass рисуем чуть раньше
    backMesh.renderOrder = (obj.renderOrder || 0) - 1;

    obj.parent?.add(backMesh);
    backfaceClones.push(backMesh);
  });
}

// ✅ Применить текущую прозрачность ко всем "управляемым" материалам
function applyOpacityToControlled() {
  // 1) основной проход (FrontSide) — реальные материалы из модели
  for (const m of controlledMaterials) {
    if (!m) continue;

    m.side = THREE.FrontSide;

    m.transparent = true;
    m.opacity = currentOpacity;

    m.depthTest = true;
    m.depthWrite = false;

    m.forceSinglePass = false; // на всякий, чтобы не наследовалось старое
    m.needsUpdate = true;
  }

  // 2) второй проход (BackSide) — материалы внутри backfaceClones
  for (const mesh of backfaceClones) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const m of mats) {
      if (!m) continue;

      // обновляем только тот материал, которым управляем
      if (String(m.name) !== String(controlledMaterialName)) continue;

      m.side = THREE.BackSide;

      m.transparent = true;
      m.opacity = currentOpacity;

      m.depthTest = true;
      m.depthWrite = false;

      m.forceSinglePass = false;
      m.needsUpdate = true;
    }
  }
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
    clearBackfaceClones();
  controlledMaterialName = null;
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
  clearBackfaceClones();
controlledMaterials = [];
controlledMaterialName = meta.opacityMaterialName;

loadModel(meta.sourceId || meta.id, {
  onProgress: (p) => setProgress(p),
  onStatus: (s) => setStatus(s)
})

.then(({ root }) => {
  // 1) красим сечения (3/4)
  applyInsetColors(root, meta);

  // 2) имя целевого материала (например "1")
  controlledMaterialName = meta.opacityMaterialName;

  // 3) материалы, которыми управляем (из ОРИГИНАЛЬНОЙ модели)
  controlledMaterials = collectMaterialsByName(root, controlledMaterialName);

  // 4) строим backface клоны (для объема при прозрачности)
  buildBackfaceClones(root, controlledMaterialName);

  // 5) показываем модель
  threeSetModel(root);

  // 6) применяем opacity
  applyOpacityToControlled();

  if (controlledMaterials.length === 0) {
    setStatus(`Материал "${controlledMaterialName}" не найден`);
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
