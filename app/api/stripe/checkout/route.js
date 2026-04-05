import { stripe } from "../../../../lib/stripe";
import { redis, kUser } from "../../../../lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    console.log("[checkout] BODY:", body);

    const { waUser } = body;

    if (!waUser) {
      return new Response(JSON.stringify({ error: "Missing waUser" }), {
        status: 400,
      });
    }

    // 🔒 limpiar input
    const cleanWaUser = String(waUser).trim();

    if (cleanWaUser.length < 5) {
      return new Response(JSON.stringify({ error: "Invalid waUser" }), {
        status: 400,
      });
    }

    console.log("[checkout] cleanWaUser:", cleanWaUser);

    const priceId = process.env.STRIPE_PRICE_PRO;

    if (!priceId) throw new Error("Missing STRIPE_PRICE_PRO");
    if (!process.env.STRIPE_SECRET_KEY)
      throw new Error("Missing STRIPE_SECRET_KEY");
    if (!process.env.APP_URL) throw new Error("Missing APP_URL");

    // 🔥 PREVENIR DOBLE COMPRA
    try {
      const raw = await redis.get(kUser(cleanWaUser));
      const user = raw ? JSON.parse(raw) : null;

      if (user?.plan === "PRO" && user?.billingStatus === "active") {
        console.log("[checkout] already PRO:", cleanWaUser);

        return new Response(
          JSON.stringify({
            error: "User already has active PRO plan",
          }),
          { status: 400 },
        );
      }
    } catch (err) {
      console.error("[checkout] redis check error", err);
      // no bloqueamos compra por fallo de redis
    }

    // ✅ CREAR SESSION
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      payment_method_types: ["card"],

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      // 🔥 CUPONES ACTIVOS
      allow_promotion_codes: true,

      success_url: `${process.env.APP_URL}/success`,
      cancel_url: `${process.env.APP_URL}/cancel`,

      metadata: {
        waUser: cleanWaUser,
        plan: "PRO",
      },

      // 🔥 BACKUP CRÍTICO
      client_reference_id: cleanWaUser,
    });

    console.log("[checkout] session.id:", session.id);
    console.log("[checkout] session.url:", session.url);

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[checkout-error FULL]", error);

    return new Response(
      JSON.stringify({
        error: error.message,
      }),
      { status: 500 },
    );
  }
}
