// js/viewer.js
//
// Viewer (tabs: 3D / Scheme / Video)
// Поддерживает video overlay: #videoOverlay с #videoList и #videoEmpty
// Video.js сам управляет: карточки <-> режим плеера + панель в тулбаре

import { MODELS, loadModel, getModelMeta } from "./models.js";
import { initThree, setModel as threeSetModel, resize as threeResize } from "./threeViewer.js";
import { initScheme, setSchemeImages, activateScheme, deactivateScheme } from "./scheme.js";
import { initVideo, setVideoList, activateVideo, deactivateVideo } from "./video.js";

let dom = null;
let currentModelId = null;
let activeView = "3d"; // "3d" | "scheme" | "video"

export function initViewer(refs) {
  dom = { ...refs };

  if (!dom.viewerToolbarEl) {
    dom.viewerToolbarEl = document.querySelector(".viewer-toolbar");
  }

  initThree(dom.canvasEl);

  initScheme({
    overlayEl: dom.schemeOverlayEl,
    imgEl: dom.schemeImgEl,
    onUiVisibility: (hidden) => {
      if (activeView !== "scheme") {
        setUiHidden(false);
        return;
      }
      setUiHidden(hidden);
    }
  });

  // VIDEO init (важно: refs совпадают с новым video.js)
  initVideo(
    {
      overlayEl: dom.videoOverlayEl,
      listEl: dom.videoListEl,
      emptyEl: dom.videoEmptyEl,

      toolbarEl: dom.viewerToolbarEl,
      tab3dBtn: dom.tab3dBtn,
      tabSchemeBtn: dom.tabSchemeBtn,
      tabVideoBtn: dom.tabVideoBtn
    },
    {
onPlay: () => {
  // НЕ прячем тулбар, иначе navPanel не появится никогда
  setUiHidden(false);
  document.body.classList.add("video-playing");
},

onPause: () => {
  setUiHidden(false);
  document.body.classList.remove("video-playing");
}

    }
  );

  setupUiHandlers();
  setup3dUiAutoHide();
  setupGlobalTouchBlock();

  window.addEventListener("resize", handleResize);

  showGallery();

  return {
    openModelById,
    showGallery,
    handleResize
  };
}

function handleResize() {
  threeResize();
  if (activeView === "scheme") {
    activateScheme();
  }
}

function setupUiHandlers() {
  const { backBtn, prevBtn, nextBtn, tab3dBtn, tabSchemeBtn, tabVideoBtn } = dom;

  backBtn.addEventListener("click", () => showGallery());

  nextBtn.addEventListener("click", () => {
    if (!currentModelId) {
      openModelById(MODELS[0].id);
      return;
    }
    let idx = getModelIndex(currentModelId);
    idx = (idx + 1) % MODELS.length;
    openModelById(MODELS[idx].id);
  });

  prevBtn.addEventListener("click", () => {
    if (!currentModelId) {
      openModelById(MODELS[0].id);
      return;
    }
    let idx = getModelIndex(currentModelId);
    idx = (idx - 1 + MODELS.length) % MODELS.length;
    openModelById(MODELS[idx].id);
  });

  tab3dBtn.addEventListener("click", () => setViewMode("3d"));

  tabSchemeBtn.addEventListener("click", () => {
    const meta = getCurrentModelMeta();
    if (!meta || !meta.schemes || meta.schemes.length === 0) return;
    setViewMode("scheme");
  });

  tabVideoBtn.addEventListener("click", () => {
    const meta = getCurrentModelMeta();
    if (!meta || !meta.video || meta.video.length === 0) return;
    setViewMode("video");
  });
}

function setupGlobalTouchBlock() {
  const { viewerWrapperEl } = dom;

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!viewerWrapperEl || !viewerWrapperEl.classList.contains("visible")) return;

      // В режиме Видео и когда не playing — даём скролл списка
      if (activeView === "video" && !document.body.classList.contains("video-playing")) {
        const inVideoOverlay = e.target && e.target.closest && e.target.closest("#videoOverlay");
        if (inVideoOverlay) return;
      }

      e.preventDefault();
    },
    { passive: false }
  );
}

function getModelIndex(id) {
  return MODELS.findIndex((m) => m.id === id);
}

function getCurrentModelMeta() {
  if (!currentModelId) return null;
  return getModelMeta(currentModelId);
}

function openModelById(modelId) {
  const meta = getModelMeta(modelId);
  if (!meta) return;

  currentModelId = modelId;

  dom.modelLabelEl.textContent = meta.name;

  hideGallery();
  showViewer();
  setUiHidden(false);

  configureViewTabsForModel(meta);

  startModelLoading(meta);
}

function startModelLoading(meta) {
  showLoading("Загрузка…", 0);
  setStatus("Загрузка: " + meta.name);

  loadModel(meta.id, {
    onProgress: (percent) => {
      if (typeof percent === "number") {
        showLoading("Загрузка: " + percent.toFixed(0) + "%", percent);
      } else {
        showLoading("Загрузка…", null);
      }
    },
    onStatus: (text) => setStatus(text)
  })
    .then(({ root }) => {
      threeSetModel(root);
      hideLoading();
      setViewMode("3d");
    })
    .catch((err) => {
      console.error("Ошибка загрузки модели:", err);
      hideLoading();
      setStatus("Ошибка загрузки модели");
      alert("Ошибка загрузки модели.");
    });
}

function configureViewTabsForModel(meta) {
  const { tabSchemeBtn, tabVideoBtn } = dom;

  const hasScheme = meta.schemes && meta.schemes.length > 0;
  const hasVideo = meta.video && meta.video.length > 0;

  if (hasScheme) {
    tabSchemeBtn.classList.remove("disabled");
    setSchemeImages(meta.schemes);
  } else {
    tabSchemeBtn.classList.add("disabled");
    setSchemeImages([]);
  }

  if (hasVideo) {
    tabVideoBtn.classList.remove("disabled");
    setVideoList(meta.video);
  } else {
    tabVideoBtn.classList.add("disabled");
    setVideoList([]);
  }

  setViewMode("3d");
}

function setViewMode(mode) {
  activeView = mode;

  const {
    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn,
    schemeOverlayEl,
    videoOverlayEl
  } = dom;

  tab3dBtn.classList.toggle("active", mode === "3d");
  tabSchemeBtn.classList.toggle("active", mode === "scheme");
  tabVideoBtn.classList.toggle("active", mode === "video");

  // scheme
  if (schemeOverlayEl) {
    const isScheme = mode === "scheme";
    schemeOverlayEl.style.display = isScheme ? "flex" : "none";
    if (isScheme) activateScheme();
    else deactivateScheme();
  }

  // video
  if (videoOverlayEl) {
    const isVideo = mode === "video";
    videoOverlayEl.style.display = isVideo ? "flex" : "none";

    if (isVideo) {
      activateVideo();
    } else {
      // уходя с видео — гарантированно закрываем плеер и возвращаем UI
      deactivateVideo();
      document.body.classList.remove("video-playing");
    }
  }

  // UI rules:
  // - в схеме: UI управляется scheme.js
  // - в 3d: UI показываем
  // - при уходе из scheme: возвращаем UI
  if (mode !== "scheme") {
    setUiHidden(false);
  }
}

function showGallery() {
  const { galleryEl, viewerWrapperEl } = dom;
  if (galleryEl) galleryEl.classList.remove("hidden");
  if (viewerWrapperEl) viewerWrapperEl.classList.remove("visible");
  setStatus("");
}

function hideGallery() {
  const { galleryEl } = dom;
  if (galleryEl) galleryEl.classList.add("hidden");
}

function showViewer() {
  const { viewerWrapperEl } = dom;
  if (viewerWrapperEl) viewerWrapperEl.classList.add("visible");
}

function showLoading(text, percent) {
  const { loadingEl, loadingTextEl, progressBarEl } = dom;
  if (!loadingEl || !loadingTextEl || !progressBarEl) return;

  loadingEl.style.display = "flex";
  loadingTextEl.textContent = text;

  if (typeof percent === "number") progressBarEl.style.width = percent.toFixed(0) + "%";
  else progressBarEl.style.width = "15%";
}

function hideLoading() {
  const { loadingEl } = dom;
  if (!loadingEl) return;
  loadingEl.style.display = "none";
}

function setStatus(text) {
  const { statusEl } = dom;
  if (!statusEl) return;
  statusEl.textContent = text || "";
}

function setUiHidden(hidden) {
  const { viewerToolbarEl, statusEl } = dom;
  if (!viewerToolbarEl || !statusEl) return;

  if (hidden) {
    viewerToolbarEl.classList.add("ui-hidden");
    statusEl.classList.add("ui-hidden");
  } else {
    viewerToolbarEl.classList.remove("ui-hidden");
    statusEl.classList.remove("ui-hidden");
  }
}

function setup3dUiAutoHide() {
  const { canvasEl, viewerWrapperEl } = dom;
  if (!canvasEl || !viewerWrapperEl) return;

  let isDown = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const MOVE_THRESHOLD = 6;

  const isViewerVisible = () => viewerWrapperEl.classList.contains("visible");
  const is3dActive = () => activeView === "3d";

  const getPoint = (e) => {
    if (typeof e.clientX === "number") return { x: e.clientX, y: e.clientY };
    const t = e.touches && e.touches[0];
    return { x: t ? t.clientX : 0, y: t ? t.clientY : 0 };
  };

  const onDown = (e) => {
    if (!isViewerVisible() || !is3dActive()) return;
    isDown = true;
    moved = false;
    const p = getPoint(e);
    startX = p.x;
    startY = p.y;
  };

  const onMove = (e) => {
    if (!isDown) return;
    if (!isViewerVisible() || !is3dActive()) return;
    const p = getPoint(e);
    const dx = p.x - startX;
    const dy = p.y - startY;
    if (!moved && Math.hypot(dx, dy) >= MOVE_THRESHOLD) {
      moved = true;
      setUiHidden(true);
    }
  };

  const onUp = () => {
    if (!isViewerVisible() || !is3dActive()) return;
    if (!moved) setUiHidden(false);
    isDown = false;
  };

  canvasEl.addEventListener("pointerdown", onDown, { passive: true });
  canvasEl.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
}
