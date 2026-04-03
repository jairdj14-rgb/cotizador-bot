import { stripe } from "../../../../lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();

    const { waUser, plan } = body;

    if (!waUser || !plan) {
      return new Response(JSON.stringify({ error: "Missing waUser or plan" }), {
        status: 400,
      });
    }

    // ===== MAPEO DE PRECIOS =====
    let priceId;

    if (plan === "basic") {
      priceId = process.env.STRIPE_PRICE_BASIC;
    } else if (plan === "pro") {
      priceId = process.env.STRIPE_PRICE_PRO;
    } else {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
      });
    }

    // ===== CREAR SESSION =====
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],

      success_url: `${process.env.APP_URL}/success`,
      cancel_url: `${process.env.APP_URL}/cancel`,

      // 🔥 CLAVE: metadata
      metadata: {
        waUser,
        plan,
      },
    });

    return new Response(
      JSON.stringify({
        url: session.url,
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("[checkout-error]", error);

    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
    });
  }
}
