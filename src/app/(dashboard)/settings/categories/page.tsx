import Link from "next/link";
import { getShopSettings } from "@/lib/actions/settings";
import { JobCategoriesForm } from "@/components/forms/job-categories-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Job Categories | ShopPilot",
};

export default async function CategoriesSettingsPage() {
  const settings = await getShopSettings();

  const categories = (settings?.job_categories as string[] | undefined) ?? DEFAULT_JOB_CATEGORIES;

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

      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Job Categories
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Add, remove, rename, and reorder the categories used for line items and services
        </p>
      </div>

      <JobCategoriesForm categories={categories} />
    </PageShell>
  );
}
