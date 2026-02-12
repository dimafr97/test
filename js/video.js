// js/video.js
//
// FINAL (Cards -> Player Mode inside Video tab)
//
// Спецификация:
// 1) Режим "Карточки":
//    - сетка 16:9
//    - превью = пытаемся снять первый кадр в <img> (без <video> в карточке)
//    - скролл работает
//    - табы [3D][Построение][Видео] видны
//
// 2) Режим "Плеер":
//    - показываем один <video> на всю область вкладки
//    - табы скрываем
//    - вместо табов показываем панель: [⬅ К карточкам] [⏮] [⏭]
//    - панель видна ТОЛЬКО когда видео на паузе
//    - на play панель скрыта
//
// Важно (iOS/TG):
// - НЕЛЬЗЯ делать fetch/blob ДО play() — теряется user gesture.
// - Поэтому: ставим src прямым URL и пытаемся play() сразу в клике по карточке.
// - Чтобы не было "зачеркнутого play" пока не готово — мы скрываем controls до canplay.
//
// Прогрев IDB: cachedFetch() вызываем отдельно, не блокирует playback.

import { cachedFetch } from "./cache/cachedFetch.js";

let overlayEl = null;
let listEl = null;
let emptyEl = null;

// место где сидят табы (toolbar)
let toolbarEl = null;
let tab3dBtn = null;
let tabSchemeBtn = null;
let tabVideoBtn = null;

let active = false;
let onPlayCb = null;
let onPauseCb = null;

let videoList = []; // raw urls
let cards = [];     // { wrap, url, srcUrl, img }
let currentIndex = -1;

let isPlayerOpen = false;

// Player DOM
let playerWrap = null;
let playerVideo = null;
let playerLoading = null;

// Blob fallback (iOS / Telegram)
let currentBlobUrl = null;
let blobLoading = false;

// Panel DOM (вместо табов)
let navPanel = null;
let btnBack = null;
let btnPrev = null;
let btnNext = null;
// UI auto-hide
let uiHideTimer = null;
let uiPinned = false; // пользователь взаимодействует (таймлайн / drag)


/* =========================
   Utils
   ========================= */

function withInitData(url) {
  try {
    if (!window.TG_INIT_DATA) return url;
    const u = new URL(url);
    if (!u.searchParams.get("initData")) {
      u.searchParams.set("initData", window.TG_INIT_DATA);
    }
    return u.toString();
  } catch (e) {
    return url;
  }
}

function warmCache(url) {
  try {
    cachedFetch(url).catch(() => {});
  } catch (e) {}
}

function modIndex(i) {
  if (!videoList || videoList.length === 0) return -1;
  return (i + videoList.length) % videoList.length;
}

function setLoading(on) {
  if (!playerLoading) return;
  playerLoading.style.display = on ? "flex" : "none";
}

function showListMode() {
  isPlayerOpen = false;

  if (playerWrap) playerWrap.style.display = "none";
  if (listEl) listEl.style.display = "grid";

  showTabs();
  hideNavPanel();
}

function showPlayerMode() {
  isPlayerOpen = true;

  if (listEl) listEl.style.display = "none";
  if (playerWrap) playerWrap.style.display = "flex";

  // табы скрыты всегда в режиме плеера
  hideTabs();
}

function hideTabs() {
  if (tab3dBtn) tab3dBtn.style.display = "none";
  if (tabSchemeBtn) tabSchemeBtn.style.display = "none";
  if (tabVideoBtn) tabVideoBtn.style.display = "none";
}

function showTabs() {
  if (tab3dBtn) tab3dBtn.style.display = "";
  if (tabSchemeBtn) tabSchemeBtn.style.display = "";
  if (tabVideoBtn) tabVideoBtn.style.display = "";
}

function showNavPanel() {
  if (!navPanel) return;
  navPanel.style.display = "flex";
}

function hideNavPanel() {
  if (!navPanel) return;
  navPanel.style.display = "none";
}
function showVideoUI() {
  showNavPanel();

  if (uiHideTimer) clearTimeout(uiHideTimer);

  uiHideTimer = setTimeout(() => {
    hideNavPanel();
  }, 3000);
}


/* =========================
   Ensure DOM: Player
   ========================= */

function ensurePlayerDom() {
  if (playerWrap) return;
  if (!overlayEl) return;

  playerWrap = document.createElement("div");
  playerWrap.id = "videoPlayerWrap";
  playerWrap.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    background: #000;
    overflow: hidden;
  `;

  // Видео на всю область вкладки
  playerVideo = document.createElement("video");
  playerVideo.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: contain;
    background: #000;
    display: block;
  `;

  playerVideo.preload = "metadata";
  playerVideo.setAttribute("playsinline", "");
  playerVideo.setAttribute("webkit-playsinline", "");
  playerVideo.playsInline = true;

  // controls включаем, но на старте спрячем пока не canplay
  playerVideo.controls = true;

  // Хак таймлайна
  playerVideo.addEventListener("loadedmetadata", () => {
    try {
      playerVideo.currentTime = 0.001;
      playerVideo.currentTime = 0;
    } catch (e) {}
  });

  // loading overlay
  playerLoading = document.createElement("div");
  playerLoading.style.cssText = `
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.92);
    font: 600 14px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;
    background: rgba(0,0,0,0.35);
    pointer-events: none;
  `;
  playerLoading.textContent = "Загрузка…";

  // Events
playerVideo.addEventListener("play", () => {
  setLoading(false);
  if (onPlayCb) onPlayCb();
  document.body.classList.add("video-playing");
});


playerVideo.addEventListener("pause", () => {
  setLoading(false);
  if (onPauseCb) onPauseCb();
  document.body.classList.remove("video-playing");
  showNavPanel(); // на паузе всегда видно
});



  playerVideo.addEventListener("waiting", () => setLoading(true));
  playerVideo.addEventListener("playing", () => setLoading(false));
  playerVideo.addEventListener("canplay", () => {
    setLoading(false);
    // как только canplay — controls точно становятся “живыми”
    playerVideo.controls = true;
  });

  playerVideo.addEventListener("error", () => {
    setLoading(false);
    console.error("[video] player error:", playerVideo.error);
  });

  playerWrap.appendChild(playerVideo);
  playerWrap.appendChild(playerLoading);
   
   // === Show UI on ANY interaction (PC + Mobile) ===

// Любое движение мыши по видео (ПК)
playerWrap.addEventListener("mousemove", () => {
  if (!isPlayerOpen) return;
  showVideoUI(true);
});

// Любой тап по экрану (мобилка)
playerWrap.addEventListener("touchstart", () => {
  if (!isPlayerOpen) return;
  showVideoUI(true);
}, { passive: true });

// Pointer fallback (универсально)
playerWrap.addEventListener("pointerdown", () => {
  if (!isPlayerOpen) return;
  showVideoUI(true);
});


  overlayEl.appendChild(playerWrap);
}

/* =========================
   Ensure DOM: Nav Panel (в тулбаре)
   ========================= */

function ensureNavPanel() {
  if (navPanel) return;
  if (!toolbarEl) return;

  navPanel = document.createElement("div");
  navPanel.id = "videoNavPanel";
  navPanel.style.cssText = `
    display: none;
    width: 100%;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
  `;

  // Левая кнопка "к карточкам"
  btnBack = document.createElement("button");
  btnBack.type = "button";
  btnBack.textContent = "⬅ К карточкам";
  btnBack.style.cssText = `
    appearance: none;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.92);
    border-radius: 999px;
    padding: 10px 12px;
    font: 600 13px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
    flex: 0 0 auto;
  `;

  const right = document.createElement("div");
  right.style.cssText = `
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
  `;

  btnPrev = document.createElement("button");
  btnPrev.type = "button";
  btnPrev.textContent = "⏮";
  btnPrev.style.cssText = `
    width: 44px; height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.92);
    font: 700 16px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  `;

  btnNext = document.createElement("button");
  btnNext.type = "button";
  btnNext.textContent = "⏭";
  btnNext.style.cssText = `
    width: 44px; height: 44px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.18);
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.92);
    font: 700 16px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  `;

  right.appendChild(btnPrev);
  right.appendChild(btnNext);

  navPanel.appendChild(btnBack);
  navPanel.appendChild(right);

  // Вставляем панель внутрь toolbar (там где табы)
  toolbarEl.appendChild(navPanel);

  // Handlers
  btnBack.addEventListener("click", () => {
    closePlayerToCards();
  });

  btnPrev.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    openVideoByIndex(modIndex(currentIndex - 1));
  });

  btnNext.addEventListener("click", () => {
    if (!isPlayerOpen) return;
    openVideoByIndex(modIndex(currentIndex + 1));
  });
}


/* =========================
   Cards rendering
   ========================= */

function createCard(url, idx) {
  const srcUrl = withInitData(url);

  const wrap = document.createElement("div");
  wrap.className = "video-card";
wrap.style.cssText = `
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  background: #111;
`;

// === JPG превью (лежит рядом с mp4) ===
const previewImg = document.createElement("img");

// меняем .mp4 -> .jpg
previewImg.src = srcUrl.replace(/\.mp4(\?.*)?$/i, ".jpg$1");

previewImg.alt = `Видео ${idx + 1}`;

previewImg.style.cssText = `
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #050506;
  display: block;
`;

wrap.appendChild(previewImg);



  // play icon overlay
  const icon = document.createElement("div");
  icon.style.cssText = `
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  `;
  icon.innerHTML = `
    <div style="
      width: 56px; height: 56px;
      border-radius: 999px;
      background: rgba(0,0,0,0.45);
      display:flex; align-items:center; justify-content:center;
    ">
      <div style="
        width:0; height:0;
        border-top:10px solid transparent;
        border-bottom:10px solid transparent;
        border-left:16px solid #fff;
        margin-left: 4px;
      "></div>
    </div>
  `;

  wrap.appendChild(icon);

  // Клик -> открыть плеер (это и есть user gesture)
  wrap.addEventListener("click", () => {
    if (!active) return;
    openVideoByIndex(idx);
  });

  // Прогрев кеша (не блокирует ничего)
  warmCache(srcUrl);


  return { wrap, url, srcUrl };
}


function render() {
  if (!listEl) return;

  listEl.innerHTML = "";
  cards = [];
  currentIndex = -1;

  // Grid 2 колонки на ширине, 1 колонка на узких
  listEl.style.display = "grid";
  listEl.style.gridTemplateColumns = "repeat(2, minmax(0, 1fr))";
  listEl.style.gap = "10px";
  listEl.style.padding = "12px";
  listEl.style.overflowY = "auto";
  listEl.style.webkitOverflowScrolling = "touch";

  // на совсем узких — 1 колонка
  const setCols = () => {
    const w = listEl.clientWidth || window.innerWidth || 360;
    listEl.style.gridTemplateColumns = w < 520 ? "1fr" : "repeat(2, minmax(0, 1fr))";
  };
  setCols();
  window.addEventListener("resize", setCols, { passive: true });

  const has = Array.isArray(videoList) && videoList.length > 0;
  if (emptyEl) emptyEl.style.display = has ? "none" : "block";
  if (!has) return;

  videoList.forEach((url, idx) => {
    const card = createCard(url, idx);
    cards.push(card);
    listEl.appendChild(card.wrap);
  });
}

/* =========================
   Playback
   ========================= */

function openVideoByIndex(idx) {
  if (!playerVideo) ensurePlayerDom();
  if (!videoList || !videoList.length) return;

  if (idx < 0) idx = 0;
  if (idx >= videoList.length) idx = videoList.length - 1;

  currentIndex = idx;

  const srcUrl =
    (cards[idx] && cards[idx].srcUrl) ? cards[idx].srcUrl : withInitData(videoList[idx]);

  showPlayerMode();

  // Чтобы не было “зачёркнутого play” пока не готово — временно прячем controls
  // (как только canplay — включим обратно)
  // playerVideo.controls = false;

  // iOS/TG: стартуем muted, потом снимаем mute на playing
  playerVideo.muted = true;

  playerVideo.src = srcUrl;
  playerVideo.load();

  setLoading(true);
  showVideoUI(true);
   playerVideo.controls = true;   // обязательно для iOS
playerVideo.muted = true;      // autoplay policy

const playPromise = playerVideo.play();

if (playPromise && typeof playPromise.catch === "function") {
  playPromise.catch(() => {
    // 🔥 iOS / Telegram отказал обычному play → fallback на blob
    loadBlobAndPlay(srcUrl);
  });
}


  // пытаемся autoplay (gesture — это клик по карточке)
  playerVideo.controls = true;   // 🔥 КРИТИЧНО для iOS
playerVideo.muted = true;


  // Прогрев кеша после старта (не блокирует play)
  warmCache(srcUrl);

  // Снимаем mute когда реально пошло
  const unmuteOnce = () => {
    playerVideo.removeEventListener("playing", unmuteOnce);
    try {
      playerVideo.muted = false;
    } catch (e) {}
  };
  playerVideo.addEventListener("playing", unmuteOnce);
}

function closePlayerToCards() {
  if (!playerVideo) {
    showListMode();
    return;
  }

  try { playerVideo.pause(); } catch (e) {}

  try {
    playerVideo.removeAttribute("src");
    playerVideo.load();
  } catch (e) {}

  setLoading(false);

  showListMode();

  // вернуть UI в норму
  document.body.classList.remove("video-playing");

  // viewer.js пусть покажет обычный UI
  // (если ты хочешь: возвращаем UI полностью)
  if (onPauseCb) onPauseCb();
}

async function loadBlobAndPlay(srcUrl) {
  if (blobLoading) return;
  blobLoading = true;

  try {
    const resp = await fetch(srcUrl);
    const blob = await resp.blob();

    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
    }

    currentBlobUrl = URL.createObjectURL(blob);

    playerVideo.src = currentBlobUrl;
    playerVideo.load();

    await playerVideo.play();
  } catch (e) {
    console.warn("[video] blob fallback failed", e);
  } finally {
    blobLoading = false;
    setLoading(false);
  }
}

/* =========================
   Public API
   ========================= */

export function initVideo(refs, callbacks = {}) {
  overlayEl = refs?.overlayEl || null;
  listEl = refs?.listEl || null;
  emptyEl = refs?.emptyEl || null;

  toolbarEl = refs?.toolbarEl || null;
  tab3dBtn = refs?.tab3dBtn || null;
  tabSchemeBtn = refs?.tabSchemeBtn || null;
  tabVideoBtn = refs?.tabVideoBtn || null;

  onPlayCb = callbacks.onPlay || null;
  onPauseCb = callbacks.onPause || null;

  if (!overlayEl || !listEl) {
    console.error("initVideo: overlayEl/listEl not provided");
    return;
  }

  ensurePlayerDom();
  ensureNavPanel();

  // старт: карточки
  showListMode();
}

export function activateVideo() {
  active = true;
  // при открытии вкладки видео — карточки и табы должны быть видны
  if (!isPlayerOpen) {
    showListMode();
  }
}

export function setVideoList(list) {
  videoList = Array.isArray(list) ? list : (list ? [list] : []);
  render();
}

export function deactivateVideo() {
  active = false;

  // при уходе из вкладки Видео — закрываем плеер в карточки
  if (isPlayerOpen) {
    closePlayerToCards();
  } else {
    showListMode();
  }
}
