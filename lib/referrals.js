import { redis, kUser } from "./redis";

// guardar referencia
export async function applyReferral(newUser, refCode) {
  if (!refCode || newUser === refCode) return;

  const already = await redis.get(`ref:used:${newUser}`);
  if (already) return;

  // marcar como usado
  await redis.set(`ref:used:${newUser}`, refCode);

  // incrementar contador del referrer
  await redis.incr(`ref:count:${refCode}`);

  // 🔥 dar reward
  const current = (await redis.get(kUser(refCode))) || {};
  const bonus = current.bonus || 0;

  await redis.set(kUser(refCode), {
    ...current,
    bonus: bonus + 2, // +2 cotizaciones
  });
}

// obtener stats
export async function getReferralStats(user) {
  const count = Number(await redis.get(`ref:count:${user}`)) || 0;
  return { count };
}
