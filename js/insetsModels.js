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
  preview: "textures/1/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/1.1.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406" // вспомогательное
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

  {
  id: "inset_2",
  name: "Врезка 2",
  desc: "Композиция пересекающихся примитивов",
    preview: "textures/2/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/2.3.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406" // вспомогательное
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

    {
  id: "inset_3",
  name: "Врезка 3",
  desc: "Композиция пересекающихся примитивов",
      preview: "textures/3/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/3.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406" // вспомогательное
  },

  // ===== CAD-обвязка =====
cad: {
  fromNodes: true,
  lines: [
    ["a", "b"]
  ]
}
},
  
    {
  id: "inset_4",
  name: "Врезка 4",
  desc: "Композиция пересекающихся примитивов",
      preview: "textures/4/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/4.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5" // эллипс
  },

  // ===== CAD-обвязка =====
cad: {
  fromNodes: true,
  lines: [
    ["a", "b"]
  ]
}
},

  {
  id: "inset_5",
  name: "Врезка 5",
  desc: "Композиция пересекающихся примитивов",
  preview: "textures/5/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/5.1.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406" // вспомогательное
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
  
  {
  id: "inset_6",
  name: "Врезка 6",
  desc: "Композиция пересекающихся примитивов",
  preview: "textures/6/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/6.1.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4", "5"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406", // вспомогательное
    "5": "#12d6c3" // вспомогательное
  },

  // ===== CAD-обвязка =====
cad: {
  fromNodes: true,
  lines: [
    ["a", "b"],
    ["c", "d"],
    ["i", "j"],
    ["k", "l"]
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
