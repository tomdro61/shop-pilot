import { notFound } from "next/navigation";
import { getInspectionById } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrls } from "@/lib/supabase/storage";
import { formatVehicle } from "@/lib/utils/format";
import { InspectionForm } from "@/components/dvi/inspection-form";
import { SendDviSection } from "@/components/dvi/send-dvi-section";
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

  const isCompleted = inspection.status === "completed" || inspection.status === "sent";

  return (
    <div className="mx-auto max-w-2xl p-4">
      <InspectionForm
        inspectionId={inspection.id}
        backUrl={isCompleted ? "/dvi" : `/dvi/inspect/${inspection.id}`}
        results={results}
        photoUrls={photoUrls}
        customerName={customerName}
        vehicleDesc={vehicleDesc}
        isCompleted={isCompleted}
      />

      {/* Send to Customer controls for completed standalone inspections */}
      {inspection.status === "completed" && (
        <div className="mt-6">
          <SendDviSection inspectionId={inspection.id} results={results} />
        </div>
      )}
    </div>
  );
}
