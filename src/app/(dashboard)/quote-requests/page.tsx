import { getQuoteRequests } from "@/lib/actions/quote-requests";
import { createClient } from "@/lib/supabase/server";
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

  // booking-photos is a private bucket; sign the stored paths for display. One
  // batch call for the whole page → a path→URL map the cards read from.
  const allPaths = quoteRequests.flatMap((qr) => qr.photo_paths ?? []);
  const photoUrls: Record<string, string> = {};
  if (allPaths.length > 0) {
    const supabase = await createClient();
    const { data, error } = await supabase.storage
      .from("booking-photos")
      .createSignedUrls(allPaths, 60 * 60);
    // Don't fail the page, but never swallow a signing failure: a broken/renamed
    // bucket or denied policy would otherwise render zero thumbnails with no
    // signal. Log loudly (greppable); the card shows a placeholder for any path
    // that didn't resolve so the manager knows a photo exists but didn't load.
    if (error) {
      console.error("[quote-requests][signed-url-error] bucket=booking-photos:", error.message);
    }
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) {
        photoUrls[item.path] = item.signedUrl;
      } else if (item.error) {
        console.error("[quote-requests][signed-url-item] failed to sign a photo:", item.error);
      }
    }
  }

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
      <QuoteRequestList quoteRequests={quoteRequests} photoUrls={photoUrls} />
    </PageShell>
  );
}
