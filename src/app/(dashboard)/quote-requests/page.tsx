import { getQuoteRequests } from "@/lib/actions/quote-requests";
import { QuoteRequestList } from "@/components/quote-requests/quote-request-list";
import { PageShell } from "@/components/layout/page-shell";
import { MessageSquareQuote } from "lucide-react";
import type { QuoteRequestStatus } from "@/types";

export const metadata = {
  title: "Quote Requests | ShopPilot",
};

export default async function QuoteRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { status, search } = await searchParams;

  // Default to "new" when no status is specified; "all" disables the filter.
  const effectiveStatus =
    status === "all"
      ? undefined
      : ((status || "new") as QuoteRequestStatus);

  const quoteRequests = await getQuoteRequests({
    status: effectiveStatus,
    search,
  });

  return (
    <PageShell width="wide">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900 flex-none">
          <MessageSquareQuote className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            Quote Requests
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Incoming service inquiries — convert to jobs.
          </p>
        </div>
      </div>
      <QuoteRequestList quoteRequests={quoteRequests} />
    </PageShell>
  );
}
