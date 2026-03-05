export type PhoneLine = "shop" | "parking" | "apb";

/** Returns the Quo phone number for the given business line. */
export function getPhoneNumber(line: PhoneLine): string {
  if (line === "shop") {
    const num = process.env.QUO_SHOP_PHONE_NUMBER;
    if (!num) throw new Error("QUO_SHOP_PHONE_NUMBER is not set");
    return num;
  }
  if (line === "apb") {
    const num = process.env.QUO_APB_PHONE_NUMBER;
    if (!num) throw new Error("QUO_APB_PHONE_NUMBER is not set");
    return num;
  }
  const num = process.env.QUO_PHONE_NUMBER;
  if (!num) throw new Error("QUO_PHONE_NUMBER is not set");
  return num;
}

/** Returns the phone line for a given parking lot. */
export function getParkingLine(lot: string): PhoneLine {
  if (lot === "Broadway Motors") return "parking";
  return "apb";
}
