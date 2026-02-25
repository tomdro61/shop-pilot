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
      <div className="mx-auto max-w-2xl p-4 lg:p-6">
        <p className="text-sm text-muted-foreground">
          Unable to load shop settings. Please run the database migration.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Button>
        </Link>
        <h2 className="text-xl font-semibold">Rates & Fees</h2>
        <p className="text-sm text-muted-foreground">
          Configure tax rate, shop supplies fee, and environmental fee
        </p>
      </div>

      <ShopSettingsForm settings={settings} />
    </div>
  );
}
