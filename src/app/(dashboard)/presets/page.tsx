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
    <div className="max-w-4xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        </Link>
      </div>
      <PresetList presets={presets} categories={categories} />
    </div>
  );
}
