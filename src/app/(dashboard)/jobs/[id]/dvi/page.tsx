import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { getDviPhotoSignedUrls } from "@/lib/supabase/storage";
import { formatVehicle, formatRONumber, formatDate, formatCustomerName } from "@/lib/utils/format";
import { InspectionSummary } from "@/components/dvi/inspection-summary";
import { CustomerLink } from "@/components/ui/customer-link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Vehicle, Customer, DviCondition } from "@/types";

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
  const customer = job.customers as Customer | null;

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
    <div className="max-w-3xl mx-auto px-4 lg:px-6 pb-12 space-y-5 lg:space-y-6">
      <div className="py-2">
        <Link href={`/jobs/${id}`}>
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            Job
          </Button>
        </Link>
      </div>

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
          Vehicle Inspection Report
        </div>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
          {vehicle ? formatVehicle(vehicle) : "Vehicle"}
        </h1>
        {customer && (
          <div className="mt-1 text-sm text-stone-700 dark:text-stone-300">
            <CustomerLink customerId={customer.id}>
              {formatCustomerName(customer)}
            </CustomerLink>
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
          {job.ro_number && (
            <span className="font-mono tabular-nums">{formatRONumber(job.ro_number)}</span>
          )}
          <span className="font-mono tabular-nums">{formatDate(inspection.created_at)}</span>
        </div>
      </div>

      <InspectionSummary
        results={results}
        showRecommendations={inspection.send_mode === "recommendations"}
      />
    </div>
  );
}
