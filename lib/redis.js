import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const kState = (u) => `s:${u}`;
export const kUser = (u) => `user:${u}`;
export const kHistory = (u) => `hist:${u}`;

// =========================
// USER
// =========================
export async function getUser(phone) {
  let user = await redis.get(kUser(phone));

  if (!user) {
    user = {
      plan: "basic",
      bonus: 0,
      branding: {
        logoUrl: null,
        color: null,
        companyName: null,
      },
    };

    await redis.set(kUser(phone), JSON.stringify(user));
    return user;
  }

  try {
    user = typeof user === "string" ? JSON.parse(user) : user;
  } catch {
    user = {};
  }

  if (!user.plan) user.plan = "basic";
  if (!user.branding) {
    user.branding = {
      logoUrl: null,
      color: null,
      companyName: null,
    };
  }

  return user;
}

export async function saveUser(phone, data) {
  await redis.set(kUser(phone), JSON.stringify(data));
}

// =========================
// STATE
// =========================
export async function getState(user) {
  const raw = await redis.get(kState(user));

  if (!raw) {
    return { step: "menu", data: { items: [] } };
  }

  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (!parsed.data) parsed.data = {};
    if (!parsed.data.items) parsed.data.items = [];

    return parsed;
  } catch {
    return { step: "menu", data: { items: [] } };
  }
}

export async function setState(user, state) {
  await redis.set(kState(user), JSON.stringify(state));
}

export async function clearState(user) {
  await redis.del(kState(user));
}
