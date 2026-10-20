import { Suspense, type ReactNode } from "react";
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";
import { getJobs, getLineItemCategories, loadCalendarJobs } from "@/lib/actions/jobs";
import { getShopSettings } from "@/lib/actions/settings";
import { resolveConfiguredCategories } from "@/lib/utils/totals";
import { resolveDateRange } from "@/lib/utils/date-range";
import { nowET } from "@/lib/utils";
import { JOB_STATUS_ORDER } from "@/lib/constants";
import {
  BOARD_COMPLETE_PAGE_SIZE,
  BOARD_OPEN_PAGE_SIZE,
  LIST_PAGE_SIZE,
  jobFiltersSchema,
  normalizeJobFilters,
  type JobFilters,
} from "@/lib/jobs/paging";
import { JobsToolbar } from "@/components/dashboard/jobs-toolbar";
import { JobsListView } from "@/components/dashboard/jobs-list-view";
import { JobsBoardView, type BoardColumnData } from "@/components/dashboard/jobs-board-view";
import { JobsCalendarView } from "@/components/dashboard/jobs-calendar-view";
import { PageShell } from "@/components/layout/page-shell";
import type { JobStatus } from "@/types";

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
  const view = params.view || "board";

  // Only apply date filter when a range param is explicitly set
  let dateFrom: string | undefined;
  let dateTo: string | undefined;
  if (params.range) {
    // A malformed custom bound would throw inside resolveDateRange; drop it.
    const isoDate = jobFiltersSchema.shape.dateFrom;
    const resolved = resolveDateRange(
      params.range,
      isoDate.safeParse(params.from).data,
      isoDate.safeParse(params.to).data
    );
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  const filters = normalizeJobFilters({
    search: params.search,
    status: params.status,
    category: params.category,
    paymentStatus: params.payment_status,
    dateFrom,
    dateTo,
  });
  const filtersKey = JSON.stringify(filters);

  const [dbCategories, settings, content] = await Promise.all([
    getLineItemCategories(),
    getShopSettings(),
    loadView(view, filters, filtersKey),
  ]);

  const configuredCategories = resolveConfiguredCategories(settings);
  const allCategories = [
    ...new Set([...configuredCategories, ...dbCategories]),
  ].sort();

  return (
    <PageShell>
      <Suspense>
        <JobsToolbar categories={allCategories} jobCount={content.count} />
      </Suspense>
      {content.node}
    </PageShell>
  );
}

function boardPageSize(status: JobStatus): number {
  return status === "complete" ? BOARD_COMPLETE_PAGE_SIZE : BOARD_OPEN_PAGE_SIZE;
}

async function loadView(
  view: string,
  filters: JobFilters,
  filtersKey: string
): Promise<{ node: ReactNode; count: number }> {
  if (view === "board") {
    const statuses: JobStatus[] = filters.status ? [filters.status] : JOB_STATUS_ORDER;
    const results = await Promise.all(
      statuses.map((status) =>
        getJobs({ ...filters, status }, { limit: boardPageSize(status) })
      )
    );
    const columns: BoardColumnData[] = JOB_STATUS_ORDER.map((status) => {
      const index = statuses.indexOf(status);
      const result = index >= 0 ? results[index] : null;
      return {
        status,
        jobs: result?.jobs ?? [],
        nextCursor: result?.nextCursor ?? null,
        totalCount: result?.totalCount ?? 0,
        pageSize: boardPageSize(status),
      };
    });
    return {
      count: columns.reduce((sum, column) => sum + column.totalCount, 0),
      node: <JobsBoardView key={filtersKey} columns={columns} filters={filters} />,
    };
  }

  if (view === "calendar") {
    const now = nowET();
    const range = {
      from: format(startOfWeek(startOfMonth(now)), "yyyy-MM-dd"),
      to: format(endOfWeek(endOfMonth(now)), "yyyy-MM-dd"),
    };
    const { jobs, truncated } = await loadCalendarJobs({ filters, range });
    return {
      count: jobs.length,
      node: (
        <JobsCalendarView
          key={filtersKey}
          initialJobs={jobs}
          initialRange={range}
          truncated={truncated}
          filters={filters}
        />
      ),
    };
  }

  const { jobs, nextCursor, totalCount } = await getJobs(filters, { limit: LIST_PAGE_SIZE });
  return {
    count: totalCount,
    node: (
      <JobsListView
        key={filtersKey}
        initialJobs={jobs}
        nextCursor={nextCursor}
        totalCount={totalCount}
        filters={filters}
        pageSize={LIST_PAGE_SIZE}
      />
    ),
  };
}
