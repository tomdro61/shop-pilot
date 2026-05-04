import Link from "next/link";
import { getCatalogItems } from "@/lib/actions/catalog";
import { getShopSettings } from "@/lib/actions/settings";
import { CatalogList } from "@/components/dashboard/catalog-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { resolveConfiguredCategories } from "@/lib/utils/totals";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Parts & Labor Catalog | ShopPilot",
};

export default async function CatalogPage() {
  const [items, settings] = await Promise.all([
    getCatalogItems(),
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

      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
          <Package className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Parts & Labor Catalog
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Reusable parts and labor entries used to build jobs faster.
          </p>
        </div>
      </div>

      <CatalogList items={items} categories={categories} />
    </PageShell>
  );
}
