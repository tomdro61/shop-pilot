import type Stripe from "stripe";

export function isDeletedCustomer(
  c: Stripe.Customer | Stripe.DeletedCustomer
): c is Stripe.DeletedCustomer {
  return "deleted" in c && c.deleted === true;
}
