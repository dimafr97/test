import { MODELS, loadModel } from "../js/models.js";
import {
  initPreviewThree,
  setPreviewModel,
  resizePreview,
  renderPNG,
  rotatePreviewYaw,
  rotatePreviewPitch
} from "./threePreview.js";

const elWrap = document.getElementById("wrap");
const elModelSelect = document.getElementById("modelSelect");
const elSizeSelect = document.getElementById("sizeSelect");
const elLoadBtn = document.getElementById("loadBtn");
const elDownloadBtn = document.getElementById("downloadBtn");
const elStatus = document.getElementById("status");

// --- fill select from MODELS (как у тебя в галерее) ---
MODELS.forEach((m) => {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.name;
  elModelSelect.appendChild(opt);
});

// --- init preview three ---
let size = parseInt(elSizeSelect.value, 10);
let three = initPreviewThree(elWrap, size);

// --- preview camera controls ---
document.getElementById("cam-left").onclick = () => {
  rotatePreviewYaw(-1, three);
};

document.getElementById("cam-right").onclick = () => {
  rotatePreviewYaw(1, three);
};

document.getElementById("cam-up").onclick = () => {
  rotatePreviewPitch(1, three);
};

document.getElementById("cam-down").onclick = () => {
  rotatePreviewPitch(-1, three);
};

// состояние
let currentModelId = MODELS[0]?.id ?? null;
let loaded = false;

function setStatus(text) {
  elStatus.textContent = text || "";
}

// загрузка модели
async function loadSelected() {
  if (!currentModelId) return;

  loaded = false;
  elDownloadBtn.disabled = true;

  setStatus("Загрузка…");

  // подстроим размер, если изменили
  size = parseInt(elSizeSelect.value, 10);
  resizePreview(three, elWrap, size);

  try {
    // ВАЖНО: мы НЕ трогаем Telegram.
    // loadModel сам добавляет initData только если window.TG_INIT_DATA существует.
    // В preview его нет — и это нормально. (см. models.js)
    const { root, meta } = await loadModel(currentModelId, {
      onStatus: (t) => setStatus(t),
      onProgress: (p) => {
        if (typeof p === "number") setStatus(`Загрузка: ${p.toFixed(0)}%`);
      }
    });

    setPreviewModel(three, root);

    loaded = true;
    elDownloadBtn.disabled = false;
    setStatus(`Готово: ${meta?.name ?? currentModelId}`);
  } catch (e) {
    console.error(e);
    setStatus("Ошибка загрузки");
    alert("Ошибка загрузки модели (смотри консоль/Network).");
  }
}

// --- UI events ---
elModelSelect.addEventListener("change", () => {
  currentModelId = elModelSelect.value;
  loaded = false;
  elDownloadBtn.disabled = true;
  setStatus("Выбрано: " + currentModelId);
});

elSizeSelect.addEventListener("change", () => {
  loaded = false;
  elDownloadBtn.disabled = true;
  setStatus("Размер изменён — нажми «Загрузить»");
});

elLoadBtn.addEventListener("click", loadSelected);

elDownloadBtn.addEventListener("click", () => {
  if (!loaded) return;

  // рендерим В МОМЕНТ клика (важно для детерминизма)
  const dataUrl = renderPNG(three);

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `${currentModelId}_${size}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// --- старт ---
if (currentModelId) {
  elModelSelect.value = currentModelId;
  loadSelected();
}
