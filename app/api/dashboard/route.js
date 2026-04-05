import { getHistory } from "../../../lib/history";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const user = searchParams.get("user");

  const history = await getHistory(user);

  if (!history) {
    return Response.json({ ok: true, data: {} });
  }

  const total = history.reduce((sum, c) => sum + (c.total || 0), 0);

  const pagado = history
    .filter((c) => c.status === "pagado")
    .reduce((sum, c) => sum + (c.total || 0), 0);

  const pendientes = history
    .filter((c) => c.status !== "pagado")
    .reduce((sum, c) => sum + (c.total || 0), 0);

  return Response.json({
    ok: true,
    data: {
      cotizaciones: history.length,
      total,
      pagado,
      pendientes,
    },
  });
}
