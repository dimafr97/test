// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.
import * as THREE from "three";
import {
  setModel as threeSetModel,
  setInsetBlendEnabled,
  setInsetBlendState,
  setInsetSectionBlendState,
  setCadOverlay,
  clearCadOverlay,
  setOutlineEnabled,
  setOutlineStyle,
  setCadAlpha,
  setInsetNeutralLighting
} from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
// ✅ защита от гонок при быстрых переключениях врезок
let insetLoadSeq = 0;
// ✅ Материалы, которыми управляет ползунок прозрачности
let controlledMaterials = [];
let sectionMaterials = [];
let currentOpacity = 1; // 0..1


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

  setInsetBlendEnabled(true);
  setInsetNeutralLighting(true);
    // Контуры только во Врезках
  setOutlineEnabled(true);
  setOutlineStyle({ thicknessPx: 1.5, edgesAngle: 60 });
  setInsetBlendState(0, []); // ✅ пока модель не загружена — материалов ещё нет
  setInsetSectionBlendState(0.5, []); // пока не загрузили — материалов нет, но коэффициент фиксируем

  // ✅ Сбрасываем прозрачность на 100% при входе во Врезки
  currentOpacity = 1;
  if (dom?.insetOpacitySlider) dom.insetOpacitySlider.value = "100";
}


function exitInsetMode() {
  document.body.classList.remove("inset-mode");
    setInsetBlendState(0, []);
  setInsetBlendEnabled(false);
  setInsetNeutralLighting(false);
    clearCadOverlay();
    setOutlineEnabled(false);
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

    // ✅ рисуем обе стороны (чтобы изнутри тоже было видно)
    m.side = THREE.DoubleSide;

    const needTransparent = currentOpacity < 0.999;

    // Важно: opacity работает только если transparent=true
    m.transparent = needTransparent;
    m.opacity = currentOpacity;

    // чтобы прозрачность работала адекватно (и видеть "внутри")
    m.depthWrite = !needTransparent;

    m.needsUpdate = true;
  }
}


// ✅ Применить “плоские” цвета материалам сечений (например "2" и "3")
// meta.materialColors ожидается как объект: { "2": "#ff3b30", "3": "#34c759" }
function applyInsetColors(root, meta) {
if (!root || !meta) return;

// цвета могут быть пустыми — это нормально
const colors = meta.materialColors || {};

// список материалов-сечений
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

// цвет — только если есть hex
if (hex && m.color) m.color.set(hex);

// DoubleSide — если нужен всем
m.side = THREE.DoubleSide;

// матовый вид
if ("metalness" in m) m.metalness = 0;
if ("roughness" in m) m.roughness = 1;

// только сечения — плёнка
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

// ===============================
// CAD points from glTF nodes (Dummy/Point helpers)
// ===============================
// ===============================
// CAD points from glTF nodes (small meshes named a,b,c,d...)
// ===============================
function buildCadSpecFromModel(root, cadMeta) {
  if (!root || !cadMeta || !cadMeta.fromNodes) return null;

  // Какие имена считаем "точками":
  // - одиночные буквы: a, b, c...
  // - или буква + цифры: a1, b12 (на будущее)
  const pointNameRe = /^[a-z](\d+)?$/;

  const points = [];
  const pointMap = new Map(); // name -> {id,x,y,z}

  root.traverse((obj) => {
    const name = String(obj.name || "").trim();
    if (!pointNameRe.test(name)) return;

    // Берём позицию уже после всех трансформаций (в т.ч. normalizeModel)
    const p = new THREE.Vector3();
    obj.getWorldPosition(p);

    const pt = { id: name, x: p.x, y: p.y, z: p.z };
    pointMap.set(name, pt);
    points.push(pt);

    // Скрываем "точку", если она экспортнулась как видимый mesh
    obj.visible = false;
  });

  // Стабильный порядок: сортируем по имени (a,b,c... a1,a2...)
  points.sort((p1, p2) => p1.id.localeCompare(p2.id, "en"));

  const lines = Array.isArray(cadMeta.lines) ? cadMeta.lines : [];

  // (опционально) можно отфильтровать линии, у которых нет точек
  const filteredLines = lines.filter(([a, b]) => pointMap.has(String(a)) && pointMap.has(String(b)));

  return { points, lines: filteredLines };
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
  const uiOpacity = Math.max(0, Math.min(1, v / 100));   // 0..1
  const cadAlpha = Math.min(1, Math.max(0, (1 - uiOpacity) / 0.3));
setCadAlpha(cadAlpha);

  // 0..0.7 — реальная прозрачность как раньше
  if (uiOpacity <= 0.7) {
    currentOpacity = uiOpacity;
    applyOpacityToControlled();

    // смешивание выключаем
    setInsetBlendState(0, controlledMaterials);
    return;
  }

  // 0.7..1.0 — фиксируем "реальную" прозрачность на 0.7
  // и плавно смешиваем картинку 70% -> 100% opaque
  const t = (uiOpacity - 0.7) / 0.3; // 0..1
  currentOpacity = 0.7;
  applyOpacityToControlled();

  setInsetBlendState(t, controlledMaterials);
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
  sectionMaterials = [];
}

export function openById(id) {
  const meta = getInsetMeta(id);
  if (!meta) {
    console.error("No inset:", id);
    return;
  }

currentId = id;
enterInsetMode();

// ✅ новый токен загрузки (всё, что придёт со старым токеном — игнорим)
const mySeq = ++insetLoadSeq;

// ✅ сразу чистим CAD от предыдущей врезки, чтобы не "мигало" старым
clearCadOverlay();

// ✅ показываем viewer
dom.galleryEl?.classList.add("hidden");
dom.viewerWrapperEl?.classList.add("visible");

// ✅ подпись
if (dom.modelLabelEl) dom.modelLabelEl.textContent = meta.name;

// ✅ загрузка
showLoading(`Загрузка: ${meta.name}`);

loadModel(meta.sourceId || meta.id, {
  onProgress: (p) => setProgress(p),
  onStatus: (s) => setStatus(s)
})

  .then(({ root }) => {
      // ✅ если пока грузилось — ты уже переключился на другую врезку/вышел
  if (mySeq !== insetLoadSeq) return;
  if (!document.body.classList.contains("inset-mode")) return;
    // ✅ 1) сначала применяем цвета сечений (если они заданы в meta)
    applyInsetColors(root, meta);

    // ✅ 2) показываем модель в threeViewer
threeSetModel(root);

// ✅ CAD: либо из конфигурации (ручные coords), либо из Dummy/Point внутри glTF
const cadSpec = meta?.cad?.fromNodes
  ? buildCadSpecFromModel(root, meta.cad)
  : meta.cad;

setCadOverlay(cadSpec);
    // применяем текущую прозрачность CAD при первом открытии
const cadAlpha = Math.min(1, Math.max(0, (1 - currentOpacity) / 0.3));
setCadAlpha(cadAlpha);

    // ✅ 3) находим материалы, которыми управляет ползунок (например "1")
    controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);
    setInsetBlendState(0, controlledMaterials);
    // ✅ собираем материалы сечений (2/3/4) и включаем их статичный микс
sectionMaterials = [];
const secNames = Array.isArray(meta.sectionMaterialNames) ? meta.sectionMaterialNames : [];
for (const n of secNames) {
  sectionMaterials.push(...collectMaterialsByName(root, n));
}
// уникализируем
sectionMaterials = Array.from(new Set(sectionMaterials));

setInsetSectionBlendState(0.5, sectionMaterials);

    // ✅ 4) применяем текущую прозрачность
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
  // ✅ если ошибка от старой загрузки — игнорим
  if (mySeq !== insetLoadSeq) return;
  if (!document.body.classList.contains("inset-mode")) return;

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
