import { Suspense } from "react";
import { getInvoices } from "@/lib/actions/invoices";
import { INVOICES_PAGE_SIZE, type InvoiceListFilters } from "@/lib/invoices/list-paging";
import { InvoiceSearch } from "./invoice-search";
import { InvoiceStatusFilter } from "./invoice-status-filter";
import { InvoiceSourceFilter } from "./invoice-source-filter";
import { InvoicesList } from "@/components/dashboard/invoices-list";
import { formatCurrencyWhole } from "@/lib/utils/format";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "Invoices | ShopPilot",
};

function normalizeFilters(raw: {
  status?: string;
  search?: string;
  source?: string;
}): InvoiceListFilters {
  return {
    status:
      raw.status === "draft" || raw.status === "sent" || raw.status === "paid"
        ? raw.status
        : undefined,
    search: raw.search?.trim() ? raw.search.trim().slice(0, 200) : undefined,
    source: raw.source === "jobs" || raw.source === "parking" ? raw.source : undefined,
  };
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; source?: string }>;
}) {
  const filters = normalizeFilters(await searchParams);
  const { invoices, nextCursor, totalCount, totalAmount } = await getInvoices(filters, {
    limit: INVOICES_PAGE_SIZE,
  });

  return (
    <PageShell>
      <div className="flex flex-wrap items-center gap-2">
        <Suspense>
          <InvoiceSearch />
        </Suspense>
        <Suspense>
          <InvoiceSourceFilter />
        </Suspense>
        <Suspense>
          <InvoiceStatusFilter />
        </Suspense>
        <span className="text-xs text-stone-500 dark:text-stone-400 font-mono tabular-nums">
          {totalCount.toLocaleString()} · {formatCurrencyWhole(totalAmount)}
        </span>
      </div>

      <InvoicesList
        key={JSON.stringify(filters)}
        initialInvoices={invoices}
        nextCursor={nextCursor}
        totalCount={totalCount}
        filters={filters}
      />
    </PageShell>
  );
}
