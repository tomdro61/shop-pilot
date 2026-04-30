import { getInspectionByToken } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrlsPublic } from "@/lib/supabase/storage";
import { formatDate } from "@/lib/utils/format";
import { InspectionSummary } from "@/components/dvi/inspection-summary";
import { RecommendationApproval } from "@/components/dvi/recommendation-approval";
import { AlertCircle, CheckCircle2, MessageSquare, Phone } from "lucide-react";
import type { DviCondition } from "@/types";

export const metadata = {
  title: "Vehicle Inspection Report — Broadway Motors",
};

export default async function CustomerDviPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inspection = await getInspectionByToken(token);

  if (!inspection) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-full grid place-items-center bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
          Report Not Found
        </h2>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          This inspection report link may have expired or is invalid.
        </p>
      </div>
    );
  }

  const job = inspection.jobs as {
    id: string;
    status: string;
    payment_status: string;
    ro_number: number | null;
    customer_id: string;
    customers: {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    } | null;
    vehicles: {
      year: number | null;
      make: string | null;
      model: string | null;
      color: string | null;
      vin: string | null;
    } | null;
  } | null;

  // Use direct vehicle/customer, fall back to job's nested data
  const directCustomer = (inspection as Record<string, unknown>).customers as {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  const directVehicle = (inspection as Record<string, unknown>).vehicles as {
    year: number | null;
    make: string | null;
    model: string | null;
    color: string | null;
    vin: string | null;
  } | null;
  const customer = directCustomer ?? job?.customers;
  const vehicle = directVehicle ?? job?.vehicles;
  const vehicleDesc = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
  const isJobClosed = job?.status === "complete" || job?.payment_status === "paid";
  const isRecommendations = inspection.send_mode === "recommendations";

  // Collect photo paths and generate signed URLs
  const allPhotoPaths: string[] = [];
  const rawResults = (inspection.dvi_results ?? []) as {
    id: string;
    category_name: string;
    item_name: string;
    condition: DviCondition | null;
    note: string | null;
    sort_order: number;
    is_recommended: boolean;
    recommended_description: string | null;
    recommended_price: number | null;
    dvi_photos: { id: string; storage_path: string }[];
  }[];

  for (const r of rawResults) {
    for (const p of r.dvi_photos ?? []) {
      allPhotoPaths.push(p.storage_path);
    }
  }

  const photoUrls = await getDviPhotoSignedUrlsPublic(allPhotoPaths);

  const results = rawResults
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      ...r,
      photos: (r.dvi_photos ?? []).map((p) => ({
        id: p.id,
        signedUrl: photoUrls[p.storage_path],
      })),
    }));

  // Filter to recommended items only for the approval flow
  const recommendedResults = results.filter((r) => r.is_recommended);

  return (
    <div className="space-y-6">
      {/* Vehicle + date header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          {vehicleDesc || "Vehicle Inspection"}
        </h2>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
          {vehicle?.color && <span className="capitalize">{vehicle.color}</span>}
          {vehicle?.vin && <span className="font-mono tabular-nums">VIN: {vehicle.vin}</span>}
          <span className="font-mono tabular-nums">{formatDate(inspection.created_at)}</span>
        </div>
        {customer && (
          <p className="mt-1.5 text-sm text-stone-600 dark:text-stone-300">
            Prepared for {customer.first_name} {customer.last_name}
          </p>
        )}
      </div>

      {/* Manager note — alert-card style */}
      {inspection.customer_note && (
        <div className="relative rounded-md border bg-blue-50/60 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900 p-4 shadow-card">
          <span
            aria-hidden
            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-blue-500"
          />
          <div className="flex items-center gap-2 mb-2 pl-1">
            <span className="w-7 h-7 rounded-md grid place-items-center border bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900 flex-none">
              <MessageSquare className="h-3.5 w-3.5" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-900 dark:text-blue-200">
              Note from Broadway Motors
            </p>
          </div>
          <p className="pl-1 text-sm text-stone-800 dark:text-stone-100 whitespace-pre-line">
            {inspection.customer_note}
          </p>
        </div>
      )}

      {/* Inspection report */}
      <InspectionSummary results={results} showRecommendations={isRecommendations} />

      {/* Recommendation approval or stale state */}
      {isRecommendations && recommendedResults.length > 0 && (
        <div>
          {isJobClosed ? (
            <div className="relative rounded-md border bg-stone-50 border-stone-200 dark:bg-stone-900 dark:border-stone-800 p-5 shadow-card text-center">
              <span
                aria-hidden
                className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-stone-400 dark:bg-stone-600"
              />
              <div className="mx-auto w-10 h-10 rounded-full grid place-items-center bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-semibold text-stone-900 dark:text-stone-50">
                This vehicle has already been serviced.
              </p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                Contact us at{" "}
                <a
                  href="tel:6179968371"
                  className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  (617) 996-8371
                </a>{" "}
                to schedule this work.
              </p>
            </div>
          ) : (
            <RecommendationApproval token={token} recommendedResults={recommendedResults} />
          )}
        </div>
      )}

      {/* Footer */}
      <div className="pt-6 border-t border-stone-200 dark:border-stone-800 text-center">
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Questions about this report?
        </p>
        <a
          href="tel:6179968371"
          className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
        >
          <Phone className="h-3.5 w-3.5" />
          (617) 996-8371
        </a>
      </div>
    </div>
  );
}
