import { redis } from "./redis";

export async function saveHistory(phone, data) {
  const key = `hist:${phone}`;
  const list = (await redis.get(key)) || [];

  list.unshift({
    ...data,
    createdAt: Date.now(),
    status: data.status || "pendiente",
  });

  await redis.set(key, list.slice(0, 20));
}
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export async function getHistory(user) {
  const key = `hist:${user}`;
  const hist = (await redis.get(key)) || [];

  const filtered = hist.filter(
    (h) => !h.createdAt || Date.now() - h.createdAt < SEVEN_DAYS,
  );

  // 🔥 si hubo limpieza, guardar
  if (filtered.length !== hist.length) {
    await redis.set(key, filtered.slice(0, 20));
  }

  return filtered;
}

export async function updateStatus(phone, index, status) {
  const key = `hist:${phone}`;
  const list = (await redis.get(key)) || [];

  if (!list[index]) {
    console.log("[UPDATE STATUS ERROR] índice inválido");
    return false;
  }

  list[index].status = status;

  await redis.set(key, list.slice(0, 20));
}
