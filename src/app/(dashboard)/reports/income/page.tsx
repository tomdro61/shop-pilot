import { getManualIncomeEntries, getManualIncomeCategories } from "@/lib/actions/manual-income";
import { ManualIncomePage } from "@/components/dashboard/manual-income-page";

export const metadata = {
  title: "Manual Income | ShopPilot",
};

export default async function IncomePage() {
  const [entries, categories] = await Promise.all([
    getManualIncomeEntries(),
    getManualIncomeCategories(),
  ]);

  return <ManualIncomePage entries={entries} existingCategories={categories} />;
}
