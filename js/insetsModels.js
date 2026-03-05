// js/insetsModels.js
//
// ✅ Единый конфиг ВРЕЗОК.
// Добавить новую врезку = добавить один объект в RAW_INSETS.
// models.js сам сможет загрузить source-модели по sourcePath (без правок models.js).

const RAW_INSETS = [
{
  id: "inset_1",
  name: "Врезка 1",
  desc: "Композиция пересекающихся примитивов",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/1.1.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4"],

  // цвета сечений
  materialColors: {
    "2": "#de1885", // круг
    "3": "#6c1460", // эллипс
    "4": "#faf3e3" // вспомогательное
  },

  // ===== CAD-обвязка =====
cad: {
  fromNodes: true,
  lines: [
    ["a", "b"],
    ["c", "d"]
  ]
}
},

  // (тестовый мольберт оставим как есть: он уже есть в MODELS)
  {
    id: "inset_molbert",
    sourceId: "molbert",
    name: "Мольберт (врезка)",
    desc: "Тестовый объект врезок",

    opacityMaterialName: "3",
    sectionMaterialNames: ["1", "2", "4"]
    // materialColors можно не задавать
  }
];

// ✅ Автоматически генерим sourceId, если не задан вручную
export const INSETS = RAW_INSETS.map((m) => ({
  ...m,
  sourceId: m.sourceId || `${m.id}_source`
}));

// ✅ Описание “source-моделей” для загрузчика (models.js)
export const INSET_SOURCE_DEFS = INSETS
  .filter((m) => !!m.sourcePath)
  .map((m) => ({
    id: m.sourceId,
    name: m.name,
    desc: m.desc,
    path: m.sourcePath
  }));

export function getInsetMeta(id) {
  return INSETS.find((m) => m.id === id) || null;
}
