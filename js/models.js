// models.js — persistent cache GLTF/BIN + TEXTURES
// pivot/scale/normalize полностью сохранены

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// IndexedDB cache
import { cachedFetch } from "./cache/cachedFetch.js";

// БАЗОВЫЙ URL для защищённого доступа
const BASE = "https://api.apparchi.ru/?path=";
export const MODELS = [
  {
    id: "doric",
    name: "Дорическая капитель",
    desc: "СПбГАСУ",
    url: `${BASE}models/doric.gltf`,
    preview: `${BASE}textures/doric/preview.png`,
    thumbLetter: "D",
    schemes: [
      `${BASE}textures/doric/s1.jpg`,
      `${BASE}textures/doric/s2.jpg`,
      `${BASE}textures/doric/s3.jpg`
    ],

video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/doric/v1.mp4`
],
    textures: {
      base: `${BASE}textures/doric/BaseColor.jpg`,
      normal: `${BASE}textures/doric/Normal.jpg`,
      rough: `${BASE}textures/doric/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.7
    }
  },
  {
    id: "ionic",
    name: "Ионическая капитель",
    desc: "СПбГАСУ",
    url: `${BASE}models/ionic.gltf`,
    preview: `${BASE}textures/ionic/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/ionic/s1.jpg`,
      `${BASE}textures/ionic/s2.jpg`,
      `${BASE}textures/ionic/s3.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/ionic/v1.mp4`
],
    textures: {
      base: `${BASE}textures/ionic/BaseColor.jpg`,
      normal: `${BASE}textures/ionic/Normal.jpg`,
      rough: `${BASE}textures/ionic/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
  },
  {
    id: "balyasina1",
    name: "Балясина с лепестками",
    desc: "СПбГАСУ",
    url: `${BASE}models/balyasina1.gltf`,
    preview: `${BASE}textures/balyasina1/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/balyasina1/s1.jpg`,
      `${BASE}textures/balyasina1/s2.jpg`
    ],
video: [
  "https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/balyasina1/v1.mp4",
  "https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/balyasina1/v2.mp4"
],
    textures: {
      base: `${BASE}textures/balyasina1/BaseColor.jpg`,
      normal: `${BASE}textures/balyasina1/Normal.jpg`,
      rough: `${BASE}textures/balyasina1/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
  },
  {
    id: "balyasina2",
    name: "Балясина шаровидная",
    desc: "СПбГАСУ",
    url: `${BASE}models/balyasina2.gltf`,
    preview: `${BASE}textures/balyasina2/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/balyasina2/s1.jpg`,
       `${BASE}textures/balyasina2/s2.jpg`,
       `${BASE}textures/balyasina2/s3.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/balyasina2/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/balyasina2/v2.mp4`
],
    textures: {
      base: `${BASE}textures/balyasina2/BaseColor.jpg`,
      normal: `${BASE}textures/balyasina2/Normal.jpg`,
      rough: `${BASE}textures/balyasina2/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "kapitel2",
    name: "Малая капитель",
    desc: "СПбГАСУ",
    url: `${BASE}models/kapitel2.gltf`,
    preview: `${BASE}textures/kapitel2/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/kapitel2/s1.jpg`,
      `${BASE}textures/kapitel2/s2.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/kapitel2/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/kapitel2/v2.mp4`
],
    textures: {
      base: `${BASE}textures/kapitel2/BaseColor.jpg`,
      normal: `${BASE}textures/kapitel2/Normal.jpg`,
      rough: `${BASE}textures/kapitel2/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "kapitel1",
    name: "Большая капитель",
    desc: "СПбГАСУ",
    url: `${BASE}models/kapitel1.gltf`,
    preview: `${BASE}textures/kapitel1/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/kapitel1/s1.jpg`,
      `${BASE}textures/kapitel1/s2.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/kapitel1/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/kapitel1/v2.mp4`
],
    textures: {
      base: `${BASE}textures/kapitel1/BaseColor.jpg`,
      normal: `${BASE}textures/kapitel1/Normal.jpg`,
      rough: `${BASE}textures/kapitel1/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "vase1",
    name: "Малая ваза",
    desc: "СПбГАСУ",
    url: `${BASE}models/vase1.gltf`,
    preview: `${BASE}textures/vase1/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/vase1/s1.jpg`,
      `${BASE}textures/vase1/s2.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/vase1/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/vase1/v2.mp4`
],
    textures: {
      base: `${BASE}textures/vase1/BaseColor.jpg`,
      normal: `${BASE}textures/vase1/Normal.jpg`,
      rough: `${BASE}textures/vase1/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "vase2",
    name: "Большая ваза",
    desc: "СПбГАСУ",
    url: `${BASE}models/vase2.gltf`,
    preview: `${BASE}textures/vase2/preview.png`,
    thumbLetter: "I",
    schemes: [
      `${BASE}textures/vase2/s1.jpg`,
      `${BASE}textures/vase2/s2.jpg`,
      `${BASE}textures/vase2/s3.jpg`
    ],
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/vase2/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/vase2/v2.mp4`
],
    textures: {
      base: `${BASE}textures/vase2/BaseColor.jpg`,
      normal: `${BASE}textures/vase2/Normal.jpg`,
      rough: `${BASE}textures/vase2/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "chair1",
    name: "Табурет квадратный",
    desc: "СПбГАСУ",
    url: `${BASE}models/chair1.gltf`,
    preview: `${BASE}textures/chair1/preview.png`,
    thumbLetter: "I",
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/chair1/v1.mp4`
],
    textures: {
      base: `${BASE}textures/chair1/BaseColor.jpg`,
      normal: `${BASE}textures/chair1/Normal.jpg`,
      rough: `${BASE}textures/chair1/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
  {
    id: "chair2",
    name: "Табурет круглый",
    desc: "СПбГАСУ",
    url: `${BASE}models/chair2.gltf`,
    preview: `${BASE}textures/chair2/preview.png`,
    thumbLetter: "I",
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/chair1/v1.mp4`
],
    textures: {
      base: `${BASE}textures/chair2/BaseColor.jpg`,
      normal: `${BASE}textures/chair2/Normal.jpg`,
      rough: `${BASE}textures/chair2/Roughness.jpg`,
      metalness: 0,
      roughness: 1,
      envIntensity: 0.75
    }
},
{
  id: "molbert",
  name: "Мольберт",
  desc: "СПбГАСУ",
  url: `${BASE}models/molbert.gltf`,
  preview: `${BASE}textures/molbert/preview.png`,
video: [
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/molbert/v1.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/molbert/v2.mp4`,
  `https://s3.twcstorage.ru/540d791f-86c02015-75b1-462f-b960-b855e300451a/textures/molbert/v3.mp4`
],

materials: {
  "1": {
    base: `${BASE}textures/molbert/molbert2_1_BaseColor.jpg`,
    normal: `${BASE}textures/molbert/molbert2_1_Normal.jpg`,
    rough: `${BASE}textures/molbert/molbert2_1_Roughness.jpg`
  },
  "2": {
    base: `${BASE}textures/molbert/molbert2_2_BaseColor.jpg`,
    normal: `${BASE}textures/molbert/molbert2_2_Normal.jpg`,
    rough: `${BASE}textures/molbert/molbert2_2_Roughness.jpg`
  },
  "3": {
    base: `${BASE}textures/molbert/molbert2_3_BaseColor.jpg`,
    normal: `${BASE}textures/molbert/molbert2_3_Normal.jpg`,
    rough: `${BASE}textures/molbert/molbert2_3_Roughness.jpg`
  },
  "4": {
    base: `${BASE}textures/molbert/molbert2_4_BaseColor.jpg`,
    normal: `${BASE}textures/molbert/molbert2_4_Normal.jpg`,
    rough: `${BASE}textures/molbert/molbert2_4_Roughness.jpg`,
    metal: `${BASE}textures/molbert/molbert2_4_Metallic.jpg`
  }
}
 }
];

export function getModelMeta(id) {
  return MODELS.find((m) => m.id === id) || null;
}

// ===================
// Кэш моделей в памяти
// ===================
const gltfLoader = new GLTFLoader();
const modelCache = new Map();

// ==============================
// TEXTURE LOADER WITH PERSISTENT CACHE
// ==============================
async function loadTextureCached(url) {
  const blob = await cachedFetch(url);
  const localURL = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      localURL,
      (tex) => {
        tex.flipY = false;
        URL.revokeObjectURL(localURL); // ← КЛЮЧЕВО
        resolve(tex);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(localURL); // ← КЛЮЧЕВО
        reject(err);
      }
    );
  });
}

// ================================
// MATERIAL CREATION (UPGRADED)
// ================================
async function createMaterialFromTextures(textures) {
  if (!textures) return null;

  const texBase   = textures.base   ? await loadTextureCached(textures.base)   : null;
  const texNormal = textures.normal ? await loadTextureCached(textures.normal) : null;
  const texRough  = textures.rough  ? await loadTextureCached(textures.rough)  : null;

  if (texBase)   texBase.colorSpace   = THREE.SRGBColorSpace;
  if (texNormal) texNormal.colorSpace = THREE.LinearSRGBColorSpace;
  if (texRough)  texRough.colorSpace  = THREE.LinearSRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    map:          texBase,
    normalMap:    texNormal,
    roughnessMap: texRough,
    metalness:    textures.metalness ?? 0,
    roughness:    textures.roughness ?? 1,
    envMapIntensity: textures.envIntensity ?? 0.7
  });
}

// ================================
// LOAD MODEL (GLTF + BIN CACHE)
// ================================
export function loadModel(modelId, { onProgress, onStatus } = {}) {
  const meta = getModelMeta(modelId);
  if (!meta) return Promise.reject("No model: " + modelId);

  // instant switching cache
  if (modelCache.has(modelId)) {
    onStatus?.("Готово (кэш)");
    onProgress?.(100);
    return Promise.resolve({ root: modelCache.get(modelId), meta });
  }

  onStatus?.("Загрузка: " + meta.name);

  // Добавляем initData только если приложение запущено в Telegram
let url = meta.url;

if (window.TG_INIT_DATA) {
  const u = new URL(url);
  u.searchParams.set("initData", window.TG_INIT_DATA);
  url = u.toString();
}

  const binUrl = url.replace(".gltf", ".bin");

  return new Promise(async (resolve, reject) => {
    try {
      // persistent cache for gltf/bin
      const gltfBlob = await cachedFetch(url);
      const binBlob  = await cachedFetch(binUrl);

      const gltfObjectURL = URL.createObjectURL(gltfBlob);
      const binObjectURL  = URL.createObjectURL(binBlob);

      // override bin file
      const manager = new THREE.LoadingManager();
manager.setURLModifier((u) => {
  // ловим .bin даже с ?query, blob:, и т.п.
  if (/\.bin(\?|$)/i.test(u)) {
    return binObjectURL;
  }
  return u;
});

      const loader = new GLTFLoader(manager);

      loader.load(
        gltfObjectURL,

        async (gltf) => {

URL.revokeObjectURL(gltfObjectURL);
URL.revokeObjectURL(binObjectURL);

          const scene = gltf.scene;

// ===== shared material for old models =====
let sharedOldMaterial = null;

if (meta.textures) {
  sharedOldMaterial = await createMaterialFromTextures(meta.textures);
}

          // group for normalization
          const rootGroup = new THREE.Group();
          rootGroup.add(scene);

          // apply PBR material (cached!)
const materialTasks = [];

scene.traverse((obj) => {
  if (!obj.isMesh) return;

  obj.castShadow = false;
  obj.receiveShadow = false;
  obj.frustumCulled = false;

  // === КЕЙС 1: МОЛЬБЕРТ ===
  if (meta.materials) {
    const mats = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];

    mats.forEach((mat) => {
      const desc = meta.materials[mat.name];
      if (!desc) return;

      materialTasks.push((async () => {
  if (desc.base) {
    const tex = await loadTextureCached(desc.base);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
  }

  if (desc.normal) {
    mat.normalMap = await loadTextureCached(desc.normal);
  }

  if (desc.rough) {
    mat.roughnessMap = await loadTextureCached(desc.rough);
  }

  if (desc.metal) {
  // ЭТО МЕТАЛЛ
  mat.metalnessMap = await loadTextureCached(desc.metal);
  mat.metalness = 1.0;
} else {
  // ЭТО НЕ МЕТАЛЛ
  mat.metalness = 0.0;
}

mat.roughness = 1.0;

        mat.needsUpdate = true;
      })());
    });

    return;
  }

// === КЕЙС 2: СТАРЫЕ МОДЕЛИ ===
if (sharedOldMaterial) {
  obj.material = sharedOldMaterial;
}
});

// ⬅️ ВОТ ЭТО КЛЮЧЕВО
await Promise.all(materialTasks);

          // pivot/scale correct normalization
          normalizeModel(rootGroup, scene);

          modelCache.set(modelId, rootGroup);

          onProgress?.(100);
          onStatus?.("Готово");

          resolve({ root: rootGroup, meta });
        },

        (xhr) => {
          if (xhr.lengthComputable) {
            onProgress?.((xhr.loaded / xhr.total) * 100);
          }
        },

        (err) => {
          console.error(err);
          onStatus?.("Ошибка загрузки");

URL.revokeObjectURL(gltfObjectURL);
URL.revokeObjectURL(binObjectURL);

          reject(err);
        }
      );
    } catch (err) {
      console.error("cachedFetch error:", err);
      onStatus?.("Ошибка загрузки");
      reject(err);
    }
  });
}

// ================================
// NORMALIZATION — untouched
// ================================
function normalizeModel(rootGroup, gltfScene) {
  const box = new THREE.Box3().setFromObject(rootGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  gltfScene.position.sub(center);

  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.0 / maxSize;
  rootGroup.scale.setScalar(scale);
}
