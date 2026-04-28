import { QuickPayForm } from "@/components/dashboard/quick-pay-form";
import { getPresets } from "@/lib/actions/presets";
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
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pb-24 space-y-5 lg:space-y-6">
      <div className="py-2">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Quick Pay
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Collect a payment at the counter. A job record will be created automatically.
        </p>
      </div>

      <QuickPayForm presets={presetsWithTotals} />
    </div>
  );
}
