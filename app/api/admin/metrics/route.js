import { redis } from "../../../../lib/redis";

export const runtime = "nodejs";

export async function GET() {
  try {
    const keys = await redis.keys("user:*");

    let users = keys.length;
    let free = 0;
    let pro = 0;

    for (const key of keys) {
      const u = await redis.get(key);

      if (!u?.plan || u.plan === "free") free++;
      else if (u.plan === "pro") pro++;
    }

    // 💰 revenue estimado
    const revenue = pro * 144;

    // 📈 conversion
    const paying = pro;
    const conversions = users ? Math.round((paying / users) * 100) : 0;

    // 🔥 EVENTOS
    const checkout = Number(await redis.get("metrics:checkout")) || 0;
    const limit = Number(await redis.get("metrics:limit")) || 0;

    return Response.json({
      users,
      free,
      pro,
      revenue,
      conversions,
      events: {
        checkout,
        limit,
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
