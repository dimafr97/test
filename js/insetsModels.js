// js/insetsModels.js
import { MODELS } from "./models.js";

// ✅ Пока тест: дублируем "мольберт" как первую врезку
// Позже мы заменим это на реальные inset.gltf и их текстуры.
export const INSETS = [
  {
    ...MODELS.find((m) => m.id === "molbert"),
    id: "inset_molbert",             // новый id, чтобы не конфликтовать
    name: "Мольберт (врезка)",
    desc: "Тестовый объект врезок",
    // ✅ имя материала, который будет управляться ползунком (позже добавим)
    opacityMaterialName: "1"         // пример — потом поставим реальное имя материала
  }
];

export function getInsetMeta(id) {
  return INSETS.find((m) => m.id === id) || null;
}
