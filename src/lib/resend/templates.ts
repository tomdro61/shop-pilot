import type { TotalsBreakdown } from "@/lib/utils/totals";

interface LineItem {
  type: "labor" | "part";
  description: string;
  quantity: number;
  unit_cost: number;
}

function formatMoneyDollars(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Broadway Motors</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f4;padding:24px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#1c1917;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">Broadway Motors</h1>
              <p style="margin:4px 0 0;color:#a8a29e;font-size:13px;">Auto Repair &middot; Revere, MA</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;border-top:1px solid #e7e5e4;background-color:#fafaf9;">
              <p style="margin:0;color:#78716c;font-size:12px;line-height:1.5;">
                Broadway Motors &middot; Revere, MA<br>
                Questions? Call or text us anytime.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function lineItemsTable(lineItems: LineItem[], totals: TotalsBreakdown): string {
  const rows = lineItems
    .map(
      (li) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;color:#44403c;font-size:14px;">
        ${li.description}
        <span style="color:#a8a29e;font-size:12px;">(${li.type})</span>
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;color:#44403c;font-size:14px;text-align:center;">${li.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(li.unit_cost)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f5f5f4;color:#1c1917;font-size:14px;text-align:right;font-weight:500;">${formatMoneyDollars(li.quantity * li.unit_cost)}</td>
    </tr>`
    )
    .join("");

  let summaryRows = `
    <tr>
      <td style="padding:4px 0;color:#78716c;font-size:14px;">Labor</td>
      <td style="padding:4px 0;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(totals.laborTotal)}</td>
    </tr>
    <tr>
      <td style="padding:4px 0;color:#78716c;font-size:14px;">Parts</td>
      <td style="padding:4px 0;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(totals.partsTotal)}</td>
    </tr>`;

  if (totals.shopSuppliesEnabled && totals.shopSupplies > 0) {
    summaryRows += `
    <tr>
      <td style="padding:4px 0;color:#78716c;font-size:14px;">Shop Supplies</td>
      <td style="padding:4px 0;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(totals.shopSupplies)}</td>
    </tr>`;
  }

  if (totals.hazmatEnabled && totals.hazmat > 0) {
    summaryRows += `
    <tr>
      <td style="padding:4px 0;color:#78716c;font-size:14px;">${totals.hazmatLabel}</td>
      <td style="padding:4px 0;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(totals.hazmat)}</td>
    </tr>`;
  }

  summaryRows += `
    <tr>
      <td style="padding:4px 0;color:#78716c;font-size:14px;">Tax (${(totals.taxRate * 100).toFixed(2)}%)</td>
      <td style="padding:4px 0;color:#44403c;font-size:14px;text-align:right;">${formatMoneyDollars(totals.taxAmount)}</td>
    </tr>`;

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
    <tr style="background-color:#fafaf9;">
      <th style="padding:8px 0;text-align:left;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Description</th>
      <th style="padding:8px 0;text-align:center;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Qty</th>
      <th style="padding:8px 0;text-align:right;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Unit</th>
      <th style="padding:8px 0;text-align:right;color:#78716c;font-size:12px;font-weight:600;text-transform:uppercase;">Total</th>
    </tr>
    ${rows}
  </table>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
    ${summaryRows}
    <tr>
      <td style="padding:8px 0;border-top:2px solid #1c1917;color:#1c1917;font-size:16px;font-weight:700;">Total</td>
      <td style="padding:8px 0;border-top:2px solid #1c1917;color:#1c1917;font-size:16px;font-weight:700;text-align:right;">${formatMoneyDollars(totals.grandTotal)}</td>
    </tr>
  </table>`;
}

export function estimateReadyEmail({
  customerName,
  jobTitle,
  vehicleDesc,
  approvalUrl,
  lineItems,
  totals,
}: {
  customerName: string;
  jobTitle: string | null;
  vehicleDesc: string;
  approvalUrl: string;
  lineItems: LineItem[];
  totals: TotalsBreakdown;
}): { subject: string; html: string } {
  const content = `
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.6;">
      Hi ${customerName},
    </p>
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.6;">
      Your estimate from Broadway Motors is ready for review.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafaf9;border-radius:6px;padding:16px;margin:0 0 20px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;color:#78716c;font-size:12px;text-transform:uppercase;font-weight:600;">Vehicle</p>
          <p style="margin:0 0 12px;color:#1c1917;font-size:15px;font-weight:500;">${vehicleDesc}</p>
          ${
            jobTitle
              ? `<p style="margin:0 0 4px;color:#78716c;font-size:12px;text-transform:uppercase;font-weight:600;">Service</p>
          <p style="margin:0;color:#1c1917;font-size:15px;font-weight:500;">${jobTitle}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
    ${lineItemsTable(lineItems, totals)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr>
        <td align="center">
          <a href="${approvalUrl}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:6px;">
            View &amp; Approve Estimate
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:20px 0 0;color:#a8a29e;font-size:13px;text-align:center;">
      You can also decline the estimate from the link above.
    </p>`;

  return {
    subject: "Your estimate from Broadway Motors",
    html: baseLayout(content),
  };
}

export function paymentReceiptEmail({
  customerName,
  jobTitle,
  vehicleDesc,
  amount,
  paymentMethod,
  lineItems,
  totals,
}: {
  customerName: string;
  jobTitle: string | null;
  vehicleDesc: string;
  amount: number;
  paymentMethod: string;
  lineItems: LineItem[];
  totals: TotalsBreakdown;
}): { subject: string; html: string } {
  const methodLabel =
    paymentMethod === "stripe"
      ? "Card (Stripe)"
      : paymentMethod === "terminal"
        ? "Card (In-Person)"
        : paymentMethod === "ach"
          ? "ACH Transfer"
          : paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);

  const content = `
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.6;">
      Hi ${customerName},
    </p>
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.6;">
      Thank you for your payment. Here's your receipt.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border-radius:6px;padding:16px;margin:0 0 20px;">
      <tr>
        <td align="center">
          <p style="margin:0 0 4px;color:#15803d;font-size:13px;font-weight:600;text-transform:uppercase;">Payment Received</p>
          <p style="margin:0 0 8px;color:#15803d;font-size:28px;font-weight:700;">${formatMoneyDollars(amount)}</p>
          <p style="margin:0;color:#4ade80;font-size:13px;">${methodLabel} &middot; ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fafaf9;border-radius:6px;padding:16px;margin:0 0 20px;">
      <tr>
        <td>
          <p style="margin:0 0 4px;color:#78716c;font-size:12px;text-transform:uppercase;font-weight:600;">Vehicle</p>
          <p style="margin:0 0 12px;color:#1c1917;font-size:15px;font-weight:500;">${vehicleDesc}</p>
          ${
            jobTitle
              ? `<p style="margin:0 0 4px;color:#78716c;font-size:12px;text-transform:uppercase;font-weight:600;">Service</p>
          <p style="margin:0;color:#1c1917;font-size:15px;font-weight:500;">${jobTitle}</p>`
              : ""
          }
        </td>
      </tr>
    </table>
    ${lineItemsTable(lineItems, totals)}`;

  return {
    subject: "Payment receipt from Broadway Motors",
    html: baseLayout(content),
  };
}

export function genericEmail({
  customerName,
  body,
}: {
  customerName: string;
  body: string;
}): { subject: string; html: string } {
  // Convert newlines to <br> for plain-text bodies
  const htmlBody = body.replace(/\n/g, "<br>");

  const content = `
    <p style="margin:0 0 16px;color:#44403c;font-size:15px;line-height:1.6;">
      Hi ${customerName},
    </p>
    <p style="margin:0;color:#44403c;font-size:15px;line-height:1.6;">
      ${htmlBody}
    </p>`;

  return {
    subject: "Message from Broadway Motors",
    html: baseLayout(content),
  };
}
