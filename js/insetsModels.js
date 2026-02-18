// js/insetsModels.js

// ✅ Список ВРЕЗОК — максимально компактный.
// Каждая врезка ссылается на модель из MODELS через sourceId.
// Добавить новую врезку = добавить один объект сюда.

export const INSETS = [
  {
    id: "inset_1",
    sourceId: "inset_1_source",     // ✅ это id из MODELS
    name: "Врезка 1",
    desc: "Композиция пересекающихся примитивов",

    // ✅ какой материал управляется прозрачностью (по имени материала в glTF)
    opacityMaterialName: "1",

    // ✅ (опционально) задать цвета сечений по именам материалов
    // если в модели уже выставлены цвета — можно удалить этот блок
    materialColors: {
      "2": "#ff3b30", // красный
      "4": "#34c759"  // зелёный
    }
  },

  // (оставим тестовый мольберт, пока не нужен — можно удалить)
  {
    id: "inset_molbert",
    sourceId: "molbert",
    name: "Мольберт (врезка)",
    desc: "Тестовый объект врезок",
    opacityMaterialName: "3"
  }
];

export function getInsetMeta(id) {
  return INSETS.find((m) => m.id === id) || null;
}
