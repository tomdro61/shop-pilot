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
    <div className="mx-auto max-w-2xl p-4 lg:p-10">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h2 className="text-2xl lg:text-3xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">New Job</h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Configure repair order and assignment details.</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 px-3 py-1 rounded-full">
          Draft Job
        </span>
      </div>
      <JobForm
        defaultCustomerId={customerId}
        defaultTitle={quoteTitle}
        fromQuoteId={fromQuote}
        presets={presets}
      />
    </div>
  );
}
