import { redis } from "./redis";

export async function saveHistory(phone, data) {
  const key = `hist:${phone}`;
  const list = (await redis.get(key)) || [];

  list.unshift({
    ...data,
    fecha: Date.now(),
    status: "pendiente",
  });

  await redis.set(key, list.slice(0, 20));
}

export async function getHistory(phone) {
  return (await redis.get(`hist:${phone}`)) || [];
}

export async function updateStatus(phone, index, status) {
  const key = `hist:${phone}`;
  const list = (await redis.get(key)) || [];

  if (!list[index]) return false;

  list[index].status = status;

  await redis.set(key, list);
}
