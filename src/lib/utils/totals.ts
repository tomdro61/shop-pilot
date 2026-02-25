import { MA_SALES_TAX_RATE, DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import type { ShopSettings, ShopSuppliesMethod } from "@/types";

export interface TotalsBreakdown {
  laborTotal: number;
  partsTotal: number;
  shopSupplies: number;
  shopSuppliesEnabled: boolean;
  hazmat: number;
  hazmatEnabled: boolean;
  hazmatLabel: string;
  taxableAmount: number;
  taxAmount: number;
  taxRate: number;
  grandTotal: number;
}

export const DEFAULT_SETTINGS: Pick<
  ShopSettings,
  | "tax_rate"
  | "shop_supplies_enabled"
  | "shop_supplies_method"
  | "shop_supplies_rate"
  | "shop_supplies_cap"
  | "hazmat_enabled"
  | "hazmat_amount"
  | "hazmat_label"
  | "job_categories"
> = {
  tax_rate: MA_SALES_TAX_RATE,
  shop_supplies_enabled: false,
  shop_supplies_method: "percent_of_labor",
  shop_supplies_rate: 0.05,
  shop_supplies_cap: null,
  hazmat_enabled: false,
  hazmat_amount: 3.0,
  hazmat_label: "Environmental Fee",
  job_categories: DEFAULT_JOB_CATEGORIES,
};

interface LineItemLike {
  type: string;
  quantity: number;
  unit_cost: number;
  total?: number;
}

function computeShopSupplies(
  method: ShopSuppliesMethod,
  rate: number,
  cap: number | null,
  laborTotal: number,
  partsTotal: number
): number {
  let amount: number;
  switch (method) {
    case "percent_of_labor":
      amount = laborTotal * rate;
      break;
    case "percent_of_parts":
      amount = partsTotal * rate;
      break;
    case "percent_of_total":
      amount = (laborTotal + partsTotal) * rate;
      break;
    case "flat":
      amount = rate;
      break;
    default:
      amount = 0;
  }
  if (cap !== null && cap > 0 && amount > cap) {
    amount = cap;
  }
  return Math.round(amount * 100) / 100;
}

export function calculateTotals(
  lineItems: LineItemLike[],
  settings?: Pick<
    ShopSettings,
    | "tax_rate"
    | "shop_supplies_enabled"
    | "shop_supplies_method"
    | "shop_supplies_rate"
    | "shop_supplies_cap"
    | "hazmat_enabled"
    | "hazmat_amount"
    | "hazmat_label"
  > | null
): TotalsBreakdown {
  const s = settings ?? DEFAULT_SETTINGS;

  const laborTotal = lineItems
    .filter((li) => li.type === "labor")
    .reduce((sum, li) => sum + (li.total ?? li.quantity * li.unit_cost), 0);

  const partsTotal = lineItems
    .filter((li) => li.type === "part")
    .reduce((sum, li) => sum + (li.total ?? li.quantity * li.unit_cost), 0);

  const shopSuppliesEnabled = s.shop_supplies_enabled;
  const shopSupplies = shopSuppliesEnabled
    ? computeShopSupplies(
        s.shop_supplies_method as ShopSuppliesMethod,
        s.shop_supplies_rate,
        s.shop_supplies_cap,
        laborTotal,
        partsTotal
      )
    : 0;

  const hazmatEnabled = s.hazmat_enabled;
  const hazmat = hazmatEnabled ? s.hazmat_amount : 0;

  // Tax applies to parts + shop supplies (NOT labor, NOT hazmat)
  const taxableAmount = partsTotal + shopSupplies;
  const taxRate = s.tax_rate;
  const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;

  const grandTotal =
    Math.round(
      (laborTotal + partsTotal + shopSupplies + hazmat + taxAmount) * 100
    ) / 100;

  return {
    laborTotal,
    partsTotal,
    shopSupplies,
    shopSuppliesEnabled,
    hazmat,
    hazmatEnabled,
    hazmatLabel: s.hazmat_label,
    taxableAmount,
    taxAmount,
    taxRate,
    grandTotal,
  };
}
