import Link from "next/link";
import { getShopSettings } from "@/lib/actions/settings";
import { JobCategoriesForm } from "@/components/forms/job-categories-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Tag } from "lucide-react";
import { resolveConfiguredCategories } from "@/lib/utils/totals";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Job Categories | ShopPilot",
};

export default async function CategoriesSettingsPage() {
  const settings = await getShopSettings();

  const categories = resolveConfiguredCategories(settings);

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
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
          <Tag className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Job Categories
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Add, remove, rename, and reorder the categories used for line items and services.
          </p>
        </div>
      </div>

      <JobCategoriesForm categories={categories} />
    </PageShell>
  );
}
