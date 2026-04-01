import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { formatVehicle, formatRONumber } from "@/lib/utils/format";
import { DVI_STATUS_LABELS, DVI_STATUS_COLORS, JOB_STATUS_LABELS, JOB_STATUS_COLORS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Car, StickyNote, ClipboardCheck, Eye } from "lucide-react";
import type { Vehicle, DviStatus, JobStatus } from "@/types";
import { StartInspectionButton } from "@/components/dvi/start-inspection-button";

export async function generateMetadata({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return { title: "Job Not Found | ShopPilot" };
  const vehicle = job.vehicles as Vehicle | null;
  return {
    title: `${vehicle ? formatVehicle(vehicle) : "Job"} — DVI | ShopPilot`,
  };
}

export default async function DviJobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const [job, inspection] = await Promise.all([
    getJob(jobId),
    getInspectionForJob(jobId),
  ]);

  if (!job) notFound();

  const vehicle = job.vehicles as Vehicle | null;
  const dviStatus = inspection?.status as DviStatus | null;

  // Count rated items for progress
  const totalItems = inspection?.dvi_results?.length ?? 0;
  const ratedItems = inspection?.dvi_results?.filter((r: { condition: string | null }) => r.condition !== null).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-10">
      {/* Header */}
      <div className="mb-6">
        <Link href="/dvi">
          <Button variant="ghost" size="sm" className="mb-3">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Jobs
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
              {job.ro_number ? formatRONumber(job.ro_number) : "Job Detail"}
            </span>
            <h2 className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-stone-50">
              {job.title || "Job"}
            </h2>
          </div>
          <span
            className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${JOB_STATUS_COLORS[job.status as JobStatus]?.bg ?? ""} ${JOB_STATUS_COLORS[job.status as JobStatus]?.text ?? ""}`}
          >
            {JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}
          </span>
        </div>
      </div>

      {/* Vehicle */}
      {vehicle && (
        <div className="mb-4 rounded-xl bg-card p-4 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20">
          <div className="flex items-center gap-2 mb-2">
            <Car className="h-3.5 w-3.5 text-stone-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
              Vehicle
            </p>
          </div>
          <p className="text-lg font-bold text-stone-900 dark:text-stone-50">
            {formatVehicle(vehicle)}
          </p>
          <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground mt-1">
            {vehicle.color && <span>{vehicle.color}</span>}
            {vehicle.vin && <span>VIN: {vehicle.vin}</span>}
            {job.mileage_in && <span>{job.mileage_in.toLocaleString()} mi</span>}
          </div>
        </div>
      )}

      {/* Notes */}
      {job.notes && (
        <div className="mb-4 rounded-xl bg-stone-50 dark:bg-stone-800/50 p-4 border-l-4 border-blue-600 dark:border-blue-500">
          <div className="flex items-center gap-2 mb-1">
            <StickyNote className="h-3.5 w-3.5 text-stone-400" />
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
              Primary Complaint
            </p>
          </div>
          <p className="text-sm text-stone-900 dark:text-stone-50 leading-relaxed italic whitespace-pre-wrap">
            {job.notes}
          </p>
        </div>
      )}

      {/* DVI Action */}
      <div className="mt-6 rounded-xl bg-card p-5 shadow-card ring-1 ring-stone-200/10 dark:ring-stone-700/20">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-3.5 w-3.5 text-stone-400" />
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
            Vehicle Inspection
          </p>
          {dviStatus && (
            <span
              className={`ml-auto text-[10px] font-black px-2 py-1 rounded-full uppercase ${DVI_STATUS_COLORS[dviStatus].bg} ${DVI_STATUS_COLORS[dviStatus].text}`}
            >
              {DVI_STATUS_LABELS[dviStatus]}
            </span>
          )}
        </div>

        {!inspection ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              No inspection started for this job
            </p>
            <StartInspectionButton jobId={jobId} />
          </div>
        ) : dviStatus === "in_progress" ? (
          <div>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Progress</span>
                <span>{ratedItems}/{totalItems} items</span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: totalItems > 0 ? `${(ratedItems / totalItems) * 100}%` : "0%" }}
                />
              </div>
            </div>
            <Link href={`/dvi/${jobId}/inspect`}>
              <Button className="w-full">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                Continue Inspection
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground mb-3">
              Inspection {dviStatus === "sent" ? "sent to customer" : "completed"}
            </p>
            <Link href={`/dvi/${jobId}/inspect`}>
              <Button variant="outline">
                <Eye className="mr-2 h-4 w-4" />
                View Inspection
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
