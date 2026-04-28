import { getQuoteRequests } from "@/lib/actions/quote-requests";
import { QuoteRequestList } from "@/components/quote-requests/quote-request-list";
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

  const quoteRequests = await getQuoteRequests({
    status: status as QuoteRequestStatus | undefined,
    search,
  });

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <h1 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Quote Requests
        </h1>
        <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">
          Manage incoming service inquiries and convert them to shop jobs.
        </p>
      </div>
      <QuoteRequestList quoteRequests={quoteRequests} />
    </div>
  );
}
