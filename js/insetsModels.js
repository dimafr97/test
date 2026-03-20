// js/insetsModels.js
//
// ✅ Единый конфиг ВРЕЗОК.
// Добавить новую врезку = добавить один объект в RAW_INSETS.
// models.js сам сможет загрузить source-модели по sourcePath (без правок models.js).

const RAW_INSETS = [
{
  id: "inset_1",
  name: "Куб и конус",
  desc: "Врезка прямой плоскости в тело вращения",
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
  name: "Горизонтальная треугольная призма и конус",
  desc: "Врезка наклонной плоскости в тело вращения",
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
  name: "Пирамида и горизонтальная треугольная призма",
  desc: "Врезка двух наклонных плоскостей",
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
  name: "Треугольная призма и шестигранник",
  desc: "Врезка двух наклонных плоскостей",
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
  name: "Горизонтальный цилиндр и пирамида",
  desc: "Врезка наклонной плоскости в тело вращения",
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
  name: "Два горизонтальных шестигранника",
  desc: "Врезка наклонных плоскостей",
  preview: "textures/6/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/6.2.gltf",

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

  
  {
  id: "inset_7",
  name: "Горизонтальный цилиндр и треугольная призма",
  desc: "Врезка наклонной плоскости в тело вращения",
  preview: "textures/7/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/7.gltf",

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
  id: "inset_8",
  name: "Вертикальная треугольная призма и цилиндр",
  desc: "Врезка наклонной плоскости в тело вращения",
      preview: "textures/8/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/8.gltf",

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
  id: "inset_9",
  name: "Вертикальный цилинлр и треугольная призма",
  desc: "Врезка наклонной плоскости в тело вращения",
  preview: "textures/9/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/9.gltf",

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
  id: "inset_10",
  name: "Горизонтальный цилиндр и шестигранник",
  desc: "Врезка наклонных плоскостей в тело вращения",
  preview: "textures/10/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/10.gltf",

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
    ["e", "f"],
    ["g", "h"]
  ]
}
},
    {
  id: "inset_11",
  name: "Вертикальный цилиндр и пирамида",
  desc: "Врезка наклонной плоскости в тело вращения",
  preview: "textures/11/preview.png",

  // путь в защищённом API (после ?path=)
  sourcePath: "models/11.gltf",

  // материал тела (управляется ползунком)
  opacityMaterialName: "1",

  // материалы-сечения
  sectionMaterialNames: ["2", "3", "4", "5", "6"],

  // цвета сечений
  materialColors: {
    "2": "#d929c1", // круг
    "3": "#1c58e5", // эллипс
    "4": "#ddf406", // вспомогательное
    "5": "#12d6c3", // вспомогательное
    "6": "#FF5500" // вспомогательное
  },

  // ===== CAD-обвязка =====
cad: {
  fromNodes: true,
  lines: [
    ["a", "b"],
    ["c", "d"],
    ["e", "f"],
    ["g", "h"]
  ]
}
},
  ]

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
