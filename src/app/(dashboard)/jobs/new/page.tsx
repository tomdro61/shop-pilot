import { JobForm } from "@/components/forms/job-form";
import { getPresets } from "@/lib/actions/presets";
import { getQuoteRequest } from "@/lib/actions/quote-requests";

export const metadata = {
  title: "New Job | ShopPilot",
};

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; fromQuote?: string }>;
}) {
  const { customerId, fromQuote } = await searchParams;
  const presets = await getPresets();

  // If converting from a quote request, pre-fill the job title
  let quoteTitle: string | undefined;
  if (fromQuote) {
    const qr = await getQuoteRequest(fromQuote);
    if (qr) {
      const vehicle = [qr.vehicle_year, qr.vehicle_make, qr.vehicle_model].filter(Boolean).join(" ");
      const parts = [vehicle, qr.services.join(", ")].filter(Boolean);
      quoteTitle = parts.join(" — ");
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-6">
      <h2 className="mb-6 text-xl font-semibold">New Job</h2>
      <JobForm
        defaultCustomerId={customerId}
        defaultTitle={quoteTitle}
        fromQuoteId={fromQuote}
        presets={presets}
      />
    </div>
  );
}
