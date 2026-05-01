import Link from "next/link";
import { getShopSettings } from "@/lib/actions/settings";
import { ShopSettingsForm } from "@/components/forms/shop-settings-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Receipt } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Rates & Fees | ShopPilot",
};

export default async function RatesSettingsPage() {
  const settings = await getShopSettings();

  if (!settings) {
    return (
      <PageShell width="tight">
        <div>
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="-ml-3">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Settings
            </Button>
          </Link>
        </div>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Unable to load shop settings. Please run the database migration.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell width="tight">
      <div>
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900 flex-none">
          <Receipt className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Rates & Fees
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Configure tax rate, shop supplies fee, and environmental fee.
          </p>
        </div>
      </div>

      <ShopSettingsForm settings={settings} />
    </PageShell>
  );
}
