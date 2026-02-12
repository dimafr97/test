// js/gallery.js
//
// Модуль отвечает за:
// - рендеринг галереи моделей из MODELS,
// - создание карточек,
// - обработку кликов,
// - вызов колбэка onSelect(modelId).
//
// НЕ содержит three.js, viewer, UI вкладок и т.п.
// НЕ знает о 3D, схемах, видео.
// Лишь выводит список моделей и даёт сигнал о выборе.
//

import { MODELS } from "./models.js";

/**
 * Инициализация галереи.
 *
 * @param {HTMLElement} containerEl — DOM-элемент галереи (#gallery)
 * @param {object} options
 * @param {function(string):void} options.onSelect — вызывается при клике по карточке
 */
export function initGallery(containerEl, { onSelect }) {
  if (!containerEl) {
    console.error("initGallery: containerEl is null");
    return;
  }

  if (typeof onSelect !== "function") {
    console.error("initGallery: onSelect must be a function");
    return;
  }

  // Очистка контейнера
  containerEl.innerHTML = "";

  // Рендер карточек
  MODELS.forEach((m) => {
    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.model = m.id;

// === Превью (PNG или fallback-буква) ===
const thumb = document.createElement("div");
thumb.className = "model-thumb";

if (m.preview) {
  const img = document.createElement("img");
  img.src = m.preview;
  img.alt = m.name;

  // производительность
  img.loading = "lazy";
  img.decoding = "async";

  thumb.appendChild(img);
} else {
  // fallback — как было
  thumb.textContent = m.thumbLetter || m.name.charAt(0);
}

    // === Заголовок ===
    const caption = document.createElement("div");
    caption.className = "model-caption";
    caption.textContent = m.name;

    // === Описание ===
    const desc = document.createElement("div");
    desc.className = "model-desc";
    desc.textContent = m.desc;

    // === Добавляем в DOM ===
    card.appendChild(thumb);
    card.appendChild(caption);
    card.appendChild(desc);

    // === Обработчик клика ===
    card.addEventListener("click", () => {
      onSelect(m.id);
    });

    containerEl.appendChild(card);
  });
}

/**
 * Показать галерею (как в 8.html → remove "hidden")
 */
export function showGallery(containerEl, viewerWrapperEl) {
  if (containerEl) containerEl.classList.remove("hidden");
  if (viewerWrapperEl) viewerWrapperEl.classList.remove("visible");
}

/**
 * Скрыть галерею (добавление "hidden")
 */
export function hideGallery(containerEl) {
  if (containerEl) containerEl.classList.add("hidden");
}
