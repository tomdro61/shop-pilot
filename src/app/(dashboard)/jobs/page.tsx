import { Suspense } from "react";
import { getJobs, getLineItemCategories } from "@/lib/actions/jobs";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import { JobsToolbar } from "@/components/dashboard/jobs-toolbar";
import { JobsListView } from "@/components/dashboard/jobs-list-view";
import { JobsBoardView } from "@/components/dashboard/jobs-board-view";
import type { JobStatus, PaymentStatus } from "@/types";

export const metadata = {
  title: "Jobs | ShopPilot",
};

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    search?: string;
    status?: string;
    category?: string;
    payment_status?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view || "list";

  const [jobs, dbCategories] = await Promise.all([
    getJobs({
      search: params.search,
      status: params.status as JobStatus | undefined,
      category: params.category,
      paymentStatus: params.payment_status as PaymentStatus | undefined,
    }),
    getLineItemCategories(),
  ]);

  const allCategories = [
    ...new Set([...DEFAULT_JOB_CATEGORIES, ...dbCategories]),
  ].sort();

  return (
    <div className="p-4 lg:p-6">
      <Suspense>
        <JobsToolbar categories={allCategories} jobCount={jobs.length} />
      </Suspense>

      <div className="mt-4">
        {view === "board" ? (
          <JobsBoardView jobs={jobs} />
        ) : (
          <JobsListView jobs={jobs} />
        )}
      </div>

    </div>
  );
}
