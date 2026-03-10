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
    <div className="p-4 lg:p-6">
      <h1 className="mb-4 text-xl font-semibold">Quote Requests</h1>
      <QuoteRequestList quoteRequests={quoteRequests} />
    </div>
  );
}
