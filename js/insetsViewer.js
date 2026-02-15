// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.

import { initThree, setModel as threeSetModel } from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
let threeInited = false;

export function initInsetsViewer(refs) {
  dom = { ...refs };
  if (!dom.canvasEl) throw new Error("initInsetsViewer: canvasEl missing");

  // threeViewer singleton — инициализируем только один раз на весь проект
  if (!threeInited) {
    initThree(dom.canvasEl);
    threeInited = true;
  }

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
}

function exitInsetMode() {
  document.body.classList.remove("inset-mode");
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
      hideLoading();
      setStatus("");
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
