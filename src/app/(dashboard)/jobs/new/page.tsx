import Link from "next/link";
import { JobForm } from "@/components/forms/job-form";
import { getPresets } from "@/lib/actions/presets";
import { getQuoteRequest } from "@/lib/actions/quote-requests";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Wrench } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";

export const metadata = {
  title: "New Job | ShopPilot",
};

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string; fromQuote?: string }>;
}) {
  const { customerId, vehicleId, fromQuote } = await searchParams;
  const presets = await getPresets();

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
    <PageShell width="wide">
      <div>
        <Link href="/jobs">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Jobs
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
          <Wrench className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            New Job
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Customer, vehicle, and the work to be done.
          </p>
        </div>
      </div>

      <JobForm
        defaultCustomerId={customerId}
        defaultVehicleId={vehicleId}
        defaultTitle={quoteTitle}
        fromQuoteId={fromQuote}
        presets={presets}
      />
    </PageShell>
  );
}
