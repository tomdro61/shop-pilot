"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  formatCustomerName,
  formatVehicle,
  formatCurrency,
  formatDate,
  formatRONumber,
} from "@/lib/utils/format";
import { ArrowUpDown } from "lucide-react";
import { StatusSelect } from "./status-select";
import type { JobStatus } from "@/types";

const STATUS_BORDER: Record<JobStatus, string> = {
  not_started: "border-l-stone-300 dark:border-l-stone-700",
  waiting_for_parts: "border-l-amber-500",
  in_progress: "border-l-blue-500",
  complete: "border-l-emerald-500",
};

type JobRow = {
  id: string;
  status: string;
  title?: string | null;
  category: string | null;
  ro_number: number | null;
  date_received: string;
  date_finished: string | null;
  notes: string | null;
  customers: { id: string; first_name: string; last_name: string; phone: string | null } | null;
  vehicles: { id: string; year: number | null; make: string | null; model: string | null } | null;
  users?: { id: string; name: string } | null;
  job_line_items?: { total: number | null }[];
};

interface JobsListViewProps {
  jobs: JobRow[];
}

function SortHeader({
  column,
  children,
  align = "left",
}: {
  column: { toggleSorting: (desc: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 ${align === "right" ? "justify-end" : ""}`}
    >
      {children}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );
}

function totalForJob(job: JobRow): number {
  return job.job_line_items?.reduce((s, li) => s + (li.total || 0), 0) ?? 0;
}

export function JobsListView({ jobs }: JobsListViewProps) {
  const router = useRouter();
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<JobRow>[]>(
    () => [
      {
        accessorKey: "status",
        header: () => <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Status</span>,
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <StatusSelect
              jobId={row.original.id}
              currentStatus={row.original.status as JobStatus}
            />
          </div>
        ),
      },
      {
        id: "customer",
        accessorFn: (row) => (row.customers ? `${row.customers.last_name}, ${row.customers.first_name}` : ""),
        header: ({ column }) => <SortHeader column={column}>Customer</SortHeader>,
        cell: ({ row }) =>
          row.original.customers ? (
            <span className="text-sm font-medium text-stone-900 dark:text-stone-50">
              {formatCustomerName(row.original.customers)}
            </span>
          ) : (
            <span className="text-sm text-stone-400">—</span>
          ),
      },
      {
        id: "vehicle",
        header: () => <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Vehicle</span>,
        cell: ({ row }) => (
          <span className="text-sm text-stone-600 dark:text-stone-400">
            {row.original.vehicles ? formatVehicle(row.original.vehicles) : "—"}
          </span>
        ),
      },
      {
        id: "job",
        accessorFn: (row) => row.title || "",
        header: ({ column }) => <SortHeader column={column}>Job</SortHeader>,
        cell: ({ row }) => (
          <span className="text-sm text-stone-900 dark:text-stone-50 block max-w-[280px] truncate">
            {row.original.title || "—"}
          </span>
        ),
      },
      {
        id: "tech",
        header: () => <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">Tech</span>,
        cell: ({ row }) => (
          <span className="text-sm text-stone-600 dark:text-stone-400">
            {row.original.users?.name ?? "—"}
          </span>
        ),
      },
      {
        id: "total",
        accessorFn: (row) => totalForJob(row),
        header: ({ column }) => (
          <div className="text-right">
            <SortHeader column={column} align="right">Total</SortHeader>
          </div>
        ),
        cell: ({ row }) => {
          const t = totalForJob(row.original);
          return (
            <div className="text-right">
              {t > 0 ? (
                <span className="font-mono tabular-nums text-sm text-stone-900 dark:text-stone-50">
                  {formatCurrency(t)}
                </span>
              ) : (
                <span className="text-sm text-stone-400">—</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "date_received",
        header: ({ column }) => <SortHeader column={column}>Date</SortHeader>,
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-xs text-stone-500 dark:text-stone-400">
            {formatDate(row.original.date_received)}
          </span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  if (jobs.length === 0) {
    return (
      <div className="border border-stone-200 dark:border-stone-800 bg-card py-12 text-center">
        <p className="text-sm font-medium text-stone-500 dark:text-stone-400">No jobs found</p>
        <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">Try adjusting your filters</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: dense table */}
      <div className="hidden lg:block border border-stone-200 dark:border-stone-800 bg-card">
        <table className="w-full border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/40">
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-3 py-2 border-l-2 border-l-transparent first:pl-[calc(0.75rem-2px)]">
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const s = row.original.status as JobStatus;
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/jobs/${row.original.id}`)}
                  className={`cursor-pointer border-b border-stone-200 dark:border-stone-800 last:border-b-0 border-l-2 ${STATUS_BORDER[s]} hover:bg-stone-50 dark:hover:bg-stone-800/40`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: dense stacked rows */}
      <div className="lg:hidden border border-stone-200 dark:border-stone-800 bg-card divide-y divide-stone-200 dark:divide-stone-800">
        {jobs.map((job) => {
          const s = job.status as JobStatus;
          const c = job.customers;
          const t = totalForJob(job);
          return (
            <div
              key={job.id}
              onClick={() => router.push(`/jobs/${job.id}`)}
              className={`cursor-pointer px-3 py-2.5 border-l-2 ${STATUS_BORDER[s]} hover:bg-stone-50 dark:hover:bg-stone-800/40 transition-colors`}
            >
              <div className="flex items-center justify-between gap-2">
                <div onClick={(e) => e.stopPropagation()}>
                  <StatusSelect jobId={job.id} currentStatus={s} />
                </div>
                <span className="font-mono text-[11px] text-stone-400 tabular-nums">
                  {job.ro_number ? formatRONumber(job.ro_number) : ""}
                </span>
              </div>
              <div className="mt-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900 dark:text-stone-50 truncate">
                    {c ? formatCustomerName(c) : "—"}
                  </div>
                  <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                    {job.vehicles ? formatVehicle(job.vehicles) : ""}{job.title ? ` · ${job.title}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {t > 0 && (
                    <div className="font-mono tabular-nums text-sm font-medium text-stone-900 dark:text-stone-50">
                      {formatCurrency(t)}
                    </div>
                  )}
                  <div className="font-mono tabular-nums text-[10px] text-stone-400">
                    {formatDate(job.date_received)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
