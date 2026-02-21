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
    <div className="mx-auto max-w-4xl p-4 pb-20 lg:p-6 lg:pb-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight lg:text-2xl">Quick Pay</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Collect a payment at the counter. A job record will be created automatically.
        </p>
      </div>
      <QuickPayForm presets={presetsWithTotals} />
    </div>
  );
}
