import { getPresets } from "@/lib/actions/presets";
import { getShopSettings } from "@/lib/actions/settings";
import { PresetList } from "@/components/dashboard/preset-list";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";

export const metadata = {
  title: "Job Presets | ShopPilot",
};

export default async function PresetsPage() {
  const [presets, settings] = await Promise.all([
    getPresets(),
    getShopSettings(),
  ]);

  const categories = settings?.job_categories ?? DEFAULT_JOB_CATEGORIES;

  return (
    <div className="p-4 lg:p-6">
      <PresetList presets={presets} categories={categories} />
    </div>
  );
}
