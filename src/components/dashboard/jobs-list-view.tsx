"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { StatusSelect } from "./status-select";
import { JobCard } from "./job-card";
import { formatCustomerName, formatVehicle, formatCurrency, formatRONumber, formatDate } from "@/lib/utils/format";
import { ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { JobStatus } from "@/types";

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
  job_line_items?: { total: number }[];
};

interface JobsListViewProps {
  jobs: JobRow[];
}

function SortableHeader({ column, children }: { column: { toggleSorting: (desc: boolean) => void; getIsSorted: () => false | "asc" | "desc" }; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 text-[10px] font-black uppercase tracking-[0.1em] text-stone-400 dark:text-stone-500 hover:text-stone-900 dark:hover:text-stone-100"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );
}

export function JobsListView({ jobs }: JobsListViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<JobRow>[]>(
    () => [
      {
        accessorKey: "ro_number",
        header: "RO#",
        size: 80,
        cell: ({ row }) => (
          <span className="font-mono text-xs text-stone-400 dark:text-stone-500">
            {formatRONumber(row.original.ro_number)}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <StatusSelect
            jobId={row.original.id}
            currentStatus={row.original.status as JobStatus}
          />
        ),
      },
      {
        id: "customer",
        header: ({ column }) => <SortableHeader column={column}>Customer</SortableHeader>,
        accessorFn: (row) =>
          row.customers
            ? `${row.customers.last_name}, ${row.customers.first_name}`
            : "",
        cell: ({ row }) => {
          const customer = row.original.customers;
          if (!customer) return null;
          const initials = `${customer.first_name?.[0] ?? ""}${customer.last_name?.[0] ?? ""}`.toUpperCase();
          return (
            <Link
              href={`/customers/${customer.id}`}
              className="flex items-center gap-3 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950 text-[10px] font-bold text-blue-700 dark:text-blue-400">
                {initials}
              </div>
              <span className="font-bold text-stone-900 dark:text-stone-50">
                {formatCustomerName(customer)}
              </span>
            </Link>
          );
        },
      },
      {
        id: "vehicle",
        header: "Vehicle",
        accessorFn: (row) =>
          row.vehicles ? formatVehicle(row.vehicles) : "",
        cell: ({ row }) => (
          <span className="text-stone-500 dark:text-stone-400">
            {row.original.vehicles ? formatVehicle(row.original.vehicles) : null}
          </span>
        ),
      },
      {
        id: "job",
        accessorFn: (row) => row.title || "",
        header: ({ column }) => <SortableHeader column={column}>Job</SortableHeader>,
        cell: ({ row }) => (
          <span className="font-medium text-stone-900 dark:text-stone-50">{row.original.title}</span>
        ),
      },
      {
        id: "tech",
        header: "Tech",
        accessorFn: (row) => row.users?.name ?? "",
        cell: ({ row }) => (
          <span className="text-stone-500 dark:text-stone-400">
            {row.original.users?.name ?? null}
          </span>
        ),
      },
      {
        id: "total",
        header: ({ column }) => <SortableHeader column={column}>Total</SortableHeader>,
        accessorFn: (row) =>
          row.job_line_items?.reduce((sum, li) => sum + (li.total || 0), 0) ?? 0,
        cell: ({ row }) => {
          const total = row.original.job_line_items?.reduce(
            (sum, li) => sum + (li.total || 0),
            0
          ) ?? 0;
          return total > 0 ? (
            <span className="font-bold text-stone-900 dark:text-stone-50 tabular-nums">
              {formatCurrency(total)}
            </span>
          ) : null;
        },
      },
      {
        accessorKey: "date_received",
        header: ({ column }) => <SortableHeader column={column}>Date</SortableHeader>,
        cell: ({ row }) => (
          <span className="text-stone-500 dark:text-stone-400 tabular-nums">
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

  return (
    <>
      {/* Mobile: Card list */}
      <div className="lg:hidden">
        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>
            </div>
            <p className="mt-3 text-sm font-medium text-muted-foreground">No jobs found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Try adjusting your filters</p>
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="px-5 py-3 text-[11px] font-bold uppercase tracking-widest text-stone-500 dark:text-stone-400">
                {jobs.length} jobs
              </div>
              <div className="space-y-1 p-2">
                {jobs.map((job) => <JobCard key={job.id} job={job} />)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Desktop: Data table */}
      <div className="hidden lg:block">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-[10px] font-black uppercase tracking-[0.1em] text-stone-400 dark:text-stone-500">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50"
                      onClick={(e) => {
                        // Don't navigate if clicking on status select
                        if ((e.target as HTMLElement).closest("[role='combobox']"))
                          return;
                        window.location.href = `/jobs/${row.original.id}`;
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-32 text-center"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-sm font-medium text-muted-foreground">No jobs found</p>
                        <p className="mt-1 text-xs text-muted-foreground/70">Try adjusting your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
