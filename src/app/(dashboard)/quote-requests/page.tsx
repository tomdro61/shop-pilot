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
    <div className="p-4 lg:p-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">Quote Requests</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Manage incoming service inquiries and convert them to shop jobs.</p>
      </div>
      <QuoteRequestList quoteRequests={quoteRequests} />
    </div>
  );
}
