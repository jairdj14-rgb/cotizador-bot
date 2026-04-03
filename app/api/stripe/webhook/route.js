import { stripe } from "../../../../lib/stripe";
import { redis, kUser } from "../../../../lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ===== LOGGER =====
async function logStripe(data) {
  const entry = {
    ts: new Date().toISOString(),
    env: process.env.VERCEL ? "production" : "local",
    ...data,
  };

  console.log("[stripe-webhook]", JSON.stringify(entry));

  try {
    if (redis?.lpush && redis?.ltrim) {
      await redis.lpush("logs:stripe:webhook", JSON.stringify(entry));
      await redis.ltrim("logs:stripe:webhook", 0, 100);
    }
  } catch (err) {
    console.error("[stripe-webhook][log-error]", err);
  }
}

// ===== GET =====
export async function GET() {
  return new Response("stripe webhook ok", { status: 200 });
}

// ===== POST =====
export async function POST(req) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  // ===== DEBUG: SECRET COMPLETO =====
  await logStripe({
    stage: "debug_secret_full",
    secretFull: webhookSecret,
    secretSuffix: webhookSecret?.slice(-6),
  });

  // ===== PRECHECK =====
  if (!signature) {
    await logStripe({
      level: "error",
      stage: "precheck",
      message: "Missing stripe-signature",
    });
    return new Response("Missing signature", { status: 400 });
  }

  if (!webhookSecret) {
    await logStripe({
      level: "error",
      stage: "precheck",
      message: "Missing STRIPE_WEBHOOK_SECRET",
    });
    return new Response("Missing secret", { status: 500 });
  }

  // ===== RAW BODY =====
  const rawBody = await req.arrayBuffer();
  const buf = Buffer.from(rawBody);

  await logStripe({
    level: "info",
    stage: "incoming",
    payloadLength: buf.length,
    signatureStart: signature.slice(0, 30),
  });

  let event;

  // ===== SIGNATURE CHECK =====
  try {
    event = stripe.webhooks.constructEvent(buf, signature, webhookSecret);
  } catch (err) {
    await logStripe({
      level: "error",
      stage: "signature_failed",
      message: err.message,
      hint: "Revisa si el secret coincide EXACTAMENTE con el del endpoint en Stripe",
      signatureStart: signature.slice(0, 20),
      secretUsed: webhookSecret,
      secretSuffix: webhookSecret?.slice(-6),
    });

    return new Response("Invalid signature", { status: 400 });
  }

  // ===== SUCCESS =====
  await logStripe({
    level: "success",
    stage: "signature_ok",
    eventId: event.id,
    type: event.type,
  });

  // ===== IDEMPOTENCIA =====
  try {
    const exists = await redis.get(`stripe:event:${event.id}`);
    if (exists) {
      await logStripe({
        level: "info",
        stage: "duplicate",
        eventId: event.id,
      });
      return new Response("ok", { status: 200 });
    }
  } catch (err) {
    console.error("[idempotency-error]", err);
  }

  // ===== HANDLE =====
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const waUser = session.metadata?.waUser || session.client_reference_id;
        const plan = session.metadata?.plan;

        await logStripe({
          stage: "metadata_check",
          waUser,
          plan,
          metadata: session.metadata,
        });

        if (!waUser || !plan) {
          await logStripe({
            level: "warn",
            stage: "missing_metadata",
          });
          break;
        }

        const current = (await redis.get(kUser(waUser))) || {};

        const next = {
          ...current,
          plan,
          billingStatus: "active",
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : null,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : null,
          planActivatedAt: Date.now(),
        };

        await redis.set(kUser(waUser), next);

        await logStripe({
          level: "success",
          stage: "plan_activated",
          waUser,
          plan,
        });

        break;
      }

      default:
        await logStripe({
          level: "info",
          stage: "unhandled",
          type: event.type,
        });
    }

    await redis.set(`stripe:event:${event.id}`, true);

    return new Response("ok", { status: 200 });
  } catch (err) {
    await logStripe({
      level: "error",
      stage: "handler_error",
      message: err.message,
    });

    return new Response("handler error", { status: 500 });
  }
}
