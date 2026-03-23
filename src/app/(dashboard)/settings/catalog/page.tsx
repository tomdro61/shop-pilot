import { getCatalogItems } from "@/lib/actions/catalog";
import { getShopSettings } from "@/lib/actions/settings";
import { CatalogList } from "@/components/dashboard/catalog-list";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";

export const metadata = {
  title: "Parts & Labor Catalog | ShopPilot",
};

export default async function CatalogPage() {
  const [items, settings] = await Promise.all([
    getCatalogItems(),
    getShopSettings(),
  ]);

  const categories = settings?.job_categories ?? DEFAULT_JOB_CATEGORIES;

  return (
    <div className="p-4 lg:p-10">
      <CatalogList items={items} categories={categories} />
    </div>
  );
}
