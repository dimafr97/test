// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.
import * as THREE from "three";
import { setModel as threeSetModel, setOitEnabled } from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
// ✅ Материалы, которыми управляет ползунок прозрачности
let controlledMaterials = [];
let currentOpacity = 1; // 0..1
let currentRoot = null;


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
  setOitEnabled(true);   // ✅ OIT включаем только во врезках

  currentOpacity = 1;
  if (dom?.insetOpacitySlider) dom.insetOpacitySlider.value = "100";
}

function exitInsetMode() {
  document.body.classList.remove("inset-mode");
  setOitEnabled(false);  // ✅ на выходе выключаем
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

function splitMultiMaterialMeshes(root, targetMaterialName) {
  if (!root) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (!Array.isArray(obj.material)) return;
    if (!obj.geometry || !obj.geometry.groups || obj.geometry.groups.length === 0) return;

    // найдём индексы материалов, которые соответствуют targetMaterialName ("1")
    const targetIdx = [];
    for (let i = 0; i < obj.material.length; i++) {
      const m = obj.material[i];
      if (m && String(m.name) === String(targetMaterialName)) targetIdx.push(i);
    }
    if (targetIdx.length === 0) return;

    // проверяем: есть ли кроме target ещё какие-то группы
    const hasTargetGroups = obj.geometry.groups.some(g => targetIdx.includes(g.materialIndex));
    const hasOtherGroups  = obj.geometry.groups.some(g => !targetIdx.includes(g.materialIndex));
    if (!hasTargetGroups || !hasOtherGroups) return; // нечего делить

    // делаем 2 геометрии: targetGroups и otherGroups
    const geoTarget = obj.geometry.clone();
    geoTarget.clearGroups();
    const geoOther = obj.geometry.clone();
    geoOther.clearGroups();

    for (const g of obj.geometry.groups) {
      if (targetIdx.includes(g.materialIndex)) {
        geoTarget.addGroup(g.start, g.count, g.materialIndex);
      } else {
        geoOther.addGroup(g.start, g.count, g.materialIndex);
      }
    }

    // создаём 2 меша с теми же материалами (индексы сохраняются!)
    const meshTarget = new THREE.Mesh(geoTarget, obj.material);
    const meshOther  = new THREE.Mesh(geoOther,  obj.material);

    // копируем трансформы/настройки
    meshTarget.position.copy(obj.position);
    meshTarget.quaternion.copy(obj.quaternion);
    meshTarget.scale.copy(obj.scale);

    meshOther.position.copy(obj.position);
    meshOther.quaternion.copy(obj.quaternion);
    meshOther.scale.copy(obj.scale);

    meshTarget.frustumCulled = obj.frustumCulled;
    meshOther.frustumCulled  = obj.frustumCulled;

    // чтобы OIT мог понимать "какой материал главный" у target-меша
    meshTarget.userData._oitTargetMaterialName = String(targetMaterialName);

    // заменяем исходный меш двумя новыми
    const parent = obj.parent;
    if (!parent) return;

    parent.add(meshTarget);
    parent.add(meshOther);

    parent.remove(obj);
  });
}

function markOitTransparentMeshes(root, materialName) {
  if (!root) return;

  root.traverse((obj) => {
    if (!obj.isMesh) return;

    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];

    // индексы материалов с именем materialName ("1")
    const targetIdx = [];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      if (m && String(m.name) === String(materialName)) targetIdx.push(i);
    }

    if (targetIdx.length === 0) {
      obj.userData.oitTransparent = false;
      delete obj.userData._oitMatIndex;
      return;
    }

    // если у геометрии есть groups — проверим что есть группы именно target материала
    const groups = obj.geometry?.groups || [];
    const usesTargetGroups =
      groups.length > 0
        ? groups.some((g) => targetIdx.includes(g.materialIndex))
        : true; // single-material mesh

    // ✅ ВАЖНО: без зависимости от opacity — "тела" всегда идут в OIT
    obj.userData.oitTransparent = usesTargetGroups;

    // запомним индекс материала, чтобы threeViewer мог взять цвет/opacity
    obj.userData._oitMatIndex = targetIdx[0];
  });
}

// ✅ Применить текущую прозрачность ко всем "управляемым" материалам
function applyOpacityToControlled() {
  const op = Math.max(0, Math.min(1, currentOpacity));

  for (const m of controlledMaterials) {
    if (!m) continue;

    // две стороны, чтобы изнутри тоже было видно
    m.side = THREE.DoubleSide;

    // ✅ просто храним opacity в материале
    m.opacity = op;

    // ✅ НЕ включаем стандартную прозрачность three.js (OIT сделает прозрачность сам)
    m.transparent = false;

    // обычная глубина
    m.depthTest = true;
    m.depthWrite = true;

    m.needsUpdate = true;
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
  const v = Number(dom.insetOpacitySlider.value || 100);
  currentOpacity = Math.max(0, Math.min(1, v / 100));

  // обновляем OIT-флаги каждый раз
  if (currentRoot) {
    const meta = getInsetMeta(currentId);
    if (meta) markOitTransparentMeshes(currentRoot, meta.opacityMaterialName);
  }

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
  currentRoot = root;

  applyInsetColors(root, meta);

  // 1) разрезаем multi-material меши (иначе сечения могут исчезнуть)
  splitMultiMaterialMeshes(root, meta.opacityMaterialName);

  // 2) сначала собираем материалы под слайдер
  controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);

  // 3) включаем/обновляем OIT-флаги с учётом текущей прозрачности
  markOitTransparentMeshes(root, meta.opacityMaterialName);

  // 4) ставим модель в сцену
  threeSetModel(root);

  // 5) применяем opacity на материал
  applyOpacityToControlled();

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
