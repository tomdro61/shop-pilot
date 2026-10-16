// One-time cleanup: void Stripe invoices that are still open on jobs ShopPilot
// already recorded as paid another way (cash, check, card reader). Each open
// link is a bill the customer could pay a second time.
//
// Usage (from the shop-pilot folder):
//   STRIPE_LIVE_SECRET_KEY=sk_live_... node scripts/void-stale-invoices.mjs            # dry run
//   STRIPE_LIVE_SECRET_KEY=sk_live_... node scripts/void-stale-invoices.mjs --apply    # void them
//
// Reads the database with the service-role key from .env.local. Deliberately
// does NOT read STRIPE_SECRET_KEY from .env.local, which is the test key: the
// live key has to be passed on purpose. Local rows are not touched; the
// invoice.voided webhook deletes them as Stripe confirms each void.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

const apply = process.argv.includes("--apply");

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    })
);

const liveKey = process.env.STRIPE_LIVE_SECRET_KEY;
if (!liveKey || !liveKey.startsWith("sk_live_")) {
  console.error("Set STRIPE_LIVE_SECRET_KEY to the live secret key (sk_live_...). Nothing was done.");
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const stripe = new Stripe(liveKey);

async function all(table, select, mod) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(select).order("id", { ascending: true }).range(from, from + 999);
    if (mod) q = mod(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const [invoices, jobs] = await Promise.all([
  all("invoices", "id, job_id, stripe_invoice_id, status, amount", (q) => q.neq("status", "paid").not("job_id", "is", null)),
  all("jobs", "id, ro_number, payment_status, payment_method, paid_at", (q) => q.eq("payment_status", "paid")),
]);
const paidJobs = new Map(jobs.map((j) => [j.id, j]));

const stale = invoices.filter((i) => paidJobs.has(i.job_id));
console.log(`${stale.length} local invoice rows are open on jobs already marked paid${apply ? "" : " (dry run — pass --apply to void)"}.\n`);

const summary = { voided: 0, alreadyClosed: 0, paidInStripe: [], missing: 0, failed: [] };

for (const inv of stale) {
  const job = paidJobs.get(inv.job_id);
  const ro = job.ro_number != null ? `RO-${String(job.ro_number).padStart(4, "0")}` : inv.job_id;
  const label = `${ro}  job paid by ${job.payment_method ?? "?"} on ${(job.paid_at ?? "").slice(0, 10)}  invoice $${Number(inv.amount ?? 0).toFixed(2)}  ${inv.stripe_invoice_id ?? "(no stripe id)"}`;

  if (!inv.stripe_invoice_id) {
    summary.missing++;
    console.log(`SKIP  ${label}  — no Stripe id on the row`);
    continue;
  }

  let si;
  try {
    si = await stripe.invoices.retrieve(inv.stripe_invoice_id);
  } catch (err) {
    if (err?.code === "resource_missing") {
      summary.missing++;
      console.log(`SKIP  ${label}  — not found in Stripe (wrong mode?)`);
      continue;
    }
    summary.failed.push({ ro, error: err?.message ?? String(err) });
    console.log(`FAIL  ${label}  — ${err?.message ?? err}`);
    continue;
  }

  if (si.status === "paid") {
    // The customer paid the link AND the shop recorded another method: a
    // double payment that needs a refund decision, not a void.
    summary.paidInStripe.push({ ro, stripeInvoiceId: inv.stripe_invoice_id, amount: si.amount_paid / 100 });
    console.log(`PAID  ${label}  — PAID IN STRIPE TOO. Possible double payment; review and refund.`);
    continue;
  }
  if (si.status === "void") {
    summary.alreadyClosed++;
    console.log(`DONE  ${label}  — already void in Stripe (local row will clear on next webhook or by hand)`);
    continue;
  }

  if (!apply) {
    console.log(`WOULD ${label}  — Stripe status ${si.status}`);
    summary.voided++;
    continue;
  }

  try {
    await stripe.invoices.voidInvoice(inv.stripe_invoice_id);
    summary.voided++;
    console.log(`VOID  ${label}`);
  } catch (err) {
    summary.failed.push({ ro, error: err?.message ?? String(err) });
    console.log(`FAIL  ${label}  — ${err?.message ?? err}`);
  }
}

console.log(`\n${apply ? "Voided" : "Would void"}: ${summary.voided}`);
console.log(`Already void in Stripe: ${summary.alreadyClosed}`);
console.log(`Not found / no Stripe id: ${summary.missing}`);
console.log(`Paid in Stripe as well (double payment candidates): ${summary.paidInStripe.length}`);
for (const p of summary.paidInStripe) console.log(`   ${p.ro}  ${p.stripeInvoiceId}  $${p.amount.toFixed(2)}`);
console.log(`Failed: ${summary.failed.length}`);
for (const f of summary.failed) console.log(`   ${f.ro}  ${f.error}`);
