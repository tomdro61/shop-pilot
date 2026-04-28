import Link from "next/link";
import { getShopSettings } from "@/lib/actions/settings";
import { ShopSettingsForm } from "@/components/forms/shop-settings-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Rates & Fees | ShopPilot",
};

export default async function RatesSettingsPage() {
  const settings = await getShopSettings();

  if (!settings) {
    return (
      <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
        <div className="py-2">
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Settings
          </Button>
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Rates & Fees
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Configure tax rate, shop supplies fee, and environmental fee
        </p>
      </div>

      <ShopSettingsForm settings={settings} />
    </div>
  );
}
