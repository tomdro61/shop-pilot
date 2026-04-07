// SMS message templates — pure functions, no side effects

export function estimateSentSMS({
  firstName,
  year,
  make,
  model,
  link,
}: {
  firstName: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  link: string;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  return `Hi ${firstName}, your estimate from Broadway Motors${vehicle ? ` for your ${vehicle}` : ""} is ready for review. View and approve here: ${link}`;
}

export function invoiceSentSMS({
  firstName,
  year,
  make,
  model,
  link,
}: {
  firstName: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  link: string;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  return `Hi ${firstName}, your invoice from Broadway Motors${vehicle ? ` for your ${vehicle}` : ""} is ready. Pay here: ${link}`;
}

export function vehicleReadySMS({
  firstName,
  year,
  make,
  model,
  closeTime,
}: {
  firstName: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  closeTime: string;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  return `Hi ${firstName}, your ${vehicle || "vehicle"} is ready for pickup at Broadway Motors! We're open until ${closeTime} today. See you soon!`;
}

export function paymentReceivedSMS({
  firstName,
  amount,
  year,
  make,
  model,
}: {
  firstName: string;
  amount: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  return `Hi ${firstName}, we received your payment of ${amount}${vehicle ? ` for your ${vehicle}` : ""}. Thank you for choosing Broadway Motors!\n\nIf you have a moment, a Google review would mean a lot to a local business like ours: https://g.page/r/CTjykJeAA929EBM/review`;
}

export function reservationConfirmationSMS({
  firstName,
  dropOffDate,
  dropOffTime,
  pickUpDate,
  pickUpTime,
  lot,
  parkingType,
}: {
  firstName: string;
  dropOffDate: string;
  dropOffTime: string;
  pickUpDate: string;
  pickUpTime: string;
  lot?: string;
  parkingType?: string;
}) {
  // Valet — short confirmation, valet will reach out
  if (lot === "Boston Logan Valet" || parkingType === "valet") {
    return `Hi ${firstName}, your valet service is confirmed! Your valet will be reaching out to you shortly.`;
  }

  // APB1
  if (lot === "Airport Parking Boston 1") {
    return `Hi ${firstName}, your parking reservation is confirmed!\n\nDrop off: ${dropOffDate} at ${dropOffTime}\nPick up: ${pickUpDate} at ${pickUpTime}\n\nParking instructions: https://broadwaymotorsma.com/confirm-self-park/thank-you?lot=apb1`;
  }

  // APB2
  if (lot === "Airport Parking Boston 2") {
    return `Hi ${firstName}, your parking reservation is confirmed!\n\nDrop off: ${dropOffDate} at ${dropOffTime}\nPick up: ${pickUpDate} at ${pickUpTime}\n\nParking instructions: https://broadwaymotorsma.com/confirm-self-park/thank-you?lot=apb2`;
  }

  // Broadway Motors shuttle
  if (parkingType === "shuttle") {
    return `Hi ${firstName}, your parking reservation is confirmed!\n\nDrop off: ${dropOffDate} at ${dropOffTime}\nPick up: ${pickUpDate} at ${pickUpTime}\n\nYour shuttle will be ready to take you to the airport when you arrive.\n\nSee you soon — Broadway Motors.\n\nParking instructions: https://broadwaymotorsma.com/confirm-self-park/thank-you?lot=shuttle`;
  }

  // Broadway Motors self-park (default)
  return `Hi ${firstName}, your parking reservation is confirmed!\n\nDrop off: ${dropOffDate} at ${dropOffTime}\nPick up: ${pickUpDate} at ${pickUpTime}\n\nSee you soon — Broadway Motors.\n\nParking instructions: https://broadwaymotorsma.com/confirm-self-park/thank-you?lot=broadway-motors`;
}

export function pickupReadySMS({
  firstName,
  boxNumber,
  boxCode,
}: {
  firstName: string;
  boxNumber: number;
  boxCode: string;
}) {
  return `Hi ${firstName}, your vehicle is ready for pickup!\n\nYour keys are in lock box #${boxNumber}, code: ${boxCode}.\n\nThank you for parking with Broadway Motors! If you have a moment, a Google review would mean a lot to a local business like ours. https://g.page/r/CTjykJeAA929EBM/review`;
}

export function quoteRequestAckSMS({ firstName }: { firstName: string }) {
  return `Thanks for requesting a quote from Broadway Motors! We'll be in touch shortly.`;
}

export function quoteRequestInternalSMS({
  firstName,
  lastName,
  vehicleYear,
  vehicleMake,
  vehicleModel,
  services,
}: {
  firstName: string;
  lastName: string;
  vehicleYear?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  services: string[];
}) {
  let msg = `New quote request from ${firstName} ${lastName}`;
  const vehicle = [vehicleYear, vehicleMake, vehicleModel].filter(Boolean).join(" ");
  if (vehicle) msg += ` — ${vehicle}`;
  if (services.length > 0) msg += ` — ${services.join(", ")}`;
  return msg;
}

export function paymentReceivedInternalSMS({
  firstName,
  lastName,
  amount,
  year,
  make,
  model,
}: {
  firstName: string;
  lastName: string;
  amount: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  let msg = `Payment received: ${amount} from ${firstName} ${lastName}`;
  if (vehicle) msg += ` — ${vehicle}`;
  return msg;
}

export function parkingSpecialsSMS({
  firstName,
  specials,
}: {
  firstName: string;
  specials: { label: string; price: string; link?: string }[];
}) {
  const list = specials
    .map((s) => {
      const line = s.price ? `- ${s.label}: ${s.price}` : `- ${s.label}`;
      return s.link ? `${line}\n  ${s.link}` : line;
    })
    .join("\n");
  return `Hi ${firstName}, this is John, the manager at Broadway Motors. While your car is parked with us, we'd love the chance to take care of any maintenance or repairs for you, saves you a trip later! Here are some of our most popular services:\n\n${list}\n\nIf anything catches your eye, just reply to this text and we'll take a look and send you an estimate before doing any work. No pressure at all — John`;
}

// ── DVI Templates ──────────────────────────────────────────

import { formatRONumber } from "@/lib/utils/format";

export function dviReportSMS({
  firstName,
  year,
  make,
  model,
  link,
}: {
  firstName: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  link: string;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  return `Hi ${firstName}, your vehicle inspection report${vehicle ? ` for your ${vehicle}` : ""} is ready. View it here: ${link} — Broadway Motors`;
}

export function dviCompletedInternalSMS({
  year,
  make,
  model,
  roNumber,
  good,
  monitor,
  attention,
}: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  roNumber?: number | null;
  good: number;
  monitor: number;
  attention: number;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  const ro = roNumber ? formatRONumber(roNumber) : "RO";
  return `DVI completed for ${vehicle || "vehicle"} — ${ro}. ${good} good, ${monitor} monitor, ${attention} attention.`;
}

export function dviApprovalInternalSMS({
  customerName,
  year,
  make,
  model,
  roNumber,
  approvedItems,
  total,
}: {
  customerName: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  roNumber?: number | null;
  approvedItems: string[];
  total: number;
}) {
  const vehicle = [year, make, model].filter(Boolean).join(" ");
  const ro = roNumber ? `RO #${String(roNumber).padStart(4, "0")}` : "";
  const itemList = approvedItems.join(", ");
  return `${customerName} approved ${approvedItems.length} service${approvedItems.length !== 1 ? "s" : ""} from DVI on ${vehicle || "vehicle"}${ro ? ` (${ro})` : ""}: ${itemList} — $${total.toLocaleString()} total.`;
}
