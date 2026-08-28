import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { EstimateForm } from "@/components/forms/estimate-form";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/server";
import { getQuoteRequest } from "@/lib/actions/quote-requests";

export const metadata = {
  title: "New Estimate | ShopPilot",
};

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string; fromQuote?: string }>;
}) {
  const { customerId, vehicleId, fromQuote } = await searchParams;

  // Carry the customer's own words across from the quote request. The estimate
  // has no vehicle_id to inherit — quote_requests stores the vehicle as loose
  // columns (year/make/model/plate/VIN), not a vehicles FK — so the notes are
  // the only place that context survives the hand-off.
  let quoteNotes: string | undefined;
  if (fromQuote) {
    const qr = await getQuoteRequest(fromQuote);
    if (!qr) {
      // getQuoteRequest collapses a failed read into null, so this covers both
      // "deleted" and "the query broke". Either way the vehicle and the
      // customer's message are gone and the manager gets a blank notes box —
      // log it rather than let the context vanish silently.
      console.error("[NewEstimatePage] quote request could not be loaded", { fromQuote });
    }
    if (qr) {
      const vehicle = [qr.vehicle_year, qr.vehicle_make, qr.vehicle_model]
        .filter(Boolean)
        .join(" ");
      const plateOrVin = qr.license_plate
        ? `Plate ${qr.license_plate}`
        : qr.vehicle_vin
          ? `VIN ${qr.vehicle_vin}`
          : null;
      quoteNotes = [
        vehicle || null,
        plateOrVin,
        qr.services.length > 0 ? `Requested: ${qr.services.join(", ")}` : null,
        qr.message ? `Customer said: ${qr.message}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  // Pre-load the customer record when arriving from a customer page so the
  // picker renders selected without an extra client-side round-trip.
  let initialCustomer = null;
  let backHref = "/estimates";
  let backLabel = "Estimates";
  if (customerId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .eq("id", customerId)
      .maybeSingle();
    if (error) {
      // Real failure (RLS, network, malformed UUID) — log so the silent
      // dropped-customer-context isn't invisible. The page still renders;
      // the manager just gets an empty picker.
      console.error("[NewEstimatePage] customer pre-load failed:", error);
    }
    if (data) {
      initialCustomer = data;
      backHref = `/customers/${customerId}`;
      backLabel = `${data.first_name} ${data.last_name}`;
    }
  }

  // Arriving from Quote Requests — back belongs there, not on the customer
  // record the quote happens to be linked to.
  if (fromQuote) {
    backHref = "/quote-requests";
    backLabel = "Quote Requests";
  }

  return (
    <PageShell width="wide">
      <div>
        <Link href={backHref}>
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            {backLabel}
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
            New Estimate
          </h1>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Quote a customer without booking the job yet.
          </p>
        </div>
      </div>

      <EstimateForm
        defaultNotes={quoteNotes}
        fromQuoteId={fromQuote}
        defaultCustomerId={customerId}
        defaultVehicleId={vehicleId}
        initialCustomer={initialCustomer}
      />
    </PageShell>
  );
}
