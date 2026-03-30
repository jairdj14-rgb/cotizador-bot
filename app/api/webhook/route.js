import { manejarFlujo } from "../../../lib/flow";
import { enviarTexto, enviarDocumento } from "../../../lib/whatsapp";
import { redis } from "../../../lib/redis";
import { generarPDF } from "../../../lib/pdf";
import { subirPDF } from "../../../lib/storage";
import { consumirCredito } from "../../../lib/billing/credits";
import {
  guardarCotizacion,
  obtenerHistorial,
  actualizarEstado,
} from "../../../lib/history";

// 🔹 GET → verificación de webhook (Meta)
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente");
    return new Response(challenge, { status: 200 });
  }

  console.log("❌ Fallo en verificación de webhook");
  return new Response("Forbidden", { status: 403 });
}

// 🔹 POST → recepción de eventos (DEBUG TOTAL)
export async function POST(req) {
  try {
    const body = await req.json();

    console.log("🔥 EVENTO COMPLETO RECIBIDO:");
    console.log(JSON.stringify(body, null, 2));

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("❌ ERROR EN WEBHOOK:", error);
    return new Response("error", { status: 500 });
  }
}
