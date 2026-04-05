// /api/debug/user/route.js

import { redis, kUser } from "../../../../lib/redis";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const waUser = searchParams.get("waUser");

  const raw = await redis.get(kUser(waUser));
  const user = raw ? JSON.parse(raw) : null;

  return new Response(JSON.stringify(user), { status: 200 });
}
