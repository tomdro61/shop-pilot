import { getPresets } from "@/lib/actions/presets";
import { PresetList } from "@/components/dashboard/preset-list";

export const metadata = {
  title: "Job Presets | ShopPilot",
};

export default async function PresetsPage() {
  const presets = await getPresets();

  return (
    <div className="p-4 lg:p-6">
      <PresetList presets={presets} />
    </div>
  );
}
