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
  | "shop_supplies_categories"
  | "hazmat_categories"
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
  shop_supplies_categories: null,
  hazmat_categories: null,
};

interface LineItemLike {
  type: string;
  quantity: number;
  unit_cost: number;
  total?: number;
  category?: string | null;
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

/**
 * Check whether a fee should apply based on its category scope.
 * If `feeCategories` is null or empty, the fee applies to all jobs.
 * Otherwise, it only applies if the job has at least one line item
 * whose category matches one of the fee's categories.
 */
function feeAppliesToJob(
  feeCategories: string[] | null | undefined,
  lineItems: LineItemLike[]
): boolean {
  if (!feeCategories || feeCategories.length === 0) return true;
  const jobCategories = new Set(
    lineItems
      .map((li) => li.category)
      .filter((c): c is string => c != null)
  );
  return feeCategories.some((fc) => jobCategories.has(fc));
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
    | "shop_supplies_categories"
    | "hazmat_categories"
  > | null
): TotalsBreakdown {
  const s = settings ?? DEFAULT_SETTINGS;

  const laborTotal = lineItems
    .filter((li) => li.type === "labor")
    .reduce((sum, li) => sum + (li.total ?? li.quantity * li.unit_cost), 0);

  const partsTotal = lineItems
    .filter((li) => li.type === "part")
    .reduce((sum, li) => sum + (li.total ?? li.quantity * li.unit_cost), 0);

  const shopSuppliesEnabled =
    s.shop_supplies_enabled &&
    feeAppliesToJob(
      "shop_supplies_categories" in s ? s.shop_supplies_categories : null,
      lineItems
    );
  const shopSupplies = shopSuppliesEnabled
    ? computeShopSupplies(
        s.shop_supplies_method as ShopSuppliesMethod,
        s.shop_supplies_rate,
        s.shop_supplies_cap,
        laborTotal,
        partsTotal
      )
    : 0;

  const hazmatEnabled =
    s.hazmat_enabled &&
    feeAppliesToJob(
      "hazmat_categories" in s ? s.hazmat_categories : null,
      lineItems
    );
  const hazmat = hazmatEnabled ? s.hazmat_amount : 0;

  // Tax applies to parts only (NOT labor, NOT shop supplies, NOT hazmat)
  const taxableAmount = partsTotal;
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
