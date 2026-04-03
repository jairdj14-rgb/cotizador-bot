import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Falta STRIPE_SECRET_KEY");
}

if (!process.env.APP_URL) {
  throw new Error("Falta APP_URL");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PLAN_PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
};

export function getPlanLabel(plan) {
  if (plan === "basic") return "BASIC";
  if (plan === "pro") return "PRO";
  return "FREE";
}

export function getQuoteLimit(plan) {
  if (plan === "basic") return 100;
  if (plan === "pro") return Infinity;
  return 5;
}

export async function createCheckoutUrl({ plan, waUser }) {
  if (!plan || !["basic", "pro"].includes(plan)) {
    throw new Error("Plan inválido");
  }

  if (!waUser) {
    throw new Error("Falta waUser");
  }

  const priceId = PLAN_PRICE_MAP[plan];

  if (!priceId) {
    throw new Error(`Falta price ID para plan: ${plan}`);
  }

  const baseUrl = process.env.APP_URL.replace(/\/$/, "");

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${baseUrl}/?pago=ok`,
    cancel_url: `${baseUrl}/?pago=cancelado`,
    client_reference_id: waUser,
    metadata: {
      waUser,
      plan,
    },
    subscription_data: {
      metadata: {
        waUser,
        plan,
      },
    },
  });

  if (!session.url) {
    throw new Error("Stripe no devolvió URL de checkout");
  }

  return session.url;
}

export { stripe };
