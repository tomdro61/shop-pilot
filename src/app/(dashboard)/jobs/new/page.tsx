import Link from "next/link";
import { JobForm } from "@/components/forms/job-form";
import { getPresets } from "@/lib/actions/presets";
import { getQuoteRequest } from "@/lib/actions/quote-requests";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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
    <div className="max-w-6xl mx-auto px-4 lg:px-6 pb-12 space-y-2">
      <div className="py-2">
        <Link href="/jobs">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Jobs
          </Button>
        </Link>
      </div>
      <JobForm
        defaultCustomerId={customerId}
        defaultVehicleId={vehicleId}
        defaultTitle={quoteTitle}
        fromQuoteId={fromQuote}
        presets={presets}
      />
    </div>
  );
}
