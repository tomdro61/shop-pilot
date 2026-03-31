import Link from "next/link";
import { getPresets } from "@/lib/actions/presets";
import { getShopSettings } from "@/lib/actions/settings";
import { PresetList } from "@/components/dashboard/preset-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";

export const metadata = {
  title: "Job Presets | ShopPilot",
};

export default async function PresetsPage() {
  const [presets, settings] = await Promise.all([
    getPresets(),
    getShopSettings(),
  ]);

  const categories = (settings?.job_categories as string[] | undefined) ?? DEFAULT_JOB_CATEGORIES;

  return (
    <div className="p-4 lg:p-10">
      <div className="mb-4">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Button>
        </Link>
      </div>
      <PresetList presets={presets} categories={categories} />
    </div>
  );
}
