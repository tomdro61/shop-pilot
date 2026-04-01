import { notFound, redirect } from "next/navigation";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { getJob } from "@/lib/actions/jobs";
import { getDviPhotoSignedUrls } from "@/lib/supabase/storage";
import { formatVehicle } from "@/lib/utils/format";
import { InspectionForm } from "@/components/dvi/inspection-form";
import type { Vehicle, DviCondition } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return { title: "Inspection | ShopPilot" };
  const vehicle = job.vehicles as Vehicle | null;
  return {
    title: `Inspect ${vehicle ? formatVehicle(vehicle) : "Vehicle"} | ShopPilot`,
  };
}

export default async function DviInspectPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const [inspection, job] = await Promise.all([
    getInspectionForJob(jobId),
    getJob(jobId),
  ]);

  if (!job) notFound();
  if (!inspection) redirect(`/dvi/${jobId}`);

  const vehicle = job.vehicles as Vehicle | null;
  const vehicleDesc = vehicle ? formatVehicle(vehicle) : "Vehicle";
  const customer = job.customers as { first_name: string; last_name: string } | null;
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
    dvi_photos: { id: string; storage_path: string }[];
  }[]).sort((a, b) => a.sort_order - b.sort_order);

  for (const r of results) {
    for (const p of r.dvi_photos ?? []) {
      allPhotoPaths.push(p.storage_path);
    }
  }

  // Generate all signed URLs in one batch call
  const photoUrls = await getDviPhotoSignedUrls(allPhotoPaths);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <InspectionForm
        inspectionId={inspection.id}
        jobId={jobId}
        results={results}
        photoUrls={photoUrls}
        customerName={customerName}
        vehicleDesc={vehicleDesc}
        isCompleted={inspection.status === "completed" || inspection.status === "sent"}
      />
    </div>
  );
}
