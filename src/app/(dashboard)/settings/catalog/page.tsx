import Link from "next/link";
import { getCatalogItems } from "@/lib/actions/catalog";
import { getShopSettings } from "@/lib/actions/settings";
import { CatalogList } from "@/components/dashboard/catalog-list";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Parts & Labor Catalog | ShopPilot",
};

export default async function CatalogPage() {
  const [items, settings] = await Promise.all([
    getCatalogItems(),
    getShopSettings(),
  ]);

  const categories = (settings?.job_categories as string[] | undefined) ?? DEFAULT_JOB_CATEGORIES;

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

      <CatalogList items={items} categories={categories} />
    </PageShell>
  );
}
