import { notFound } from "next/navigation";
import { getInspectionById } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrls } from "@/lib/supabase/storage";
import { formatVehicle } from "@/lib/utils/format";
import { InspectionForm } from "@/components/dvi/inspection-form";
import { SendDviSection } from "@/components/dvi/send-dvi-section";
import { DeleteDviButton } from "@/components/dvi/delete-dvi-button";
import type { DviCondition, Vehicle } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ inspectionId: string }> }) {
  const { inspectionId } = await params;
  const inspection = await getInspectionById(inspectionId);
  if (!inspection) return { title: "Inspection | ShopPilot" };
  const vehicle = inspection.vehicles as Vehicle | null;
  return { title: `Inspect ${vehicle ? formatVehicle(vehicle) : "Vehicle"} | ShopPilot` };
}

export default async function StandaloneInspectPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  const inspection = await getInspectionById(inspectionId);

  if (!inspection) notFound();

  const vehicle = inspection.vehicles as Vehicle | null;
  const vehicleDesc = vehicle ? formatVehicle(vehicle) : "Vehicle";
  const customer = inspection.customers as { first_name: string; last_name: string } | null;
  const customerName = customer ? `${customer.first_name} ${customer.last_name}` : null;

  // Collect all photo storage paths for batch signed URL generation
  const allPhotoPaths: string[] = [];
  const results = ((inspection.dvi_results ?? []) as {
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
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  for (const r of results) {
    for (const p of r.dvi_photos ?? []) {
      allPhotoPaths.push(p.storage_path);
    }
  }

  const photoUrls = await getDviPhotoSignedUrls(allPhotoPaths);

  const isCompleted = inspection.status === "completed" || inspection.status === "sent" || inspection.status === "approved";

  return (
    <div className="mx-auto max-w-2xl p-4">
      {/* Send to Customer (only after inspection is completed) */}
      {inspection.status === "completed" && (
        <div className="mb-6">
          <SendDviSection inspectionId={inspection.id} results={results} />
        </div>
      )}

      {/* Delete control — always available. The button has its own
          confirm-dialog so destructive intent is gated there. Showing it
          in any status lets the manager clean up orphan/test inspections
          (e.g. an in_progress DVI whose underlying job was deleted). */}
      <div className="mb-6 bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card p-4 flex items-center justify-between">
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Delete this inspection and all its data
        </p>
        <DeleteDviButton inspectionId={inspection.id} />
      </div>

      <InspectionForm
        inspectionId={inspection.id}
        backUrl="/dvi"
        results={results}
        photoUrls={photoUrls}
        customerName={customerName}
        vehicleDesc={vehicleDesc}
        isCompleted={isCompleted}
      />
    </div>
  );
}
