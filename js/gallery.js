// js/gallery.js
//
// Модуль отвечает за:
// - рендеринг галереи (любой список карточек),
// - создание карточек,
// - обработку кликов,
// - вызов колбэка onSelect(id).
//
// НЕ содержит three.js, viewer, UI вкладок и т.п.

import { MODELS } from "./models.js";

/**
 * Универсальный рендер галереи для любого списка карточек.
 *
 * @param {HTMLElement} containerEl — DOM-элемент галереи (#gallery)
 * @param {Array} items — массив элементов (models/sections)
 * @param {object} options
 * @param {function(string):void} options.onSelect — вызывается при клике по карточке
 */
export function renderGallery(containerEl, items, { onSelect }) {
  if (!containerEl) {
    console.error("renderGallery: containerEl is null");
    return;
  }

  if (typeof onSelect !== "function") {
    console.error("renderGallery: onSelect must be a function");
    return;
  }

  containerEl.innerHTML = "";

  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.model = m.id;

    const thumb = document.createElement("div");
    thumb.className = "model-thumb";

if (m.preview) {
  const img = document.createElement("img");

  // Если preview уже абсолютный URL — используем как есть.
  // Если это относительный путь вроде "textures/1/preview.png",
  // прогоняем через тот же защищённый API-формат.
  const isAbsolute =
    /^https?:\/\//i.test(m.preview) ||
    m.preview.startsWith("/") ||
    m.preview.startsWith("data:");

  img.src = isAbsolute
    ? m.preview
    : `https://api.apparchi.ru/?path=${encodeURIComponent(m.preview)}`;

  img.alt = m.name || "";
  img.loading = "lazy";
  img.decoding = "async";
  thumb.appendChild(img);
} else {
      thumb.textContent = m.thumbLetter || (m.name ? m.name.charAt(0) : "?");
    }

    const caption = document.createElement("div");
    caption.className = "model-caption";
    caption.textContent = m.name || "";

    const desc = document.createElement("div");
    desc.className = "model-desc";
    desc.textContent = m.desc || "";

    card.appendChild(thumb);
    card.appendChild(caption);
    card.appendChild(desc);

    card.addEventListener("click", () => onSelect(m.id));
    containerEl.appendChild(card);
  });
}

/**
 * Совместимость со старым поведением:
 * initGallery рендерит MODELS (как раньше).
 */
export function initGallery(containerEl, { onSelect }) {
  renderGallery(containerEl, MODELS, { onSelect });
}

/**
 * Показать галерею
 */
export function showGallery(containerEl, viewerWrapperEl) {
  if (containerEl) containerEl.classList.remove("hidden");
  if (viewerWrapperEl) viewerWrapperEl.classList.remove("visible");
}

/**
 * Скрыть галерею
 */
export function hideGallery(containerEl) {
  if (containerEl) containerEl.classList.add("hidden");
}
