import { redis } from "./redis";
import { getHistory } from "./history";
import { sendText } from "./wa";

// =========================
// CONFIG
// =========================
const HOURS = 24; // cambia a 1 para pruebas rápidas

// =========================
// REMINDERS
// =========================
export async function runReminders(user) {
  const history = await getHistory(user);
  if (!history || !history.length) return;

  const now = Date.now();

  for (const cot of history) {
    // =========================
    // NO enviar si ya pagó
    // =========================
    if (cot.status === "pagado") continue;

    // =========================
    // SOLO 1 recordatorio
    // =========================
    if (cot.reminded) continue;

    // =========================
    // VALIDAR TIEMPO
    // =========================
    const created = new Date(cot.createdAt).getTime();
    const diffHours = (now - created) / (1000 * 60 * 60);

    if (diffHours < HOURS) continue;

    // =========================
    // 🔥 EVITAR MOLESTAR
    // Si el técnico ya interactuó después, no enviar
    // =========================
    if (cot.updatedAt) {
      const updated = new Date(cot.updatedAt).getTime();

      if (updated > created) continue;
    }

    // =========================
    // ENVIAR RECORDATORIO
    // =========================
    await sendText(
      user,
      `🔔 Recordatorio

Cotización #${cot.id}
Cliente: ${cot.cliente}
Total: $${cot.total}

Estado: ${cot.status}

Para actualizar:
#${cot.id} pagado`,
    );

    // =========================
    // MARCAR COMO ENVIADO
    // =========================
    cot.reminded = true;

    await redis.set(`history:${user}`, JSON.stringify(history));
  }
}
