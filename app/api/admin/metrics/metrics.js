export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  const totalPDF = await redis.get("metrics:pdf_generated");
  const todayPDF = await redis.get(`metrics:pdf:${today}`);

  const todayUsers = await redis.scard(`metrics:users:${today}`);
  const totalUsersTracked = await redis.scard("metrics:active_users");

  return Response.json({
    users,
    free,
    basic,
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
}
