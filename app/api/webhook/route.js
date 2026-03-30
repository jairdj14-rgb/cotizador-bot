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

// ------------------------
// GET (VERIFICACIÓN META)
// ------------------------
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("TOKEN VERCEL:", process.env.VERIFY_TOKEN);
  console.log("TOKEN URL:", token);

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response(
    `Forbidden → token:${token} env:${process.env.VERIFY_TOKEN}`,
    { status: 403 },
  );
}

// ------------------------
// POST (TU BOT)
// ------------------------

export async function POST(req) {
  try {
    const body = await req.json();

    const value = body?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message) return new Response("ok");
    if (message.type !== "text") return new Response("ok");

    const from = message.from;
    const text = message.text?.body?.trim();

    if (!text) return new Response("ok");

    const lower = text.toLowerCase();

    // PRO
    if (lower === "pro") {
      const state = await redis.get(from);

      if (!state) {
        await enviarTexto(from, "No hay cotización");
        return new Response("ok");
      }

      try {
        const pdf = await generarPDF(state, {
          tipo: "pro",
          usarIA: state.reporte === "si",
        });

        const buffer = Buffer.from(pdf);
        const url = await subirPDF(buffer, `cot-${Date.now()}.pdf`);

        await enviarDocumento(from, url);
        await redis.del(from);
      } catch (err) {
        await enviarTexto(from, "Error generando PDF");
      }

      return new Response("ok");
    }

    // FLOW
    const respuesta = await manejarFlujo(from, text);

    if (respuesta) {
      await enviarTexto(from, respuesta);
    }

    return new Response("ok");
  } catch (err) {
    return new Response("error", { status: 500 });
  }
}
