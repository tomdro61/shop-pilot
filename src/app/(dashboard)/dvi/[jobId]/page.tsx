import { notFound } from "next/navigation";
import Link from "next/link";
import { getJob } from "@/lib/actions/jobs";
import { getInspectionForJob } from "@/lib/actions/dvi";
import { formatVehicle, formatRONumber } from "@/lib/utils/format";
import {
  DVI_STATUS_LABELS,
  DVI_STATUS_COLORS,
  JOB_STATUS_LABELS,
  JOB_STATUS_COLORS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Car, StickyNote, ClipboardCheck, Eye } from "lucide-react";
import type { Vehicle, DviStatus, JobStatus } from "@/types";
import { StartInspectionButton } from "@/components/dvi/start-inspection-button";
import { PageShell } from "@/components/layout/page-shell";
import { TONE_CLASSES } from "@/lib/ui/alert-tone";

const TILE = "bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card";
const CARD_LABEL =
  "text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300";

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
  const ratedItems =
    inspection?.dvi_results?.filter((r: { condition: string | null }) => r.condition !== null)
      .length ?? 0;

  const jobStatusColors = JOB_STATUS_COLORS[job.status as JobStatus];

  return (
    <PageShell width="narrow">
      <div>
        <Link href="/dvi">
          <Button variant="ghost" size="sm" className="-ml-3">
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
            DVI
          </Button>
        </Link>
      </div>

      {/* Page header — RO + title + job status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono tabular-nums text-[11px] tracking-wide text-stone-500 dark:text-stone-400">
            {job.ro_number ? formatRONumber(job.ro_number) : "Job Detail"}
          </div>
          <h1 className="mt-1 text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50 truncate">
            {job.title || "Job"}
          </h1>
        </div>
        <span
          className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-md uppercase ${jobStatusColors?.bg ?? ""} ${jobStatusColors?.text ?? ""}`}
        >
          {JOB_STATUS_LABELS[job.status as JobStatus] ?? job.status}
        </span>
      </div>

      {/* Vehicle */}
      {vehicle && (
        <div className={`${TILE} p-4`}>
          <div className="flex items-center gap-2 mb-2.5">
            <span
              className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.indigo.tile}`}
            >
              <Car className="h-3.5 w-3.5" />
            </span>
            <p className={CARD_LABEL}>Vehicle</p>
          </div>
          <p className="text-base font-semibold text-stone-900 dark:text-stone-50">
            {formatVehicle(vehicle)}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-stone-500 dark:text-stone-400">
            {vehicle.color && <span className="capitalize">{vehicle.color}</span>}
            {vehicle.vin && (
              <span className="font-mono tabular-nums">VIN: {vehicle.vin}</span>
            )}
            {job.mileage_in && (
              <span className="font-mono tabular-nums">
                {job.mileage_in.toLocaleString()} mi
              </span>
            )}
          </div>
        </div>
      )}

      {/* Primary Complaint — alert-card style */}
      {job.notes && (
        <div
          className={`relative rounded-md border p-4 shadow-card ${TONE_CLASSES.blue.card}`}
        >
          <span
            aria-hidden
            className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${TONE_CLASSES.blue.bar}`}
          />
          <div className="flex items-center gap-2 mb-2 pl-1">
            <span
              className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.blue.tile}`}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </span>
            <p className={CARD_LABEL}>Primary Complaint</p>
          </div>
          <p className="pl-1 text-sm text-stone-900 dark:text-stone-50 leading-relaxed italic whitespace-pre-wrap">
            {job.notes}
          </p>
        </div>
      )}

      {/* Inspection */}
      <div className={`${TILE} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`w-7 h-7 rounded-md grid place-items-center border flex-none ${TONE_CLASSES.violet.tile}`}
          >
            <ClipboardCheck className="h-3.5 w-3.5" />
          </span>
          <p className={CARD_LABEL}>Vehicle Inspection</p>
          {dviStatus && (
            <span
              className={`ml-auto text-[10px] font-black px-2 py-1 rounded-md uppercase ${DVI_STATUS_COLORS[dviStatus].bg} ${DVI_STATUS_COLORS[dviStatus].text}`}
            >
              {DVI_STATUS_LABELS[dviStatus]}
            </span>
          )}
        </div>

        {!inspection ? (
          <div className="text-center py-4">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
              No inspection started for this job
            </p>
            <StartInspectionButton jobId={jobId} />
          </div>
        ) : dviStatus === "in_progress" ? (
          <div>
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400 mb-1">
                <span>Progress</span>
                <span className="font-mono tabular-nums">
                  {ratedItems}/{totalItems} items
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{
                    width: totalItems > 0 ? `${(ratedItems / totalItems) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
            <Link href={`/dvi/${jobId}/inspect`}>
              <Button className="w-full">
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                Continue Inspection
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
              Inspection{" "}
              {dviStatus === "approved"
                ? "approved by customer"
                : dviStatus === "sent"
                  ? "sent to customer"
                  : "completed"}
            </p>
            <Link href={`/dvi/${jobId}/inspect`}>
              <Button variant="outline">
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                View Inspection
              </Button>
            </Link>
          </div>
        )}
      </div>
    </PageShell>
  );
}
