import Link from "next/link";
import { getPresets } from "@/lib/actions/presets";
import { getShopSettings } from "@/lib/actions/settings";
import { PresetList } from "@/components/dashboard/preset-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { resolveConfiguredCategories } from "@/lib/utils/totals";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Job Presets | ShopPilot",
};

export default async function PresetsPage() {
  const [presets, settings] = await Promise.all([
    getPresets(),
    getShopSettings(),
  ]);

  const categories = resolveConfiguredCategories(settings);

  return (
    <PageShell width="narrow">
      <div>
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        </Link>
      </div>
      <PresetList presets={presets} categories={categories} />
    </PageShell>
  );
}
