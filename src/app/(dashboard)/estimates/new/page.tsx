import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { EstimateForm } from "@/components/forms/estimate-form";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "New Estimate | ShopPilot",
};

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string }>;
}) {
  const { customerId, vehicleId } = await searchParams;

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
        defaultCustomerId={customerId}
        defaultVehicleId={vehicleId}
        initialCustomer={initialCustomer}
      />
    </PageShell>
  );
}
