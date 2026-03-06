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
