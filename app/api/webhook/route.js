// app/api/webhook/route.js

export const runtime = "nodejs";

import { flow } from "../../../lib/flow";
import { sendText, sendDocument } from "../../../lib/wa";

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge || "ok", { status: 200 });
  }

  // Para abrir la URL en navegador sin romper la verificación de Meta
  return new Response("123", { status: 200 });
}

export async function POST(req) {
  try {
    const body = await req.json();

    console.log("[meta-webhook] body:", JSON.stringify(body));

    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) {
      return new Response("ok", { status: 200 });
    }

    const from = msg.from;
    const text =
      msg.text?.body ||
      msg.interactive?.button_reply?.title ||
      msg.button?.text ||
      "";

    const image = msg.image || null;

    console.log("[meta-webhook] incoming:", {
      from,
      text,
      hasImage: !!image,
      type: msg.type,
    });

    const res = await flow(from, text, image);

    if (!res) {
      return new Response("ok", { status: 200 });
    }

    if (typeof res === "string") {
      await sendText(from, res);
    } else {
      if (res.text) {
        await sendText(from, res.text);
      }

      if (res.url) {
        await sendDocument(from, res.url);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[meta-webhook] error:", error);
    return new Response("ok", { status: 200 });
  }
}
