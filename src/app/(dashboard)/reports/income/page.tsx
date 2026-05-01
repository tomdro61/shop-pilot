import { getManualIncomeEntries, getManualIncomeCategories } from "@/lib/actions/manual-income";
import { ManualIncomePage } from "@/components/dashboard/manual-income-page";
import { ReportsNav } from "@/components/dashboard/reports-nav";
import { Banknote } from "lucide-react";

export const metadata = {
  title: "Manual Income | ShopPilot",
};

export default async function IncomePage() {
  const [entries, categories] = await Promise.all([
    getManualIncomeEntries(),
    getManualIncomeCategories(),
  ]);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 flex-none">
          <Banknote className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Income
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Income and cash-flow over time.
          </p>
        </div>
      </div>
      <ReportsNav />
      <ManualIncomePage entries={entries} existingCategories={categories} />
    </>
  );
}
