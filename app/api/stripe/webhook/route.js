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

// ===== HELPERS =====
async function getUser(waUser) {
  const raw = await redis.get(kUser(waUser));
  return raw ? JSON.parse(raw) : {};
}

async function saveUser(waUser, data) {
  await redis.set(kUser(waUser), JSON.stringify(data));
}

async function downgradeUser(waUser) {
  const user = await getUser(waUser);

  const next = {
    ...user,
    plan: "FREE",
    billingStatus: "inactive",
  };

  await saveUser(waUser, next);

  await logStripe({
    level: "warn",
    stage: "user_downgraded",
    waUser,
  });
}

// ===== GET =====
export async function GET() {
  return new Response("stripe webhook ok", { status: 200 });
}

// ===== POST =====
export async function POST(req) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  await logStripe({
    stage: "debug_secret",
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

  let event;

  // ===== SIGNATURE CHECK =====
  try {
    event = stripe.webhooks.constructEvent(buf, signature, webhookSecret);
  } catch (err) {
    await logStripe({
      level: "error",
      stage: "signature_failed",
      message: err.message,
    });

    return new Response("Invalid signature", { status: 400 });
  }

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
      // ✅ COMPRA INICIAL
      case "checkout.session.completed": {
        const session = event.data.object;

        const waUser = session.metadata?.waUser || session.client_reference_id;
        const plan = session.metadata?.plan;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;

        await logStripe({
          stage: "checkout_completed",
          waUser,
          plan,
        });

        if (!waUser || !plan) {
          await logStripe({
            level: "warn",
            stage: "missing_metadata",
          });
          break;
        }

        const current = await getUser(waUser);

        const next = {
          ...current,
          plan,
          billingStatus: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId:
            typeof session.subscription === "string"
              ? session.subscription
              : null,
          planActivatedAt: Date.now(),
        };

        await saveUser(waUser, next);

        // 🔥 INDEX CLAVE
        if (customerId) {
          await redis.set(`stripe:customer:${customerId}`, waUser);
        }

        await logStripe({
          level: "success",
          stage: "plan_activated",
          waUser,
          plan,
        });

        break;
      }

      // ✅ RENOVACIÓN EXITOSA
      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const waUser = await redis.get(`stripe:customer:${customerId}`);

        if (!waUser) break;

        const user = await getUser(waUser);

        user.billingStatus = "active";

        await saveUser(waUser, user);

        await logStripe({
          level: "success",
          stage: "invoice_paid",
          waUser,
        });

        break;
      }

      // ❌ PAGO FALLIDO
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const waUser = await redis.get(`stripe:customer:${customerId}`);

        if (!waUser) break;

        await downgradeUser(waUser);

        break;
      }

      // ❌ CANCELACIÓN
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customerId = sub.customer;

        const waUser = await redis.get(`stripe:customer:${customerId}`);

        if (!waUser) break;

        await downgradeUser(waUser);

        break;
      }

      default:
        await logStripe({
          level: "info",
          stage: "unhandled",
          type: event.type,
        });
    }

    // ✅ marcar evento procesado
    await redis.set(`stripe:event:${event.id}`, true);

    return new Response("ok", { status: 200 });
  } catch (err) {
    await logStripe({
      level: "error",
      stage: "handler_error",
      message: err.message,
    });

    return new Response("ok", { status: 200 }); // ⚠️ IMPORTANTE: evitar retries infinitos
  }
}
