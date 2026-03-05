export type PhoneLine = "shop" | "parking";

/** Returns the Quo phone number for the given business line. */
export function getPhoneNumber(line: PhoneLine): string {
  if (line === "shop") {
    const num = process.env.QUO_SHOP_PHONE_NUMBER;
    if (!num) throw new Error("QUO_SHOP_PHONE_NUMBER is not set");
    return num;
  }
  const num = process.env.QUO_PHONE_NUMBER;
  if (!num) throw new Error("QUO_PHONE_NUMBER is not set");
  return num;
}
