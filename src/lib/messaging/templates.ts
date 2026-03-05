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
  return `Hi ${firstName}, we received your payment of ${amount}${vehicle ? ` for your ${vehicle}` : ""}. Thank you for choosing Broadway Motors!`;
}

export function reservationConfirmationSMS({
  firstName,
  dropOffDate,
  dropOffTime,
  pickUpDate,
  pickUpTime,
}: {
  firstName: string;
  dropOffDate: string;
  dropOffTime: string;
  pickUpDate: string;
  pickUpTime: string;
}) {
  return `Hi ${firstName}, your parking reservation is confirmed! Drop off: ${dropOffDate} at ${dropOffTime}, Pick up: ${pickUpDate} at ${pickUpTime}. See you soon — Broadway Motors Airport Parking.\n\nParking instructions: https://www.broadwaymotorsrevere.com/afterparkandrepair`;
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
  return `Hi ${firstName}, your vehicle is ready for pickup! Your keys are in lock box #${boxNumber}, code: ${boxCode}. Thank you for parking with Broadway Motors!`;
}

export function parkingSpecialsSMS({
  firstName,
  specials,
}: {
  firstName: string;
  specials: { label: string; price: string }[];
}) {
  const list = specials.map((s) => `- ${s.label}: ${s.price}`).join("\n");
  return `Hi ${firstName}! While your car is with us, check out our specials:\n${list}\nInterested? Just reply to this text! — Broadway Motors`;
}
