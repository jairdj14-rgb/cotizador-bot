import { redis } from "../redis";

export async function getUserData(phone) {
  return await redis.get(`user:${phone}`);
}

export async function consumirCredito(phone) {
  const user = await redis.get(`user:${phone}`);

  if (!user || !user.plan) {
    return { ok: false, reason: "no_plan" };
  }

  if (user.credits <= 0) {
    return { ok: false, reason: "no_credits" };
  }

  user.credits -= 1;

  await redis.set(`user:${phone}`, user);

  return { ok: true, credits: user.credits, user };
}
