import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrls } from "@/lib/supabase/storage";
import { formatVehicle, formatRONumber, formatDate } from "@/lib/utils/format";
import { InspectionSummary } from "@/components/dvi/inspection-summary";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Vehicle, DviCondition } from "@/types";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) return { title: "DVI Report | ShopPilot" };
  const vehicle = job.vehicles as Vehicle | null;
  return {
    title: `DVI — ${vehicle ? formatVehicle(vehicle) : "Vehicle"} | ShopPilot`,
  };
}

export default async function DviReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [job, inspection] = await Promise.all([
    getJob(id),
    getInspectionForJob(id),
  ]);

  if (!job) notFound();
  if (!inspection) redirect(`/jobs/${id}`);

  const vehicle = job.vehicles as Vehicle | null;

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

  const photoUrls = await getDviPhotoSignedUrls(allPhotoPaths);

  // Map results to summary format
  const results = rawResults
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      ...r,
      photos: (r.dvi_photos ?? []).map((p) => ({
        id: p.id,
        signedUrl: photoUrls[p.storage_path],
      })),
    }));

  return (
    <div className="p-4 lg:p-10 max-w-3xl mx-auto">
      <Link href={`/jobs/${id}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Job
        </Button>
      </Link>

      <div className="mb-6">
        <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
          Vehicle Inspection Report
        </span>
        <h2 className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
          {vehicle ? formatVehicle(vehicle) : "Vehicle"}
        </h2>
        <div className="flex gap-4 text-xs text-muted-foreground mt-1">
          {job.ro_number && <span>{formatRONumber(job.ro_number)}</span>}
          <span>{formatDate(inspection.created_at)}</span>
        </div>
      </div>

      <InspectionSummary
        results={results}
        showRecommendations={inspection.send_mode === "recommendations"}
      />
    </div>
  );
}
