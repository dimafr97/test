// js/insetsViewer.js
// Viewer для "Врезок": только 3D, без схем и видео.
// UI: Prev / Галерея / Next остаётся тем же.
import * as THREE from "three";
import { setModel as threeSetModel } from "./threeViewer.js";
import { loadModel } from "./models.js";
import { INSETS, getInsetMeta } from "./insetsModels.js";

let dom = null;
let currentId = null;
// ✅ Материалы, которыми управляет ползунок прозрачности
let controlledMaterials = [];
let currentOpacity = 1; // 0..1
// --- DITHER TRANSPARENCY (fallback вместо alphaHash) ---
const ditherState = new WeakMap(); // material -> { shader, installed }

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

function ensureDitherTransparency(material) {
  if (!material || ditherState.has(material)) return;

  // Мы НЕ используем transparent blending
  material.transparent = false;
  material.depthWrite = true;
  material.depthTest = true;
  material.side = THREE.DoubleSide;

  material.onBeforeCompile = (shader) => {
    // добавляем uniform
    shader.uniforms.uDitherOpacity = { value: 1.0 };

    // Вставляем функцию Bayer 4x4 и discard в фрагментный шейдер.
    // Идея: если opacity маленькая — больше фрагментов выкидываем.
    shader.fragmentShader =
      `
uniform float uDitherOpacity;

// 4x4 Bayer matrix threshold in [0..1)
float bayer4x4(vec2 p) {
  // p — пиксельные координаты
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));

  int index = x + y * 4;

  // Матрица Байера 4x4 (0..15)
  //  0  8  2 10
  // 12  4 14  6
  //  3 11  1  9
  // 15  7 13  5
  int m[16];
  m[0]=0;  m[1]=8;  m[2]=2;  m[3]=10;
  m[4]=12; m[5]=4;  m[6]=14; m[7]=6;
  m[8]=3;  m[9]=11; m[10]=1; m[11]=9;
  m[12]=15; m[13]=7; m[14]=13; m[15]=5;

  return (float(m[index]) + 0.5) / 16.0;
}
` + shader.fragmentShader;

    // Теперь нужно “подцепиться” в main() ДО вывода цвета.
    // В MeshStandardMaterial есть кусок "#include <dithering_fragment>" ближе к концу.
    // Мы вставим discard прямо перед ним.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
  // --- Dither transparency ---
  // uDitherOpacity: 1 = opaque, 0 = invisible
  float threshold = bayer4x4(gl_FragCoord.xy);
  if (uDitherOpacity < 0.9999) {
    if (uDitherOpacity <= threshold) discard;
  }
  #include <dithering_fragment>
`
    );

    // сохраняем shader, чтобы потом менять uniform без пересборки
    ditherState.set(material, { shader });
  };

  // форсируем пересборку шейдера
  material.needsUpdate = true;
}

function setDitherOpacity(material, opacity01) {
  const st = ditherState.get(material);
  if (!st || !st.shader) return;

  st.shader.uniforms.uDitherOpacity.value = opacity01;
}

// ✅ Применить текущую прозрачность ко всем "управляемым" материалам
function applyOpacityToControlled() {
  for (const m of controlledMaterials) {
    if (!m) continue;

    // 1) гарантируем, что шейдер “дизера” установлен
    ensureDitherTransparency(m);

    // 2) просто обновляем uniform
    const a = Math.max(0, Math.min(1, currentOpacity));
    setDitherOpacity(m, a);

    // 3) если 1.0 — можно вообще отключить дизер (чистый opaque)
    // но НЕ обязательно. Если хочешь — сделаем чуть чище:
    // (оставим как есть, чтобы был единый режим)
    m.needsUpdate = false;
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
  const v = Number(dom.insetOpacitySlider.value || 100); // 0..100
  currentOpacity = Math.max(0, Math.min(1, v / 100));    // 0..1
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
    // ✅ 1) сначала применяем цвета сечений (если они заданы в meta)
    applyInsetColors(root, meta);

    // ✅ 2) показываем модель в threeViewer
    threeSetModel(root);

    // ✅ 3) находим материалы, которыми управляет ползунок (например "1")
    controlledMaterials = collectMaterialsByName(root, meta.opacityMaterialName);

// Прогреваем dither-шейдер заранее (чтобы не было “первого кадра без эффекта”)
for (const m of controlledMaterials) ensureDitherTransparency(m);
    
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
