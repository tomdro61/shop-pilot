import { getInspectionByToken } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrlsPublic } from "@/lib/supabase/storage";
import { formatDate } from "@/lib/utils/format";
import { InspectionSummary } from "@/components/dvi/inspection-summary";
import { RecommendationApproval } from "@/components/dvi/recommendation-approval";
import { AlertCircle, CheckCircle, Phone } from "lucide-react";
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
        <AlertCircle className="mb-3 h-12 w-12 text-stone-300" />
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-50">
          Report Not Found
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
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
    customers: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
    vehicles: { year: number | null; make: string | null; model: string | null; color: string | null; vin: string | null } | null;
  } | null;

  // Use direct vehicle/customer, fall back to job's nested data
  const directCustomer = (inspection as Record<string, unknown>).customers as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
  const directVehicle = (inspection as Record<string, unknown>).vehicles as { year: number | null; make: string | null; model: string | null; color: string | null; vin: string | null } | null;
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
    <div>
      {/* Vehicle + date header */}
      <div className="mb-6">
        <h2 className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          {vehicleDesc || "Vehicle Inspection"}
        </h2>
        <div className="flex gap-4 text-xs text-muted-foreground mt-1">
          {vehicle?.color && <span>{vehicle.color}</span>}
          {vehicle?.vin && <span>VIN: {vehicle.vin}</span>}
          <span>{formatDate(inspection.created_at)}</span>
        </div>
        {customer && (
          <p className="text-sm text-muted-foreground mt-1">
            Prepared for {customer.first_name} {customer.last_name}
          </p>
        )}
      </div>

      {/* Manager note */}
      {inspection.customer_note && (
        <div className="mb-6 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
          <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
            Note from Broadway Motors
          </p>
          <p className="text-sm text-blue-800 dark:text-blue-200 whitespace-pre-line">
            {inspection.customer_note}
          </p>
        </div>
      )}

      {/* Inspection report */}
      <InspectionSummary
        results={results}
        showRecommendations={isRecommendations}
      />

      {/* Recommendation approval or stale state */}
      {isRecommendations && recommendedResults.length > 0 && (
        <div className="mt-8">
          {isJobClosed ? (
            <div className="rounded-lg bg-stone-50 dark:bg-stone-800/50 p-5 border-l-4 border-stone-400 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-stone-400" />
              <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">
                This vehicle has already been serviced.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Contact us at{" "}
                <a href="tel:6179968371" className="text-blue-600 dark:text-blue-400 font-medium">
                  (617) 996-8371
                </a>{" "}
                to schedule this work.
              </p>
            </div>
          ) : (
            <RecommendationApproval
              token={token}
              recommendedResults={recommendedResults}
            />
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-stone-200 dark:border-stone-800 text-center">
        <p className="text-xs text-muted-foreground">
          Questions about this report?
        </p>
        <a
          href="tel:6179968371"
          className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-blue-600 dark:text-blue-400"
        >
          <Phone className="h-3.5 w-3.5" />
          (617) 996-8371
        </a>
      </div>
    </div>
  );
}
