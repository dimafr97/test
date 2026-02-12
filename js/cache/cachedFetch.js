import { getFile, saveFile } from "./db.js";

// Логирование для отладки
function log(msg) {
  console.log(msg);
}

// Дедупликация одновременных запросов одного и того же ресурса
const inflight = new Map();

export async function cachedFetch(url) {
  // ❗ Выделяем objectPath из URL (как у тебя и было)
  const u = new URL(url);
  const objectPath = u.searchParams.get("path");

  // Ключ кеша
  const cacheKey = objectPath || url;

  // Если этот же ресурс уже качается/пишется — ждём тот же промис
  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey);
  }

  const p = (async () => {
    // 1) кеш
    const cached = await getFile(cacheKey);
    if (cached) {
      log("HIT: " + cacheKey);
      return cached;
    }

    // 2) сеть
    log("SAVE: " + cacheKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${cacheKey}`);
    const blob = await res.blob();

    // 3) попытка сохранить (на мобиле может упасть по квоте — не роняем всё приложение)
    try {
      await saveFile(cacheKey, blob);
    } catch (e) {
      console.warn("IDB save failed (quota/tx):", cacheKey, e);
    }

    return blob;
  })();

  inflight.set(cacheKey, p);

  try {
    return await p;
  } finally {
    inflight.delete(cacheKey);
  }
}
