import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export const kState = (u) => `s:${u}`;
export const kUser = (u) => `user:${u}`;

export async function getUser(phone) {
  let user = await redis.get(kUser(phone));

  if (!user) {
    user = {
      plan: "free",
      branding: {},
    };

    await redis.set(kUser(phone), user);
  }

  return user;
}
