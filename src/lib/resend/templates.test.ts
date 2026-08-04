/**
 * Escaping tests for the outbound email templates.
 *
 * These exist because `customers.first_name` and `parking_reservations.lot` are
 * written by unauthenticated public forms (the parking, booking, and
 * quote-request endpoints), and `lot` has no length or character validation at
 * all. Anything interpolated into these templates is therefore attacker-
 * influenced text going out under the shop's name — the parking receipt
 * especially, since the Stripe webhook sends it with no human in the loop.
 *
 * Before these existed, making escapeHtml the identity function passed the
 * entire suite.
 */
import { describe, it, expect } from "vitest";
import {
  invoiceReadyEmail,
  estimateReadyEmail,
  paymentReceiptEmail,
  parkingPaymentReceiptEmail,
  dviReportEmail,
} from "./templates";

const XSS = `<img src=x onerror="alert(1)">`;
const ESCAPED = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

const TOTALS = {
  laborTotal: 100,
  partsTotal: 0,
  shopSupplies: 0,
  shopSuppliesEnabled: false,
  hazmat: 0,
  hazmatEnabled: false,
  hazmatLabel: "Environmental Fee",
  taxableAmount: 0,
  taxAmount: 0,
  taxRate: 0.0625,
  grandTotal: 100,
};

describe("email templates escape customer-supplied text", () => {
  it("invoiceReadyEmail escapes the name, vehicle, and job title", () => {
    const { html } = invoiceReadyEmail({
      customerName: XSS,
      vehicleDesc: XSS,
      jobTitle: XSS,
      paymentUrl: "https://invoice.stripe.com/i/test",
      amount: 486.2,
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain(ESCAPED);
    // The payment link must survive escaping intact — it's the point of the email.
    expect(html).toContain("https://invoice.stripe.com/i/test");
  });

  it("escapes ampersands without double-escaping", () => {
    const { html } = invoiceReadyEmail({
      customerName: "Mike",
      vehicleDesc: "2019 Honda & Civic",
      jobTitle: null,
      paymentUrl: "https://invoice.stripe.com/i/test",
      amount: 10,
    });
    expect(html).toContain("2019 Honda &amp; Civic");
    expect(html).not.toContain("&amp;amp;");
  });

  it("parkingPaymentReceiptEmail escapes the lot — an unvalidated public field", () => {
    const { html } = parkingPaymentReceiptEmail({
      customerName: XSS,
      lot: XSS,
      lineItems: [{ description: XSS, amount: 40 }],
      total: 40,
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain(ESCAPED);
  });

  it("estimateReadyEmail escapes its interpolated fields", () => {
    const { html } = estimateReadyEmail({
      customerName: XSS,
      vehicleDesc: XSS,
      jobTitle: XSS,
      approvalUrl: "https://example.com/estimate/token",
      lineItems: [{ type: "labor", description: XSS, quantity: 1, unit_cost: 100 }],
      totals: TOTALS,
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain(ESCAPED);
  });

  it("paymentReceiptEmail escapes its interpolated fields", () => {
    const { html } = paymentReceiptEmail({
      customerName: XSS,
      vehicleDesc: XSS,
      jobTitle: XSS,
      lineItems: [{ type: "part", description: XSS, quantity: 1, unit_cost: 100 }],
      totals: TOTALS,
      amount: 100,
      paymentMethod: "card",
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain(ESCAPED);
  });

  it("dviReportEmail escapes its interpolated fields", () => {
    const { html } = dviReportEmail({
      customerName: XSS,
      vehicleDesc: XSS,
      link: "https://example.com/dvi/token",
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain(ESCAPED);
  });
});

describe("invoiceReadyEmail reminder variant", () => {
  const base = {
    customerName: "Mike",
    vehicleDesc: "2019 Honda Civic",
    jobTitle: "Front brakes",
    paymentUrl: "https://invoice.stripe.com/i/test",
    amount: 486.2,
  };

  it("uses balance-due wording only when reminding", () => {
    const reminder = invoiceReadyEmail({ ...base, reminder: true });
    expect(reminder.subject).toContain("balance due");
    expect(reminder.html).toContain("still open");
    expect(reminder.html).toContain("Balance Due");
  });

  it("defaults to first-send wording", () => {
    const first = invoiceReadyEmail(base);
    expect(first.subject).not.toContain("balance due");
    expect(first.html).toContain("is ready");
    expect(first.html).toContain("Amount Due");
  });
});
