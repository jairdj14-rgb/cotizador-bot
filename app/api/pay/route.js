import { stripe } from "../../../lib/stripe";
import { redis } from "../../../lib/redis";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const waUser = searchParams.get("user");

  if (!waUser) {
    return new Response("Missing user", { status: 400 });
  }
  //  TRACK CHECKOUT CLICK

  await redis.incr("metrics:checkout");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: process.env.STRIPE_PRICE_PRO,
        quantity: 1,
      },
    ],
    success_url: `${process.env.APP_URL}/success`,
    cancel_url: `${process.env.APP_URL}/cancel`,
    metadata: {
      waUser,
      plan: "PRO",
    },
    client_reference_id: waUser,
  });

  return Response.redirect(session.url, 302);
}
