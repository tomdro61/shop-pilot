import { Suspense } from "react";
import { getJobs, getLineItemCategories } from "@/lib/actions/jobs";
import { getShopSettings } from "@/lib/actions/settings";
import { DEFAULT_JOB_CATEGORIES } from "@/lib/constants";
import { resolveDateRange } from "@/lib/utils/date-range";
import { JobsToolbar } from "@/components/dashboard/jobs-toolbar";
import { JobsListView } from "@/components/dashboard/jobs-list-view";
import { JobsBoardView } from "@/components/dashboard/jobs-board-view";
import { JobsCalendarView } from "@/components/dashboard/jobs-calendar-view";
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
    range?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view || "list";

  // Only apply date filter when a range param is explicitly set
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (params.range) {
    const resolved = resolveDateRange(params.range, params.from, params.to);
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  const [jobs, dbCategories, settings] = await Promise.all([
    getJobs({
      search: params.search,
      status: params.status as JobStatus | undefined,
      category: params.category,
      paymentStatus: params.payment_status as PaymentStatus | undefined,
      dateFrom,
      dateTo,
    }),
    getLineItemCategories(),
    getShopSettings(),
  ]);

  const configuredCategories = settings?.job_categories ?? DEFAULT_JOB_CATEGORIES;
  const allCategories = [
    ...new Set([...configuredCategories, ...dbCategories]),
  ].sort();

  return (
    <div className="p-4 lg:p-6">
      <Suspense>
        <JobsToolbar categories={allCategories} jobCount={jobs.length} />
      </Suspense>

      <div className="mt-4">
        {view === "board" ? (
          <JobsBoardView jobs={jobs} />
        ) : view === "calendar" ? (
          <JobsCalendarView jobs={jobs} />
        ) : (
          <JobsListView jobs={jobs} />
        )}
      </div>

    </div>
  );
}
