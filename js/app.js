// js/app.js
//
// Главный вход приложения.
// Добавлена проверка доступа по chat_instance.
//
// Если пользователь НЕ в нужной группе — показываем lockScreen и НЕ запускаем приложение.

import { initGallery } from "./gallery.js";
import { initViewer } from "./viewer.js";

/* ============================================================
   0. ДОСТУП ТОЛЬКО ИЗ КОНКРЕТНОЙ ГРУППЫ
   ============================================================ */

// ⚠️ УСТАНОВИ сюда chat_instance ТВОЕЙ закрытой группы:
const ALLOWED_CHAT_INSTANCES = [
  "-561659029981423148", // группа 1
  "3659198091171037064", // группа 2
  "1533210958432912681"  // группа 3
];

// Показывает красивый экран "Доступ ограничен"
function showLockScreen(message) {
  document.body.innerHTML = `
    <div style="
      display:flex;
      align-items:center;
      justify-content:center;
      flex-direction:column;
      height:100vh;
      padding:24px;
      font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
      background:#111;
      color:#eee;
      text-align:center;
    ">
      <h1 style="font-size:22px;margin-bottom:12px;">Доступ ограничен</h1>
      <p style="opacity:0.8;max-width:360px;">${message}</p>
    </div>
  `;
}

// Проверяем, можно ли запускать приложение
function checkAccess() {
  const tg = window.Telegram?.WebApp;

  // Запуск НE в Telegram → не пускаем
  if (!tg || !tg.initDataUnsafe) {
    showLockScreen("Откройте мини-приложение через Telegram в закрытой группе.");
    return false;
  }

  const ci = tg.initDataUnsafe.chat_instance;

  // Запуск в Telegram, но не из нашей группы
  if (!ci || !ALLOWED_CHAT_INSTANCES.includes(ci)) {
  showLockScreen("Мини-приложение доступно только участникам закрытых чатов.");
  return false;
}

  // Всё хорошо
  return true;
}

/* ============================================================
   1. Telegram Mini App — initData / user / chat_instance
   ============================================================ */

window.TG_USER = null;
window.TG_CHAT_INSTANCE = null;
window.TG_INIT_DATA = "";

(function () {
  const tg = window.Telegram?.WebApp;

  if (tg) {
    try {
      tg.ready();
      tg.expand();

      const unsafe = tg.initDataUnsafe || {};
      window.TG_INIT_DATA = tg.initData || "";
      window.TG_USER = unsafe.user || null;
      window.TG_CHAT_INSTANCE = unsafe.chat_instance || null;

      console.log("TG initDataUnsafe:", unsafe);
      console.log("TG initData RAW:", tg.initData);
      console.log("TG user:", window.TG_USER);
      console.log("TG chat_instance:", window.TG_CHAT_INSTANCE);

      // ---------- WATERMARK (canvas-only, repeated) ----------
// ---------- WATERMARK (viewer-based, stable) ----------
if (window.TG_USER?.id) {
  const wm = document.getElementById("watermark");
  const viewer = document.getElementById("viewerWrapper");

  if (wm && viewer) {
    const id = String(window.TG_USER.id);
    let raf = null;

    const rebuild = () => {
      if (raf) cancelAnimationFrame(raf);

      raf = requestAnimationFrame(() => {
        const rect = viewer.getBoundingClientRect();

        const step = 140;
        const cols = Math.ceil(rect.width / step) + 18;
        const rows = Math.ceil(rect.height / step) + 18;

        const offsetX = -Math.floor(cols / 2) * step;
        const offsetY = -Math.floor(rows / 2) * step;

        let html = "";
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            html += `<span style="left:${offsetX + x * step}px; top:${offsetY + y * step}px">${id}</span>`;
          }
        }
        wm.innerHTML = html;
      });
    };

    // первый расчёт
    rebuild();

    // реакции на изменения размеров
    window.addEventListener("resize", rebuild);
    window.addEventListener("orientationchange", () => setTimeout(rebuild, 150));
    document.addEventListener("fullscreenchange", () => setTimeout(rebuild, 150));
    window.visualViewport?.addEventListener("resize", rebuild);
  }
}

    } catch (e) {
      console.warn("Telegram WebApp init warning:", e);
    }
  } else {
    console.log("Не Telegram WebApp");
  }
})();

/* ===========================================================
   2. Старт приложения с проверкой доступа
   ============================================================ */

function initApp() {
  // 🔥 1. Проверяем доступ
  if (!checkAccess()) {
    return; // останемся на lockScreen
  }

  // 🔥 2. Собираем элементы интерфейса (как было)
  const galleryEl = document.getElementById("gallery");
  const viewerWrapperEl = document.getElementById("viewerWrapper");

  const modelLabelEl = document.getElementById("modelLabel");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const backBtn = document.getElementById("backBtn");

  const tab3dBtn = document.getElementById("tab3d");
  const tabSchemeBtn = document.getElementById("tabScheme");
  const tabVideoBtn = document.getElementById("tabVideo");

  const canvasEl = document.getElementById("canvas");

  const schemeOverlayEl = document.getElementById("schemeOverlay");
  const schemeImgEl = document.getElementById("schemeImage");

const videoOverlayEl = document.getElementById("videoOverlay"); // CHANGED
const videoListEl = document.getElementById("videoList"); // ADDED
const videoEmptyEl = document.getElementById("videoEmpty"); // ADDED

  const loadingEl = document.getElementById("loading");
  const loadingTextEl = document.getElementById("loadingText");
  const progressBarEl = document.getElementById("progressBar");

  const statusEl = document.getElementById("status");

  window.debugLog = { textContent: "" };

  // ---------- WATERMARK VISIBILITY ----------
  const watermarkEl = document.getElementById("watermark");
  if (watermarkEl && viewerWrapperEl) {
    const sync = () => {
      watermarkEl.style.display =
        viewerWrapperEl.classList.contains("visible") ? "block" : "none";
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(viewerWrapperEl, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  // 🔥 3. Инициализация Viewer
  const viewer = initViewer({
    galleryEl,
    viewerWrapperEl,

    modelLabelEl,
    prevBtn,
    nextBtn,
    backBtn,

    tab3dBtn,
    tabSchemeBtn,
    tabVideoBtn,

    canvasEl,

    schemeOverlayEl,
    schemeImgEl,

videoOverlayEl,   // CHANGED
videoListEl,      // ADDED
videoEmptyEl,     // ADDED

    loadingEl,
    loadingTextEl,
    progressBarEl,
    statusEl
  });

  // 🔥 4. Инициализация галереи
  initGallery(galleryEl, {
    onSelect: viewer.openModelById
  });

  console.log("App initialized: access granted.");
}

window.addEventListener("DOMContentLoaded", initApp);
