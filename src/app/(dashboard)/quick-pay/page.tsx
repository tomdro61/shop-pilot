import { QuickPayForm } from "@/components/dashboard/quick-pay-form";
import { getPresets } from "@/lib/actions/presets";
import { PageShell } from "@/components/layout/page-shell";
import { CircleDollarSign } from "lucide-react";
import type { PresetLineItem } from "@/types";

export const metadata = {
  title: "Quick Pay | ShopPilot",
};

export default async function QuickPayPage() {
  const presets = await getPresets();

  const presetsWithTotals = presets.map((p) => {
    const lineItems = p.line_items as PresetLineItem[];
    const total = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_cost, 0);
    return { id: p.id, name: p.name, category: p.category, total };
  });

  return (
    <PageShell width="narrow" className="pb-24">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900 flex-none">
          <CircleDollarSign className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Quick Pay
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Collect a payment at the counter. A job record will be created automatically.
          </p>
        </div>
      </div>

      <QuickPayForm presets={presetsWithTotals} />
    </PageShell>
  );
}
