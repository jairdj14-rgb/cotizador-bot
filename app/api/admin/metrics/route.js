import { redis } from "../../../../lib/redis";

export const runtime = "nodejs";

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const keys = await redis.keys("user:*");

    let users = keys.length;
    let free = 0;
    let pro = 0;

    for (const key of keys) {
      const u = await redis.get(key);

      if (!u?.plan || u.plan === "free") free++;
      else if (u.plan === "pro") pro++;
    }

    const revenue = pro * 144;
    const conversions = users ? Math.round((pro / users) * 100) : 0;

    // 📊 METRICS
    const totalPDF = Number(await redis.get("metrics:pdf_generated")) || 0;
    const todayPDF = Number(await redis.get(`metrics:pdf:${today}`)) || 0;

    const todayUsers = await redis.scard(`metrics:users:${today}`);
    const totalUsersTracked = await redis.scard("metrics:active_users");

    //  EVENTS
    const checkout = Number(await redis.get("metrics:checkout")) || 0;
    const limit = Number(await redis.get("metrics:limit")) || 0;

    return Response.json({
      users,
      free,
      pro,
      revenue,
      conversions,
      metrics: {
        totalPDF,
        todayPDF,
        totalUsersTracked,
        todayUsers,
      },
      events: {
        checkout,
        limit,
      },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
