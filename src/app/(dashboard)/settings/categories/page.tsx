import Link from "next/link";
import { getShopSettings } from "@/lib/actions/settings";
import { JobCategoriesForm } from "@/components/forms/job-categories-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";

export const metadata = {
  title: "Job Categories | ShopPilot",
};

export default async function CategoriesSettingsPage() {
  const settings = await getShopSettings();

  const categories = settings?.job_categories ?? DEFAULT_JOB_CATEGORIES;

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <div className="mb-6">
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Button>
        </Link>
        <h2 className="text-xl font-semibold">Job Categories</h2>
        <p className="text-sm text-muted-foreground">
          Add, remove, rename, and reorder the categories used for line items and services
        </p>
      </div>

      <JobCategoriesForm categories={categories} />
    </div>
  );
}
