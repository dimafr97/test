// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.

import { setModel as threeSetModel } from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
// ✅ Материалы, которыми управляет ползунок прозрачности
let controlledMaterials = [];
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
    const needTransparent = currentOpacity < 0.999;

    // Важно: opacity работает только если transparent=true
    m.transparent = needTransparent;
    m.opacity = currentOpacity;

    // Чтобы прозрачность выглядела стабильнее:
    // когда объект прозрачный, глубину лучше не писать
    m.depthWrite = !needTransparent;

    m.needsUpdate = true;
  }
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
      // ✅ Важно: на телефоне не отдаём тач/drag дальше (в canvas), иначе ползунок не тянется
if (dom.insetOpacitySlider) {
  // ✅ 1) "Подхватываем" ползунок по месту касания.
  // Это решает проблему, когда бегунок стоит в самом начале и не тянется.
  const snapToPointer = (e) => {
    const el = dom.insetOpacitySlider;
    const rect = el.getBoundingClientRect();

    // pointer events дают clientX и на мобилке, и на десктопе
    const x = Math.min(rect.right, Math.max(rect.left, e.clientX));
    const t = (x - rect.left) / rect.width; // 0..1

    const min = Number(el.min || 0);
    const max = Number(el.max || 100);
    const value = Math.round(min + t * (max - min));

    el.value = String(value);

    // применяем сразу
    currentOpacity = Math.max(0, Math.min(1, value / 100));
    applyOpacityToControlled();
  };

  // ✅ 2) Не отдаём событие в canvas (иначе тач начинает вращать сцену)
  const stop = (e) => {
    e.stopPropagation();
  };

  // ВАЖНО: сначала snap, потом stop
  dom.insetOpacitySlider.addEventListener("pointerdown", snapToPointer, { passive: true });
  dom.insetOpacitySlider.addEventListener("pointerdown", stop, { passive: true });

  // touchstart/touchmove можно оставить как у тебя (это не мешает)
  dom.insetOpacitySlider.addEventListener("touchstart", stop, { passive: true });
  dom.insetOpacitySlider.addEventListener("touchmove", stop, { passive: true });
}

  });
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
    threeSetModel(root);

    // ✅ Находим материалы, которыми управляет ползунок (в твоём случае "3")
    controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);

    // ✅ Применяем текущую прозрачность (по умолчанию 1)
    applyOpacityToControlled();

    // ✅ Для контроля можно показать статус (можно потом убрать)
    if (controlledMaterials.length === 0) {
      setStatus(`Материал "${meta.opacityMaterialName}" не найден`);
    } else {
      setStatus(""); // или: setStatus(`Материал "${meta.opacityMaterialName}" найден (${controlledMaterials.length})`);
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
