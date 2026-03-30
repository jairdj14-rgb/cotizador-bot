import { redis } from "./redis";

export async function guardarCotizacion(phone, data) {
  const key = `hist:${phone}`;
  const historial = (await redis.get(key)) || [];

  historial.unshift({
    ...data,
    fecha: Date.now(),
  });

  await redis.set(key, historial.slice(0, 20)); // límite 20
}

export async function obtenerHistorial(phone) {
  return (await redis.get(`hist:${phone}`)) || [];
}

export async function actualizarEstado(phone, index, estado) {
  const key = `hist:${phone}`;
  const historial = (await redis.get(key)) || [];

  if (!historial[index]) return false;

  historial[index].estado = estado;

  await redis.set(key, historial);

  return true;
}
