export const runtime = "nodejs";

import { flow } from "../../../lib/flow";
import { enqueueMessage } from "../../../lib/queue";
import { getUser, saveUser } from "../../../lib/redis";
import { normalizePhone } from "../../../lib/phone";
import { redis } from "../../../lib/redis"; // 🔥 IMPORTANTE: usar redis directo
import { getState, setState } from "../../../lib/redis";
import { uploadFile } from "../../../lib/storage";
import {
  sendMessage,
  debugWhatsAppConfig,
  getMediaUrl,
  downloadMedia,
} from "../../../lib/wa";

// =========================
// VERIFY (META)
// =========================
export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge || "ok", { status: 200 });
  }

  return new Response("ok", { status: 200 });
}

// =========================
// WEBHOOK
// =========================
export async function POST(req) {
  console.log("[REDIS URL WEBHOOK]", process.env.UPSTASH_REDIS_REST_URL);
  try {
    const body = await req.json();

    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value || !value.messages) {
      return new Response("ok", { status: 200 });
    }

    const msg = value.messages[0];
    console.log("[WEBHOOK RAW BODY]", JSON.stringify(body, null, 2));

    if (!msg || !msg.from) {
      return new Response("ok", { status: 200 });
    }

    // =========================
    // USER ID CONSISTENTE
    // =========================
    const fromRaw = msg.from;

    const from =
      value.contacts?.[0]?.wa_id ||
      String(normalizePhone(fromRaw)).replace(/\D/g, "");

    // =========================
    // INPUT
    // =========================
    const text =
      msg.text?.body ||
      msg.interactive?.button_reply?.title ||
      msg.button?.text ||
      "";
    console.log("[RAW TEXT BEFORE CLEAN]", text);
    const image = msg.image || null;

    console.log("[INCOMING]", {
      from,
      text,
      type: msg.type,
      msgId: msg.id,
    });

    // =========================
    //  DEDUPE
    // =========================
    if (msg.id) {
      const dedupeKey = `msg:${msg.id}`;

      try {
        const exists = await redis.get(dedupeKey);

        if (exists) {
          console.log("[DUPLICATED MESSAGE - SKIPPED]");
          return new Response("ok", { status: 200 });
        }

        // Guardar con expiración REAL
        await redis.set(dedupeKey, "1", { ex: 60 });
      } catch (e) {
        console.log("[DEDUPE ERROR - CONTINUE]", e);
      }
    }
    await redis.sadd("metrics:active_users", from);
    const today = new Date().toISOString().slice(0, 10);

    await redis.sadd(`metrics:users:${today}`, from);
    // =========================
    // LOGO HANDLER
    // =========================
    if (image) {
      try {
        const state = await getState(from);

        if (state?.step === "brand_logo") {
          console.log("[LOGO UPLOAD START]");

          const mediaUrl = await getMediaUrl(image.id);
          const buffer = await downloadMedia(mediaUrl);
          if (!buffer) {
            console.error("[LOGO ERROR] buffer vacío");
            return new Response("ok", { status: 200 });
          }

          const filename = `logo-${from}.jpg`;
          const url = await uploadFile(buffer, filename);

          state.brand = state.brand || {};
          state.brand.logo = url;
          // 🔥 guardar en usuario
          const userData = (await getUser(from)) || {};
          userData.brand = {
            ...(userData.brand || {}),
            logo: url,
          };
          await saveUser(from, userData);

          state.step = "brand_menu";
          await setState(from, state);

          console.log("[LOGO SAVED]", url);

          await sendMessage(from, {
            text: "✅ Logo guardado",
            next: `🎨 Personalizar PDF

1 Nombre de empresa
2 Color (HEX)
3 Logo (imagen)
4 Ver configuración
5 Volver
6 Teléfono
7 Sitio Web
8 Email`,
          });

          return new Response("ok", { status: 200 });
        }
      } catch (err) {
        console.error("[LOGO ERROR]", err);
      }
    }

    // =========================
    // IGNORAR VACÍOS
    // =========================
    if (!text && !image) {
      console.log("[IGNORED EMPTY]");
      return new Response("ok", { status: 200 });
    }

    // =========================
    // DEBUG (puedes quitar luego)
    // =========================
    if (process.env.NODE_ENV !== "production") {
      await debugWhatsAppConfig();
    }

    // =========================
    // FLOW
    // =========================
    console.log("[TEXT TO FLOW]", text);
    const res = await flow(from, text);
    console.log("[FLOW RETURN]", res);
    console.log("[FLOW OUTPUT]", {
      from,
      res,
    });

    console.log("[FLOW RESULT]", res);

    if (!res || res === "__queued__") {
      console.log("[FLOW HANDLED BY QUEUE]");

      //  DISPARA WORKER AQUÍ
      fetch(`${process.env.APP_URL}/api/queue`)
        .then((r) => r.text())
        .then((t) => console.log("[QUEUE RESPONSE]", t))
        .catch((e) => console.error("[QUEUE ERROR]", e));

      // KICK
      setTimeout(() => {
        fetch(`${process.env.APP_URL}/api/queue`);
      }, 2000);

      return new Response("ok", { status: 200 });
    }

    // =========================
    // SEND
    // =========================
    try {
      console.log("[SMART SEND]");
      const userData = await getUser(from);

      console.log("[QUEUE] about to enqueue", {
        to: from,
        plan: userData?.plan,
        response: res,
      });

      await enqueueMessage({
        to: from,
        plan: userData?.plan,
        response: res,
      });

      console.log("[QUEUE] enqueued OK");

      //  PROCESAR DIRECTO
      const workerRes = await fetch(`${process.env.APP_URL}/api/queue`);
      const workerText = await workerRes.text();

      console.log("[QUEUE RESPONSE]", workerText);
      //  KICK
      setTimeout(() => {
        fetch(`${process.env.APP_URL}/api/queue`);
      }, 2000);
    } catch (err) {
      console.error("[SEND ERROR]", err);
    }
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("[WEBHOOK ERROR]", error);
    return new Response("ok", { status: 200 });
  }
}
