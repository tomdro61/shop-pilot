import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getEstimates } from "@/lib/actions/estimates";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/layout/page-shell";
import {
  ESTIMATE_STATUS_COLORS,
  ESTIMATE_STATUS_LABELS,
} from "@/lib/constants";
import {
  formatCustomerName,
  formatCurrencyWhole,
  formatVehicle,
} from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import type { EstimateStatus } from "@/types";

export const metadata = {
  title: "Estimates | ShopPilot",
};

const FILTER_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

function ageDays(createdAt: string): number {
  const now = Date.now();
  const then = new Date(createdAt).getTime();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

export default async function EstimatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  // Allowlist the URL param before casting to EstimateStatus — a garbage
  // value like ?status=foo would otherwise cast through and render
  // "No undefined estimates" via ESTIMATE_STATUS_LABELS[undefined].
  const VALID_STATUSES: EstimateStatus[] = ["draft", "sent", "approved", "declined"];
  const { status } = await searchParams;
  const effectiveStatus =
    status && VALID_STATUSES.includes(status as EstimateStatus)
      ? (status as EstimateStatus)
      : undefined;

  const estimates = await getEstimates({ status: effectiveStatus });

  return (
    <PageShell width="wide">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="text-base lg:text-lg font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Estimates
            </h1>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Quotes you&apos;ve created — convert approved ones to jobs.
            </p>
          </div>
        </div>
        <Link href="/estimates/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Estimate
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-1 p-1 rounded-md bg-stone-100 dark:bg-stone-800 w-fit">
        {FILTER_TABS.map((tab) => {
          const active =
            (tab.value === "all" && !effectiveStatus) ||
            tab.value === effectiveStatus;
          const href = tab.value === "all" ? "/estimates" : `/estimates?status=${tab.value}`;
          return (
            <Link
              key={tab.value}
              href={href}
              className={cn(
                "inline-flex items-center h-7 px-3 rounded text-xs font-medium transition-colors",
                active
                  ? "bg-card text-stone-900 dark:text-stone-50 shadow-card"
                  : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="bg-card border border-stone-200 dark:border-stone-800 rounded-md shadow-card overflow-hidden">
        {estimates.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {effectiveStatus
                ? `No ${ESTIMATE_STATUS_LABELS[effectiveStatus].toLowerCase()} estimates`
                : "No estimates yet"}
            </p>
            <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
              Create one from a customer&apos;s page or click New Estimate above.
            </p>
          </div>
        ) : (
          estimates.map((est) => {
            const estStatus = est.status as EstimateStatus;
            const colors = ESTIMATE_STATUS_COLORS[estStatus];
            const customer = est.customers as {
              id: string;
              first_name: string;
              last_name: string;
            } | null;
            const vehicle = est.vehicles as {
              year: number | null;
              make: string | null;
              model: string | null;
            } | null;
            const lineItems = (est.estimate_line_items || []) as { total: number | null }[];
            const total = lineItems.reduce((s, li) => s + (li.total ?? 0), 0);
            const days = ageDays(est.created_at);
            const estimateNum = est.estimate_number
              ? `EST-${String(est.estimate_number).padStart(4, "0")}`
              : "—";

            return (
              <Link
                key={est.id}
                href={`/estimates/${est.id}`}
                className="relative flex items-center gap-3 px-4 py-3 border-b border-stone-200 dark:border-stone-800 last:border-b-0 hover:bg-stone-50 dark:hover:bg-stone-800/40"
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r bg-indigo-500"
                />
                <span
                  aria-hidden
                  className="w-7 h-7 rounded-md grid place-items-center border bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900 flex-none"
                >
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono tabular-nums text-[11px] text-stone-400 dark:text-stone-500">
                    {estimateNum}
                    <span className="mx-1.5 text-stone-300 dark:text-stone-700">·</span>
                    {days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`}
                  </div>
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-50 mt-0.5 truncate">
                    {customer ? formatCustomerName(customer) : "Unknown customer"}
                    {vehicle && (
                      <span className="ml-2 text-stone-500 dark:text-stone-400 font-normal">
                        · {formatVehicle(vehicle)}
                      </span>
                    )}
                    {est.job_id && (
                      <span className="ml-2 text-xs font-normal text-stone-500 dark:text-stone-400">
                        → linked to job
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${colors.bg} ${colors.text}`}
                >
                  {ESTIMATE_STATUS_LABELS[estStatus]}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50 w-20 text-right">
                  {total > 0 ? formatCurrencyWhole(total) : <span className="text-stone-400 font-normal">—</span>}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </PageShell>
  );
}
