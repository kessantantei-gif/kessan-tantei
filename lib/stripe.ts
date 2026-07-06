import Stripe from "stripe";

let cachedStripe: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY が設定されていません");
  }

  if (!cachedStripe) {
    cachedStripe = new Stripe(secretKey);
  }

  return cachedStripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripe(), prop);
  },
});
